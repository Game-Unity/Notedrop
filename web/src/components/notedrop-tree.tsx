import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderInput, GripVertical, LayersPlus, Pencil, Plus } from "lucide-react";
import { api, type DeckNode } from "@/lib/api";
import { childrenOf, clashes, leafOf, moveDeck, MoveDeckDialog, parentOf } from "@/components/move-deck";
import { navigate } from "@/lib/router";
import { cachedDeckList, cachedProgress, invalidateProgress, loadDeckList, loadProgress, onDeckListUpdated, onProgressInvalidated, relatedDecks, type NoteDropProgress } from "@/lib/notedrop-progress";
import { cn } from "@/lib/utils";
import { DeckContextMenu, useDeckActions, type DeckMenuEntry } from "@/components/deck-actions";
import { NewDeckDialog } from "@/components/new-deck-dialog";
import { useDeckTreeDrag } from "@/components/deck-tree-drag";
import { TooltipHint } from "@/components/ui/tooltip";

function formatCount(value: number | null) {
  return (value ?? 0).toLocaleString("de-DE");
}

export function NoteDropTree({ deckName, dataKey }: { deckName: string; dataKey: number }) {
  const [decks, setDecks] = useState<DeckNode[] | null>(() => cachedDeckList()?.filter((deck) => !deck.archived) ?? null);
  const [deckError, setDeckError] = useState<string | null>(null);
  const dataKeyRef = useRef(dataKey);
  const deckRequestId = useRef(0);
  const deckByName = useMemo(() => new Map((decks ?? []).map((deck) => [deck.name, deck])), [decks]);
  const rootName = deckName.split("::")[0];
  const root = deckByName.get(rootName);
  const activeDeck = deckByName.get(deckName);
  const activeNameRef = useRef(deckName);
  activeNameRef.current = deckName;

  const refreshDecks = useCallback(async (force = false) => {
    const requestId = ++deckRequestId.current;
    try {
      const value = await loadDeckList(force);
      if (requestId === deckRequestId.current) {
        setDecks(value.filter((deck) => !deck.archived));
        setDeckError(null);
      }
    } catch (error) {
      if (requestId === deckRequestId.current) setDeckError((error as Error).message);
    }
  }, []);

  useEffect(() => {
    const cached = cachedDeckList()?.filter((deck) => !deck.archived) ?? null;
    const dataChanged = dataKeyRef.current !== dataKey;
    dataKeyRef.current = dataKey;
    void refreshDecks(dataChanged || !cached?.some((deck) => deck.name === deckName));
    const unsubscribe = onDeckListUpdated((value) => {
      setDecks(value.filter((deck) => !deck.archived));
      setDeckError(null);
    });
    const refresh = () => void refreshDecks(true);
    const onVisibility = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshDecks, dataKey, deckName]);

  const pendingAction = useRef<string | null>(null);
  const onActionChanged = useCallback(async () => {
    const affected = pendingAction.current;
    pendingAction.current = null;
    await refreshDecks(true);
    if (affected && (activeNameRef.current === affected || activeNameRef.current.startsWith(`${affected}::`))) {
      navigate(`/deck?name=${encodeURIComponent(rootName)}`);
    }
  }, [refreshDecks, rootName]);
  const deckActions = useDeckActions(onActionChanged);
  const [creating, setCreating] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const moveSource = useRef<string | null>(null);
  const rowElements = useRef(new Map<string, HTMLDivElement>());

  const remapActive = (from: string, to: string) => {
    const active = activeNameRef.current;
    if (active === from || active.startsWith(`${from}::`)) {
      navigate(`/deck?name=${encodeURIComponent(`${to}${active.slice(from.length)}`)}`);
    }
  };
  const place = async (name: string, parent: string, index: number | undefined, focus = false) => {
    let previousName = name;
    await moveDeck(decks ?? [], name, parent, index, (newName) => {
      remapActive(previousName, newName);
      previousName = newName;
      void refreshDecks(true).then(() => focus && requestAnimationFrame(() => rowElements.current.get(newName)?.querySelector<HTMLElement>("[data-grip]")?.focus()));
    }, rootName);
  };

  const treeRows = useMemo(() => {
    if (!decks || !root) return [];
    const rows: { name: string; depth: number }[] = [];
    const visit = (parent: string, depth: number) => {
      for (const name of childrenOf(decks, parent)) {
        rows.push({ name, depth });
        visit(name, depth + 1);
      }
    };
    visit(root.name, 0);
    return rows;
  }, [decks, root]);
  const treeDrag = useDeckTreeDrag({ decks: decks ?? [], rows: treeRows, scopeRoot: rootName, onMove: place });
  const moveDialogDone = (newName: string) => {
    const oldName = moveSource.current;
    moveSource.current = null;
    if (oldName) remapActive(oldName, newName);
    void refreshDecks(true);
  };

  const [progress, setProgress] = useState<{ deck: string; value: NoteDropProgress } | null>(null);
  const [progressError, setProgressError] = useState<{ deck: string; message: string } | null>(null);

  useEffect(() => {
    if (!activeDeck) {
      setProgress(null);
      setProgressError(null);
      return;
    }

    let live = true;
    const total = activeDeck.cards;
    const newCards = activeDeck.unseen;
    const cached = cachedProgress(deckName, total, newCards);
    setProgress(cached ? { deck: deckName, value: cached } : null);
    setProgressError(null);

    const refresh = async (force = false) => {
      try {
        const value = await loadProgress(deckName, total, newCards, force);
        if (live) {
          setProgress({ deck: deckName, value });
          setProgressError(null);
        }
      } catch (error) {
        if (live) setProgressError({ deck: deckName, message: (error as Error).message });
      }
    };
    const onInvalidated = (changedDeck?: string) => {
      if (!changedDeck || relatedDecks(deckName, changedDeck)) {
        void (async () => {
          try {
            await refreshDecks(true);
            const latestDecks = (await loadDeckList()).filter((deck) => !deck.archived);
            if (!live) return;
            const latest = latestDecks.find((deck) => deck.name === deckName);
            if (!latest) return;
            const value = await loadProgress(deckName, latest.cards, latest.unseen, true);
            if (live) {
              setProgress({ deck: deckName, value });
              setProgressError(null);
            }
          } catch (error) {
            if (live) setProgressError({ deck: deckName, message: (error as Error).message });
          }
        })();
      }
    };
    const unsubscribe = onProgressInvalidated(onInvalidated);
    const onFocus = () => void refresh(true);
    const onVisibility = () => document.visibilityState === "visible" && onFocus();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    void refresh();
    return () => {
      live = false;
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeDeck?.cards, activeDeck?.unseen, deckName, refreshDecks]);

  if (!deckName || (!activeDeck && !deckError && decks)) return null;

  return (
    <nav id="notedrop-tree" className="nd-tree-shell" aria-label="Deck navigation">
      {deckError ? (
        <p role="alert" className="nd-tree-error">Deck navigation could not be loaded: {deckError}</p>
      ) : !decks || !root || !activeDeck ? (
        <div className="nd-tree-loading" aria-label="Loading deck navigation" />
      ) : (
        <>
          <div className="nd-item-editor-tabs-nav mb-3 shrink-0">
            <h2 className="min-w-0 flex-1 text-sm font-semibold">Deck</h2>
            <TooltipHint label={`Create subdeck in ${leafOf(root.name)}`}><button
              type="button"
              className="nd-types-sidebar-add flex size-8 items-center justify-center rounded-md transition-colors"
              aria-label={`Create subdeck in ${leafOf(root.name)}`}
              onClick={() => setCreating(root.name)}
            >
              <LayersPlus className="size-4" aria-hidden="true" />
            </button></TooltipHint>
          </div>
          <TooltipHint label={root.name} side="left"><button
            type="button"
            className={cn("nd-tree-row nd-tree-root shrink-0", activeDeck.name === root.name && "is-active")}
            aria-label={`Open ${leafOf(root.name)}`}
            aria-current={activeDeck.name === root.name ? "page" : undefined}
            onClick={() => navigate(`/deck?name=${encodeURIComponent(root.name)}`)}
          >
            <span className="nd-tree-badge nd-tree-root-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 2 8 4-8 4-8-4 8-4Z" />
                <path d="m4 10 8 4 8-4" />
                <path d="m4 14 8 4 8-4" />
              </svg>
            </span>
            <span className="nd-tree-label">{leafOf(root.name)}</span>
          </button></TooltipHint>
          <h3 className="mt-4 mb-1.5 shrink-0 text-sm font-medium">Chapters</h3>
          <div className="nd-tree-content" ref={treeDrag.setListRef}>
            {childrenOf(decks, root.name).map((name, index) => {
              const child = deckByName.get(name);
              return child ? (
                <TreeNode
                  key={name}
                  deck={child}
                  decks={decks}
                  activeName={activeDeck.name}
                  path={[index + 1]}
                  rootName={root.name}
                  treeDrag={treeDrag}
                  rowElements={rowElements}
                  disabled={deckActions.busy}
                  onCreate={setCreating}
                  onMove={(target) => { moveSource.current = target; setMoving(target); }}
                  onArchive={(target) => { pendingAction.current = target; void deckActions.archive(target, true); }}
                  onDelete={(target) => { pendingAction.current = target; void deckActions.requestDelete(target); }}
                />
              ) : null;
            })}
            {treeDrag.drag?.drop && !treeDrag.isNoop(treeDrag.drag.name, treeDrag.drag.drop) && treeDrag.drag.drop.kind === "line" && (
              <div
                aria-hidden
                className={cn("nd-tree-drop-line", treeDrag.blocked(treeDrag.drag.name, treeDrag.drag.drop) && "is-blocked")}
                style={{ top: treeDrag.dropTop(treeDrag.drag.drop), left: `calc(1.75rem + ${treeDrag.drag.drop.depth * 1.75}rem)` }}
              >
                <span />
              </div>
            )}
          </div>
          <MasteryProgress progress={progress?.deck === deckName ? progress.value : null} error={progressError?.deck === deckName ? progressError.message : null} />
        </>
      )}
      {treeDrag.drag && (
        <div aria-hidden className="nd-tree-drag-overlay" style={{ left: treeDrag.drag.x, top: treeDrag.drag.y }}>
          <GripVertical aria-hidden="true" />
          <span>{leafOf(treeDrag.drag.name)}</span>
        </div>
      )}
      {treeDrag.drag?.drop && !treeDrag.isNoop(treeDrag.drag.name, treeDrag.drag.drop) && (
        <div aria-live="polite" className={cn("nd-tree-drag-status", treeDrag.blocked(treeDrag.drag.name, treeDrag.drag.drop) && "is-blocked")}>
          {treeDrag.blocked(treeDrag.drag.name, treeDrag.drag.drop)
            ? `${leafOf(treeDrag.drag.drop.parent)} already has a ${leafOf(treeDrag.drag.name)}`
            : treeDrag.drag.drop.parent === parentOf(treeDrag.drag.name)
              ? "Reorder"
              : <>Into <span>{leafOf(treeDrag.drag.drop.parent)}</span></>}
        </div>
      )}
      <MoveDeckDialog
        deck={moving}
        decks={decks ?? []}
        scopeRoot={rootName}
        onOpenChange={(open) => {
          if (!open) setMoving(null);
        }}
        onMoved={moveDialogDone}
      />
      <NewDeckDialog
        open={creating !== null}
        parent={creating ?? undefined}
        onOpenChange={(open) => !open && setCreating(null)}
        onDone={async (createdName) => {
          setCreating(null);
          if (parentOf(createdName) === rootName) {
            const order = [...childrenOf(decks ?? [], rootName), createdName];
            await api.reorderDecks(rootName, order);
          }
          invalidateProgress();
          await refreshDecks(true);
        }}
      />
      {deckActions.deleteDialog}
    </nav>
  );
}

function TreeNode({ deck, decks, activeName, path, rootName, treeDrag, rowElements, disabled, onCreate, onMove, onArchive, onDelete }: {
  deck: DeckNode;
  decks: DeckNode[];
  activeName: string;
  path: number[];
  rootName: string;
  treeDrag: ReturnType<typeof useDeckTreeDrag>;
  rowElements: React.RefObject<Map<string, HTMLDivElement>>;
  disabled: boolean;
  onCreate(name: string): void;
  onMove(name: string): void;
  onArchive(name: string): void;
  onDelete(name: string): void;
}) {
  const active = deck.name === activeName;
  const children = childrenOf(decks, deck.name);
  const open = () => navigate(`/deck?name=${encodeURIComponent(deck.name)}`);
  const dragged = treeDrag.isDragged(deck.name);
  const target = treeDrag.isTarget(deck.name);
  const targetBlocked = Boolean(target && treeDrag.drag?.drop && treeDrag.blocked(treeDrag.drag.name, treeDrag.drag.drop));
  const menu = {
    name: deck.name,
    disabled,
    onArchive: () => onArchive(deck.name),
    onDelete: () => onDelete(deck.name),
    extra: [
      { icon: <Plus />, label: "New subdeck", onSelect: () => onCreate(deck.name) },
      { icon: <FolderInput />, label: "Move to…", onSelect: () => onMove(deck.name) },
      { icon: <Pencil />, label: "Rename", onSelect: () => navigate(`/deck?name=${encodeURIComponent(deck.name)}&rename=1&treeRoot=${encodeURIComponent(rootName)}`) },
    ] satisfies DeckMenuEntry[],
  };
  return (
    <div className="nd-tree-group">
      <DeckContextMenu {...menu}>
        <div
          ref={(element) => {
            if (element) rowElements.current.set(deck.name, element);
            else rowElements.current.delete(deck.name);
            treeDrag.setRowRef(deck.name, element);
          }}
          className={cn("nd-tree-row", active && "is-active", dragged && "is-dragged", target && !targetBlocked && "is-drop-target", targetBlocked && "is-drop-blocked")}
        >
          <TooltipHint label={deck.name} side="left"><button
            type="button"
            data-grip
            className="nd-tree-row-link"
            aria-current={active ? "page" : undefined}
            aria-description="Drag onto a chapter or between rows. Arrow keys reorder, Alt+arrows change level."
            onPointerDown={(event) => treeDrag.startDrag(deck.name, event, 5)}
            onKeyDown={(event) => treeDrag.keyMove(deck.name, event)}
            onClick={(event) => {
              if (treeDrag.consumeDragClick()) event.preventDefault();
              else open();
            }}
          >
            <span className="nd-tree-badge" aria-hidden="true">{path.join(".")}</span>
            <span className="nd-tree-label">{leafOf(deck.name)}</span>
          </button></TooltipHint>
        </div>
      </DeckContextMenu>
      {children.length > 0 && (
        <div className="nd-tree-children">
          {children.map((name, index) => {
            const child = decks.find((item) => item.name === name);
            return child ? (
              <TreeNode
                key={name}
                deck={child}
                decks={decks}
                activeName={activeName}
                path={[...path, index + 1]}
                rootName={rootName}
                treeDrag={treeDrag}
                rowElements={rowElements}
                disabled={disabled}
                onCreate={onCreate}
                onMove={onMove}
                onArchive={onArchive}
                onDelete={onDelete}
              />
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

function MasteryProgress({ progress, error }: { progress: NoteDropProgress | null; error: string | null }) {
  return (
    <section className="nd-progress" aria-label="Deck mastery">
      <div className="nd-progress-heading">
        <span className="nd-progress-label">Mastery Progress</span>
        <span className="nd-progress-value">{progress?.percent ?? 0}%</span>
      </div>
      <progress className="nd-progress-bar" max={100} value={progress?.percent ?? 0} aria-label="Mastery Progress" />
      <div className="nd-progress-metrics">
        <Metric name="new" value={formatCount(progress?.new ?? null)} />
        <Metric name="learning" value={formatCount(progress?.learning ?? null)} />
        <Metric name="mastered" value={formatCount(progress?.mastered ?? null)} />
      </div>
      {error && <span className="nd-progress-error" role="status">Progress refresh failed: {error}</span>}
    </section>
  );
}

function Metric({ name, value }: { name: string; value: string }) {
  return (
    <div className="nd-metric">
      <span className="nd-metric-value">{value}</span>
      <span className="nd-metric-label">{name[0].toUpperCase() + name.slice(1)}</span>
    </div>
  );
}

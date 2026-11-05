import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeckNode } from "@/lib/api";
import { childrenOf, leafOf } from "@/components/move-deck";
import { navigate } from "@/lib/router";
import { cachedDeckList, cachedProgress, loadDeckList, loadProgress, onDeckListUpdated, onProgressInvalidated, relatedDecks, type NoteDropProgress } from "@/lib/notedrop-progress";
import { cn } from "@/lib/utils";

const RADIUS = 63;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function formatCount(value: number | null) {
  return value == null ? "–" : value.toLocaleString("de-DE");
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
          <MasteryProgress progress={progress?.deck === deckName ? progress.value : null} error={progressError?.deck === deckName ? progressError.message : null} />
          <div className="nd-tree-header">
            <button
              type="button"
              className={cn("nd-tree-row nd-tree-root", activeDeck.name === root.name && "is-active")}
              title={root.name}
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
              <span className="nd-tree-label">Chapters {leafOf(root.name)}</span>
            </button>
          </div>
          <div className="nd-tree-content">
            {childrenOf(decks, root.name).map((name, index) => {
              const child = deckByName.get(name);
              return child ? <TreeNode key={name} deck={child} decks={decks} activeName={activeDeck.name} path={[index + 1]} /> : null;
            })}
          </div>
        </>
      )}
    </nav>
  );
}

function TreeNode({ deck, decks, activeName, path }: { deck: DeckNode; decks: DeckNode[]; activeName: string; path: number[] }) {
  const active = deck.name === activeName;
  const children = childrenOf(decks, deck.name);
  const open = () => navigate(`/deck?name=${encodeURIComponent(deck.name)}`);
  return (
    <div className="nd-tree-group">
      <button
        type="button"
        className={cn("nd-tree-row", active && "is-active")}
        title={deck.name}
        aria-current={active ? "page" : undefined}
        onClick={open}
      >
        <span className="nd-tree-badge" aria-hidden="true">{path.join(".")}</span>
        <span className="nd-tree-label">{leafOf(deck.name)}</span>
      </button>
      {children.length > 0 && (
        <div className="nd-tree-children">
          {children.map((name, index) => {
            const child = decks.find((item) => item.name === name);
            return child ? <TreeNode key={name} deck={child} decks={decks} activeName={activeName} path={[...path, index + 1]} /> : null;
          })}
        </div>
      )}
    </div>
  );
}

function MasteryProgress({ progress, error }: { progress: NoteDropProgress | null; error: string | null }) {
  const masteredLength = progress ? (progress.percent / 100) * CIRCUMFERENCE : 0;
  return (
    <section className="nd-progress" aria-label="Deck mastery">
      <div className="nd-progress-chart">
        <svg viewBox="0 0 160 160" aria-hidden="true">
          <circle className="nd-progress-track" cx="80" cy="80" r={RADIUS} />
          <circle
            className="nd-progress-fill"
            cx="80"
            cy="80"
            r={RADIUS}
            transform="rotate(-90 80 80)"
            style={{ strokeDasharray: `${masteredLength} ${CIRCUMFERENCE}` }}
          />
        </svg>
        <div className="nd-progress-center">
          <span className="nd-progress-value">{progress ? `${progress.percent}%` : "–%"}</span>
          <span className="nd-progress-label">Mastered</span>
        </div>
      </div>
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

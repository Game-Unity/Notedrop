import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpLeft, ArrowUpToLine, CalendarClock, ChevronRight, Eye, FastForward, FolderInput, GripVertical, Pencil, Play, Plus, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, relative, type DeckNode } from "@/lib/api";
import { ARCHIVE_ORDERS, archiveRoot, archiveRootSearch, matchesArchiveSearch, sortArchiveDecks, type ArchiveOrder } from "@/lib/archive-search";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { EmptyState, Page, PageHeader, Section } from "@/components/page";
import { childrenOf, clashes, leafOf, moveDeck, MoveDeckDialog, parentOf } from "@/components/move-deck";
import { usePhone } from "@/lib/phone";
import { PhoneDecks } from "@/components/phone-decks";
import { DeckContextMenu, type DeckMenuEntry, useDeckActions } from "@/components/deck-actions";
import { invalidateProgress } from "@/lib/notedrop-progress";
import { useDeckTreeDrag } from "@/components/deck-tree-drag";
import { NewDeckDialog } from "@/components/new-deck-dialog";
import { DeckOverviewTiles } from "@/components/deck-overview-tiles";

function ancestorsOf(name: string) {
  const parts = name.split("::");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("::"));
}

export function DecksPage({ archived = false }: { archived?: boolean }) {
  return usePhone() && !archived ? <PhoneDecks /> : <DesktopDecks archived={archived} />;
}

function DesktopDecks({ archived }: { archived: boolean }) {
  const [decks, setDecks] = useState<(DeckNode & { displayDepth: number })[] | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem("etude.collapsed") ?? "[]")));
  const [creating, setCreating] = useState(false);
  const [archiveQuery, setArchiveQuery] = useState("");
  const [archiveOrder, setArchiveOrder] = useState<ArchiveOrder>("default");

  const reload = () => {
    invalidateProgress();
    return api.decks(archived).then((all) => {
      const filtered = all.filter((d) => d.archived === archived);
      const names = new Set(filtered.map((d) => d.name));
      setDecks(filtered.map((d) => ({ ...d, displayDepth: ancestorsOf(d.name).filter((n) => names.has(n)).length })));
    }).catch((e) => toast.error(e.message));
  };
  const deckActions = useDeckActions(reload);
  useEffect(() => {
    reload();
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const toggle = (name: string) => {
    const next = new Set(collapsed);
    next.has(name) ? next.delete(name) : next.add(name);
    setCollapsed(next);
    localStorage.setItem("etude.collapsed", JSON.stringify([...next]));
  };

  const visible = useMemo(() => {
    if (!decks) return [];
    const names = new Set(decks.map((d) => d.name));
    const hasChildren = new Set<string>();
    for (const d of decks) {
      const parent = ancestorsOf(d.name).findLast((n) => names.has(n));
      if (parent) hasChildren.add(parent);
    }
    return decks
      .filter((d) => {
        return archived || !ancestorsOf(d.name).some((n) => names.has(n) && collapsed.has(n));
      })
      .map((d) => ({ ...d, hasChildren: hasChildren.has(d.name) }));
  }, [decks, collapsed, archived]);

  const archiveRoots = useMemo(() => [...new Set((decks ?? []).map((deck) => archiveRoot(deck.name)))], [decks]);
  const archiveResults = sortArchiveDecks(visible.filter((deck) => matchesArchiveSearch(deck.name, archiveQuery)), archiveOrder);
  const due = (decks ?? []).filter((d) => d.displayDepth === 0).reduce((a, d) => a + d.new + d.learning + d.review, 0);

  // ------------------------------------------------------------ moving
  const rows = useRef(new Map<string, HTMLDivElement>());
  const listRef = useRef<HTMLDivElement>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const after = (focus?: string) => {
    reload().then(() => focus && requestAnimationFrame(() => rows.current.get(focus)?.querySelector<HTMLElement>("[data-grip]")?.focus()));
  };
  const place = async (name: string, parent: string, index: number | undefined, focus = false) => {
    if (parent && collapsed.has(parent)) toggle(parent);
    await moveDeck(decks ?? [], name, parent, index, (n) => after(focus ? n : undefined));
  };
  const treeDrag = useDeckTreeDrag({
    decks: decks ?? [],
    rows: visible.map((deck) => ({ name: deck.name, depth: deck.displayDepth })),
    collapsed,
    onToggle: toggle,
    onMove: place,
  });
  const { drag } = treeDrag;

  return (
    <Page>
      <PageHeader
        title={archived ? "Archived Decks" : "Decks"}
        crumbs={[{ label: archived ? "Archived" : "Decks", onClick: () => navigate(archived ? "/archive" : "/") }]}
        description={archived ? "Cards and review history are kept. Move a deck out of the archive to study it again." : decks ? (due ? `${due} cards to study today` : "Nothing due right now") : "\u00a0"}
        actions={!archived &&
          <>
            <ImportButton onDone={reload} />
            <Button variant="default" size="sm" className="gap-1.5" onClick={() => setCreating(true)}><Plus className="size-4" />New deck</Button>
          </>
        }
      />

      {!archived && decks && decks.length === 0 && (
        <EmptyState title="No decks yet" action={<Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCreating(true)}><Plus className="size-4" />New deck</Button>}>
          Import a pack or create a deck to start.
        </EmptyState>
      )}

      {archived && (
        <div className={cn("flex flex-col", decks && decks.length > 0 && "mb-3 gap-2.5")}>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={archiveQuery} onChange={(e) => setArchiveQuery(e.target.value)} placeholder="Search archived decks" aria-label="Search archived decks" className={cn("h-10 pl-9", archiveQuery && "pr-10")} />
              {archiveQuery && <button className="absolute top-1 right-1 flex size-8 items-center justify-center rounded text-muted-foreground hover:text-foreground" onClick={() => setArchiveQuery("")} aria-label="Clear search"><X className="size-4" /></button>}
            </div>
            <Select value={archiveOrder} onValueChange={(value) => {
              const order = ARCHIVE_ORDERS.find(([key]) => key === value);
              if (order) setArchiveOrder(order[0]);
            }}>
              <SelectTrigger aria-label="Sort archived decks" className="!h-10 w-auto max-w-[45%] gap-1.5 border border-input bg-transparent px-3 text-[13px] font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ARCHIVE_ORDERS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {archiveRoots.length > 0 && <div className="flex flex-wrap gap-1.5">
            {archiveRoots.map((root) => (
              <button key={root} type="button" onClick={() => setArchiveQuery((query) => query ? `${query} ${archiveRootSearch(root)}` : archiveRootSearch(root))} className="h-7 rounded-md border px-2 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground pointer-coarse:h-9 pointer-coarse:px-2.5">{root}</button>
            ))}
          </div>}
        </div>
      )}

      {archived && decks && (
        <Section bare={archived}>
          <div ref={(element) => { listRef.current = element; treeDrag.setListRef(element); }} className={cn("relative", archived && "flex flex-col gap-3")}>
          {decks.length > 0 && <div className={cn("items-center text-xs font-medium text-muted-foreground", archived ? "nd-deck-cards-toolbar grid min-h-11 grid-cols-[minmax(0,1fr)_3rem] gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]" : "hidden gap-2 border-b px-5 py-2.5 sm:grid grid-cols-[1fr_4rem_repeat(3,3.5rem)_8.5rem]")}>
            <span>Deck</span>
            <span className={cn(!archived && "text-right")}>Cards</span>
            {archived && <><span className="hidden sm:block">Path</span><span className="hidden sm:block">Archived on</span></>}
            {!archived && <><span className="text-right">New</span>
            <span className="text-right">Learn</span>
            <span className="text-right">Due</span></>}
            {!archived && <span />}
          </div>}
          <div className={cn(archived && "nd-deck-cards-list nd-deck-cards-list--small grid gap-3")}>
          {archiveResults.map((d, i) => {
            const name = d.name.split("::").pop()!;
            const work = d.new + d.learning + d.review;
            const soon = d.displayDepth === 0 && d.deadline && new Date(d.deadline) > new Date();
            const watch = d.mode === "watch";
            const study = () => navigate(`/${watch ? "watch" : "study"}?deck=${encodeURIComponent(d.name)}${!watch && !work ? "&ahead=1" : ""}`);
            // A new top-level deck after a subtree gets a stronger rule, so groups read as groups.
            const groupStart = i > 0 && d.displayDepth === 0;
            const lifted = treeDrag.isDragged(d.name);
            const target = treeDrag.isTarget(d.name);
            const targetBlocked = target && treeDrag.blocked(drag!.name, drag!.drop!);
            const menu = {
              name: d.name,
              archived,
              disabled: deckActions.busy,
              onArchive: () => deckActions.archive(d.name, !archived),
              onDelete: () => deckActions.requestDelete(d.name),
              extra: rowEntries({
                name: d.name,
                archived,
                onMove: () => setMoving(d.name),
                onTop: d.depth > 0 && !clashes(decks ?? [], d.name, "") ? () => place(d.name, "", childrenOf(decks ?? [], "").indexOf(d.name.split("::")[0]) + 1) : undefined,
                onUp: d.depth > 1 && !clashes(decks ?? [], d.name, parentOf(parentOf(d.name))) ? () => { const gp = parentOf(parentOf(d.name)); place(d.name, gp, childrenOf(decks ?? [], gp).indexOf(parentOf(d.name)) + 1); } : undefined,
              }),
            };
            return (
              <DeckContextMenu key={d.id} {...menu}>
              <div
                ref={(el) => {
                  if (el) rows.current.set(d.name, el);
                  else rows.current.delete(d.name);
                  treeDrag.setRowRef(d.name, el);
                }}
                className={cn(
                  archived
                    ? "nd-deck-card-tile group relative grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3 rounded-xl border bg-card/40 px-4 py-4 data-[state=open]:bg-accent/40 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
                    : "group relative flex min-h-14 items-stretch gap-2 pr-3 pl-0.5 hover:bg-accent/40 data-[state=open]:bg-accent/40 sm:grid sm:min-h-12 sm:grid-cols-[1fr_4rem_repeat(3,3.5rem)_8.5rem] sm:pr-5 sm:pl-1",
                  !archived && i > 0 && "border-t",
                  !archived && groupStart && "border-t-foreground/15",
                  !drag && "transition-colors",
                  lifted && "opacity-35",
                  target && !targetBlocked && "bg-highlight/10 ring-1 ring-highlight/60 ring-inset",
                  targetBlocked && "bg-destructive/10 ring-1 ring-destructive/50 ring-inset",
                )}
              >
                <div className="flex min-w-0 flex-1 items-stretch">
                  {!archived && <TreeGuides depth={d.displayDepth} />}
                  {!archived && <div className="flex shrink-0 items-center">
                    <button
                      data-grip
                      disabled={archived}
                      className={cn(
                        "flex h-10 w-6 touch-none items-center justify-center rounded-md hover:!text-foreground sm:h-8 sm:w-5",
                        drag?.name === d.name ? "cursor-grabbing text-foreground" : "cursor-grab text-muted-foreground/50 group-hover:text-muted-foreground",
                        (archived || visible.length < 2 || (drag && drag.name !== d.name)) && "invisible",
                      )}
                      onPointerDown={(e) => treeDrag.startDrag(d.name, e)}
                      onKeyDown={(e) => treeDrag.keyMove(d.name, e)}
                      aria-label={`Move ${name}: drag it onto a deck or between rows. Arrow keys reorder, Alt+arrows change level.`}
                      title="Drag onto a deck to put it inside, or between rows to place it"
                    >
                      <GripVertical className="size-4" />
                    </button>
                    <button
                      className={cn("flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground sm:size-8", !d.hasChildren && "invisible")}
                      onClick={() => toggle(d.name)}
                      aria-label={collapsed.has(d.name) ? `Expand ${name}` : `Collapse ${name}`}
                      aria-expanded={!collapsed.has(d.name)}
                    >
                      <ChevronRight className={cn("size-4 transition-transform", !collapsed.has(d.name) && "rotate-90")} />
                    </button>
                  </div>}
                  <div className={cn("flex min-w-0 flex-1 flex-col justify-center", !archived && "py-2")}>
                    {archived ? (
                      <span className="nd-deck-card-title text-sm leading-snug font-medium max-md:text-[15px]">{name}</span>
                    ) : <button
                      className={cn("text-left text-[0.95rem] leading-snug hover:underline sm:truncate", d.displayDepth === 0 ? "font-medium" : "text-foreground/90")}
                      onClick={() => navigate(`/deck?name=${encodeURIComponent(d.name)}`)}
                    >
                      {d.displayDepth === 0 ? d.name : name}
                      {soon && <span className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-normal text-highlight"><CalendarClock className="size-3.5" />{relative(d.deadline!)}</span>}
                    </button>}
                    {/* Phone: counts on one line under the name instead of three narrow columns. */}
                    {!archived && <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular text-muted-foreground sm:hidden [&>span]:whitespace-nowrap">
                      {archived ? <span>{d.cards} card{d.cards === 1 ? "" : "s"}</span> : watch ? (
                        <span>{d.cards} card{d.cards === 1 ? "" : "s"} to watch</span>
                      ) : work ? (
                        <>
                          <span>{d.cards} card{d.cards === 1 ? "" : "s"}</span>
                          {d.new > 0 && <span className="text-new">{d.new} new</span>}
                          {d.learning > 0 && <span className="text-learn">{d.learning} learning</span>}
                          {d.review > 0 && <span className="text-review">{d.review} due</span>}
                        </>
                      ) : (
                        <span>{d.cards ? `${d.cards} card${d.cards === 1 ? "" : "s"} · nothing due` : "empty"}</span>
                      )}
                    </div>}
                  </div>
                </div>
                <span className={cn("items-center tabular text-sm text-muted-foreground", archived ? "flex" : "hidden justify-end sm:flex")} title={`${d.cards} card${d.cards === 1 ? "" : "s"} in this deck`}>{d.cards}</span>
                {archived && <>
                  <span className="col-span-2 min-w-0 truncate text-sm text-muted-foreground sm:col-span-1" title={parentOf(d.name) || undefined}><span className="sm:hidden">Path: </span>{parentOf(d.name) || "—"}</span>
                  <span className="col-span-2 tabular text-sm text-muted-foreground sm:col-span-1"><span className="sm:hidden">Archived on: </span>{d.archivedAt ? new Date(d.archivedAt).toLocaleDateString("de-DE") : "—"}</span>
                </>}
                {!archived && (watch ? (
                  <span className="hidden items-center justify-end text-xs text-muted-foreground sm:col-span-3 sm:flex">tour</span>
                ) : (
                  <>
                    <Count value={d.new} cls="text-new" />
                    <Count value={d.learning} cls="text-learn" />
                    <Count value={d.review} cls="text-review" />
                  </>
                ))}
                {!archived && <div className="flex shrink-0 items-center justify-end gap-0.5">
                  {!archived && <Button
                    size="sm"
                    variant={work || (watch && d.cards) ? "secondary" : "ghost"}
                    className="size-10 gap-1.5 self-center rounded-full px-0 sm:h-8 sm:w-auto sm:rounded-md sm:px-3"
                    disabled={!d.cards}
                    onClick={study}
                    title={!watch && !work && d.cards ? "Nothing due: practice ahead anyway" : undefined}
                    aria-label={`${watch ? "Watch" : work || !d.cards ? "Practice" : "Practice ahead"} ${name}`}
                  >
                    {watch ? (
                      <><Eye className="size-4 text-highlight sm:size-3.5 sm:text-current" /> <span className="hidden sm:inline">Watch</span></>
                    ) : (
                      work || !d.cards ? (
                      <><Play className={cn("size-4 sm:size-3.5", work && "fill-current text-highlight sm:fill-none sm:text-current")} /> <span className="hidden sm:inline">Practice</span></>
                    ) : (
                      <><FastForward className="size-4 sm:size-3.5" /> <span className="hidden sm:inline">Ahead</span></>
                    )
                    )}
                  </Button>}
                </div>}
              </div>
              </DeckContextMenu>
            );
          })}
          </div>
          {decks.length === 0 ? (
            <EmptyState title="No archived decks">Decks you move to the archive will appear here.</EmptyState>
          ) : archiveResults.length === 0 && (
            <EmptyState inset title="No matches" action={<Button variant="outline" size="sm" onClick={() => setArchiveQuery("")}>Clear search</Button>}>No archived decks match that search.</EmptyState>
          )}
          {drag?.drop && !treeDrag.isNoop(drag.name, drag.drop) && (
            drag.drop.kind === "line" ? (
              <div
                aria-hidden
                className={cn("pointer-events-none absolute right-3 z-20 h-0.5 -translate-y-1/2 rounded-full", treeDrag.blocked(drag.name, drag.drop) ? "bg-destructive" : "bg-highlight")}
                style={{ top: treeDrag.dropTop(drag.drop), left: `calc(${0.25 + drag.drop.depth * 1.25}rem + 1.5rem)` }}
              >
                <span className={cn("absolute -top-[3px] -left-1.5 size-2 rounded-full border-2 bg-background", treeDrag.blocked(drag.name, drag.drop) ? "border-destructive" : "border-highlight")} />
              </div>
            ) : null
          )}
          </div>
        </Section>
      )}
      {!archived && visible.some((deck) => deck.displayDepth === 0) && (
        <Section bare>
          <DeckOverviewTiles
            decks={visible.filter((deck) => deck.displayDepth === 0)}
            allDecks={decks ?? []}
            onChanged={reload}
          />
        </Section>
      )}
      {deckActions.deleteDialog}
      {drag && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 flex h-9 max-w-64 -translate-x-[17px] -translate-y-1/2 cursor-grabbing items-center gap-1.5 rounded-lg border bg-card pr-3 pl-2 text-sm font-medium shadow-xl ring-1 ring-highlight/40"
          style={{ left: drag.x, top: drag.y }}
        >
          <GripVertical className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{leafOf(drag.name)}</span>
        </div>
      )}
      {drag?.drop && !treeDrag.isNoop(drag.name, drag.drop) && (
        <div aria-live="polite" className={cn("pointer-events-none fixed bottom-[calc(var(--tabbar-h,0px)+1rem)] left-1/2 z-50 -translate-x-1/2 rounded-full border bg-card px-3.5 py-1.5 text-xs shadow-lg", treeDrag.blocked(drag.name, drag.drop) && "border-destructive/50 text-destructive")}>
          {treeDrag.blocked(drag.name, drag.drop)
            ? `${drag.drop.parent ? leafOf(drag.drop.parent) : "The top level"} already has a ${leafOf(drag.name)}`
            : drag.drop.parent === parentOf(drag.name)
              ? "Reorder"
              : drag.drop.parent
                ? <>Into <span className="font-medium">{leafOf(drag.drop.parent)}</span></>
                : "Out to the top level"}
        </div>
      )}
      <MoveDeckDialog deck={moving} decks={decks ?? []} onOpenChange={(o) => !o && setMoving(null)} onMoved={(n) => after(n)} />
      <NewDeckDialog open={creating} onOpenChange={setCreating} onDone={reload} />
    </Page>
  );
}

/** Row-specific entries for a deck's menu: move it somewhere, take it out a level, rename. */
function rowEntries({ name, archived, onMove, onTop, onUp }: { name: string; archived: boolean; onMove(): void; onTop?: () => void; onUp?: () => void }): DeckMenuEntry[] {
  if (archived) return [];
  return [
    { icon: <FolderInput />, label: "Move to…", onSelect: onMove },
    ...(onUp ? [{ icon: <ArrowUpLeft />, label: "Move up a level", onSelect: onUp }] : []),
    ...(onTop ? [{ icon: <ArrowUpToLine />, label: "Make it a deck of its own", onSelect: onTop }] : []),
    "-",
    { icon: <Pencil />, label: "Rename", onSelect: () => navigate(`/deck?name=${encodeURIComponent(name)}&rename=1`) },
  ];
}

/** Desktop count column; muted when zero. */
function Count({ value, cls }: { value: number; cls: string }) {
  return <span className={cn("hidden items-center justify-end tabular text-sm sm:flex", value ? cls : "text-muted-foreground/40")}>{value}</span>;
}

/** Indentation for one nesting level per depth. */
export function TreeGuides({ depth }: { depth: number }) {
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} aria-hidden className="w-4 shrink-0 sm:w-5" />
      ))}
    </>
  );
}

export function ImportButton({ onDone, phone }: { onDone(): void; phone?: boolean }) {
  const pick = useImportPicker(onDone);
  if (phone)
    return (
      <button onClick={pick} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border bg-card text-[15px] active:bg-accent"><Upload className="size-4" />Import a file</button>
    );
  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={pick}><Upload className="size-4" />Import</Button>
  );
}

/** Opens a file picker and imports every pack or Anki file chosen, with a toast per file. */
export function useImportPicker(onDone: () => void) {
  const pick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.apkg,.colpkg,application/json";
    input.multiple = true;
    input.onchange = async () => {
      for (const f of Array.from(input.files ?? [])) {
        try {
          if (/\.(apkg|colpkg)$/i.test(f.name)) {
            const r = await api.importAnki(f);
            const media = r.media.files ? ` · ${r.media.files} media` : "";
            const skipped = r.skipped.length ? ` · ${r.skipped.length} skipped` : "";
            toast.success(`Imported ${f.name}`, { description: `${r.items.created} new, ${r.items.updated} updated, ${r.items.unchanged} unchanged · ${r.cards} cards · ${r.reviews} reviews${media}${skipped}` });
          } else {
            const r = await api.importPack(JSON.parse(await f.text()));
            const assets = r.assets?.created + r.assets?.updated ? ` · ${r.assets.created + r.assets.updated} asset files` : "";
            toast.success(`Imported ${f.name}`, { description: `${r.items.created} new, ${r.items.updated} updated, ${r.items.unchanged} unchanged${assets}` });
          }
        } catch (e) {
          toast.error(`Couldn't import ${f.name}`, { description: (e as Error).message.slice(0, 400) });
        }
      }
      onDone();
    };
    input.click();
  };
  return pick;
}

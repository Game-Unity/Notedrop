import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, ArrowUpToLine, BarChart3, CalendarClock, Check, ChevronDown, Download, Eye, FastForward, FolderInput, Library, Pencil, Play, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LiveMarkdown } from "@/components/live-editor";
import { MediaPasteProvider } from "@/components/media-paste";
import { BulkBar, CheckBox, groupItems, ItemRow, OrderSelect, SearchHints } from "@/components/item-editor";
import { DeckOptions, formatDeadline, type DeckFull } from "@/components/deck-options";
import { api, type Counts, type DeckNode, type LearnerSummary, type Preset, type SearchRow } from "@/lib/api";
import { etudeDownload } from "@/lib/local-url";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { Block, Breadcrumb, EmptyState, LinkRow, Page, Section } from "@/components/page";
import { childrenOf, clashes, leafOf, moveDeck, MoveDeckDialog, parentOf } from "@/components/move-deck";
import { usePhone } from "@/lib/phone";
import { PhoneTitle } from "@/components/phone-shell";
import { useDeckActions } from "@/components/deck-actions";
import { dueSearch, invalidateProgress, loadDeckList, onProgressInvalidated, relatedDecks } from "@/lib/notedrop-progress";

const enc = encodeURIComponent;

export function DeckPage({ name, dataKey, activeItemId, onOpenCard, onCreateCard, onClosePanel }: { name: string; dataKey: number; activeItemId: string | null; onOpenCard(id: string): void; onCreateCard(): void; onClosePanel(discard?: boolean): void }) {
  const [deck, setDeck] = useState<DeckFull | null>(null);
  const [decks, setDecks] = useState<DeckNode[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [queueCounts, setQueueCounts] = useState<{ deck: string; counts: Counts } | null>(null);
  const [queueError, setQueueError] = useState<{ deck: string; message: string } | null>(null);
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get("tab") ?? "overview");
  const phone = usePhone();

  // Keep the open tab in the URL so reloads and links land on it.
  const switchTab = (t: string) => {
    setTab(t);
    const p = new URLSearchParams(location.search);
    if (t === "overview") p.delete("tab");
    else p.set("tab", t);
    if (t !== "cards") p.delete("item");
    history.replaceState(null, "", `/deck?${p}`);
  };

  const loadTags = useCallback(() =>
    api
      .search(`deck:"${name}"`, { limit: 1000 })
      .then((r) => setTags([...new Set(r.rows.flatMap((x) => x.tags))].sort()))
      .catch(() => {}), [name]);

  const reload = useCallback(async (forceDecks = false) => {
    try {
      const [d, all, p] = await Promise.all([api.deck(name), loadDeckList(forceDecks), api.presets()]);
      setDeck(d);
      setDecks(all.filter((node) => node.archived === d.archived));
      setPresets(p);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [name]);
  useEffect(() => {
    reload();
    // Only tags used inside this deck are useful for custom study.
    loadTags();
    const onFocus = () => reload(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadTags, name, reload]);

  const lastDataKey = useRef(dataKey);
  useEffect(() => {
    if (lastDataKey.current === dataKey) return;
    lastDataKey.current = dataKey;
    void reload(true);
    void loadTags();
  }, [dataKey, loadTags, reload]);

  useEffect(() => {
    if (!deck || deck.archived || deck.resolved.mode === "watch") {
      setQueueCounts(null);
      setQueueError(null);
      return;
    }

    let live = true;
    let requestId = 0;
    const refresh = async () => {
      const id = ++requestId;
      try {
        const counts = await api.counts({ deck: name });
        if (![counts.new, counts.learning, counts.review].every((count) => Number.isInteger(count) && count >= 0)) {
          throw new Error("Etude returned invalid study queue counts");
        }
        if (live && id === requestId) {
          setQueueCounts({ deck: name, counts });
          setQueueError(null);
        }
      } catch (e) {
        if (live && id === requestId) setQueueError({ deck: name, message: (e as Error).message });
      }
    };
    const onInvalidated = (changedDeck?: string) => {
      if (!changedDeck || relatedDecks(name, changedDeck)) void refresh();
    };
    const unsubscribe = onProgressInvalidated(onInvalidated);
    const onFocus = () => void refresh();
    const onVisibility = () => document.visibilityState === "visible" && onFocus();
    void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [deck?.archived, deck?.resolved.mode, name]);

  const node = decks.find((d) => d.name === deck?.name);
  const children = useMemo(() => (deck ? decks.filter((d) => d.name.startsWith(deck.name + "::")) : []), [decks, deck?.name]);

  if (error)
    return (
      <Page>
        <EmptyState title="Couldn't open this deck" action={<Button variant="outline" size="sm" onClick={() => navigate("/")}>Back to decks</Button>}>{error}</EmptyState>
      </Page>
    );
  if (!deck)
    return (
      <Page>
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="mt-8 h-24 animate-pulse rounded-xl bg-muted/60" />
      </Page>
    );

  const parts = deck.name.split("::");
  const work = node ? node.new + node.learning + node.review : 0;
  const back = parts.length > 1 ? parts.slice(0, -1).join("::") : "";
  const overviewText = (
    <>
          <TextSection
            title="Description"
            empty="No description. Add notes about what this deck covers, sources, or how to study it."
            value={deck.description}
            markdown
            onSave={async (description) => {
              await api.updateDeck(deck.name, { description });
              await reload();
            }}
          />
          <TextSection
            title="AI grading instructions"
            help={
              <>
                Sent to the AI grader for every card in this deck{children.length ? " and its subdecks" : ""}. They stack with parent-deck and tag instructions and each card's own rubric.
              </>
            }
            empty="Add instructions, for example: “Accept answers in ms or s if the conversion is right. Penalize missing units.”"
            value={deck.instructions}
            mono
            onSave={async (instructions) => {
              await api.updateDeck(deck.name, { instructions });
              await reload();
            }}
          />
    </>
  );
  const cardsTab = (
          <DeckCards
            deck={deck.name}
            dataKey={dataKey}
            hasChildren={children.length > 0}
            active={tab === "cards"}
            selected={activeItemId}
            onOpenCard={onOpenCard}
            onCreateCard={onCreateCard}
            onClosePanel={onClosePanel}
            onChanged={() => {
              reload(true);
              loadTags();
            }}
          />
  );
  const optionsTab = <DeckOptions deck={deck} decks={decks} presets={presets} onChanged={reload} />;
  const manageTab = <DangerZone deck={deck} decks={decks} hasChildren={children.length > 0} onMoved={(to) => navigate(`/deck?name=${enc(to)}&tab=manage`, { replace: true })} />;
  const breadcrumb = (
    <Breadcrumb
      items={[
        { label: deck.archived ? "Archive" : "Decks", onClick: () => navigate(deck.archived ? "/archive" : "/") },
        ...parts.slice(0, -1).map((p, i) => ({
          label: p,
          onClick: () => navigate(`/deck?name=${enc(parts.slice(0, i + 1).join("::"))}`),
        })),
      ]}
    />
  );

  if (phone)
    return (
      <div>
        <PhoneTitle
          back={{ label: deck.archived ? "Archive" : back ? leafOf(back) : "Decks", onClick: () => navigate(deck.archived ? "/archive" : back ? `/deck?name=${enc(back)}` : "/") }}
          kicker={parts.length > 2 ? parts.slice(0, -2).join(" › ") : undefined}
          title={leafOf(deck.name)}
          className="pb-3"
        />
        <div className="px-5">
          <Header deck={deck} node={node} work={work} tags={tags} phone renameScope={new URLSearchParams(location.search).get("treeRoot") ?? undefined} onRenamed={(to) => navigate(`/deck?name=${enc(to)}`, { replace: true })} />
        </div>
        <Tabs value={tab} onValueChange={switchTab} className="mt-7">
          <div className="sticky top-[calc(3rem+env(safe-area-inset-top))] z-10 border-b bg-background/95 px-5 backdrop-blur">
            <TabsList variant="line" className="h-11 w-full justify-start gap-5 bg-transparent p-0">
              {(["overview", "cards", "options", "manage"] as const).map((t) => (
                <TabsTrigger key={t} value={t} className="h-11 flex-none rounded-none border-0 px-0 text-[15px] capitalize shadow-none after:!bottom-0 after:bg-highlight data-[state=active]:bg-transparent data-[state=active]:shadow-none">{t}</TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="overview" className="mt-0 flex flex-col gap-8 pb-4">
            <div className="flex flex-col gap-8 px-5">
              {overviewText}
            </div>
          </TabsContent>
          <TabsContent value="cards" className="mt-4 px-4">{cardsTab}</TabsContent>
          <TabsContent value="options" className="mt-6 px-4">{optionsTab}</TabsContent>
          <TabsContent value="manage" className="mt-6 px-4">{manageTab}</TabsContent>
        </Tabs>
      </div>
    );

  return (
    <Page className="nd-deck-page">
      <Tabs value={tab} onValueChange={switchTab} className="nd-deck-tabs-root">
        <Header deck={deck} node={node} work={work} tags={tags} breadcrumb={breadcrumb} renameScope={new URLSearchParams(location.search).get("treeRoot") ?? undefined} onRenamed={(to) => navigate(`/deck?name=${enc(to)}`, { replace: true })} />

        {!deck.archived && (
          <DeckStudyActionBar
            deck={deck}
            node={node}
            work={work}
            tags={tags}
            queueCounts={queueCounts?.deck === name ? queueCounts.counts : null}
            queueError={queueError?.deck === name ? queueError.message : null}
          />
        )}

        <TabsList variant="line" className="nd-deck-tabs-nav mb-5 h-auto w-full justify-start gap-1.5 rounded-none border-b bg-transparent p-0 pb-3">
          <TabsTrigger value="overview" className="nd-deck-tab">Overview</TabsTrigger>
          <TabsTrigger value="cards" className="nd-deck-tab">Cards</TabsTrigger>
          <TabsTrigger value="options" className="nd-deck-tab">Options</TabsTrigger>
          <TabsTrigger value="manage" className="nd-deck-tab">Manage</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 flex flex-col gap-8">
          {overviewText}
        </TabsContent>

        <TabsContent value="cards" className="mt-6">
          {cardsTab}
        </TabsContent>

        <TabsContent value="options" className="mt-6">
          {optionsTab}
        </TabsContent>

        <TabsContent value="manage" className="mt-6">
          {manageTab}
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function DueBadge({ deck }: { deck: string }) {
  const [due, setDue] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let requestId = 0;
    const refresh = async () => {
      const id = ++requestId;
      try {
        const result = await api.search(dueSearch(deck), { limit: 1 });
        if (!Number.isInteger(result.total) || result.total < 0) throw new Error("Invalid due card count");
        if (live && id === requestId) {
          setDue(result.total);
          setError(null);
        }
      } catch (e) {
        if (live && id === requestId) setError((e as Error).message);
      }
    };
    const onVisibility = () => document.visibilityState === "visible" && void refresh();
    void refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [deck]);

  if (due === 0 && !error) return null;
  if (due == null && !error) return null;
  return (
    <span id="nd-due-badge" className="nd-due-badge" role={error ? "status" : undefined} title={error ?? undefined}>
      {error ? "Due unavailable" : `${due} due`}
    </span>
  );
}

const CARDS_PAGE = 200;

/** Every card in the deck and its subdecks, with the same rows, filters and editor as Browse. */
function DeckCards({ deck, dataKey, hasChildren, active, selected, onOpenCard, onCreateCard, onClosePanel, onChanged }: { deck: string; dataKey: number; hasChildren: boolean; active: boolean; selected: string | null; onOpenCard(id: string): void; onCreateCard(): void; onClosePanel(discard?: boolean): void; onChanged(): void }) {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState("relevance");
  const [limit, setLimit] = useState(CARDS_PAGE);
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [decks, setDecks] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const scoped = query.trim() ? `deck:"${deck}" (${query.trim()})` : `deck:"${deck}"`;
  const run = useCallback(async () => {
    try {
      const r = await api.search(scoped, { limit, order });
      setRows(r.rows);
      setTotal(r.total);
      setError(null);
    } catch (e) {
      setError((e as Error).message.replace(/^search: /, ""));
    }
  }, [scoped, limit, order]);

  useEffect(() => {
    const t = setTimeout(run, 180);
    return () => clearTimeout(t);
  }, [run]);
  useEffect(() => setLimit(CARDS_PAGE), [query, order]);
  // A selection made under another search would act on cards that are no longer listed.
  useEffect(() => setChecked(new Set()), [query]);

  const reloadMeta = useCallback(() => {
    api.decks().then((d) => setDecks(d.map((x) => x.name)));
    api.tags().then((t) => setTags(t.map((x) => x.tag)));
  }, []);
  useEffect(reloadMeta, []);

  const lastDataKey = useRef(dataKey);
  useEffect(() => {
    if (lastDataKey.current === dataKey) return;
    lastDataKey.current = dataKey;
    void run();
    reloadMeta();
  }, [dataKey, reloadMeta, run]);

  const open = (id: string | null) => id ? onOpenCard(id) : onClosePanel();

  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !selected) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active, selected]);

  const changed = () => {
    run();
    reloadMeta();
    onChanged();
  };

  const items = useMemo(() => groupItems(rows), [rows]);
  const allChecked = items.length > 0 && items.every((r) => checked.has(r.itemId));
  const emptyDeck = total === 0 && !query.trim();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this deck"
              aria-label="Search this deck"
              className={cn("h-10 pl-9", query && "pr-10 font-mono text-[13px]")}
            />
            {query && (
              <button className="absolute top-1 right-1 flex size-8 items-center justify-center rounded text-muted-foreground hover:text-foreground" onClick={() => setQuery("")} aria-label="Clear search">
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button className="h-10 gap-1.5 px-3" onClick={onCreateCard} aria-label="Add a card"><Plus className="size-4" /><span className="hidden min-[420px]:inline">Add</span></Button>
        </div>
        {!emptyDeck && <SearchHints onPick={(h) => setQuery((q) => (q ? `${q} ${h}` : h))} />}
      </div>

      {!emptyDeck && (
        <Section bare>
          <div className="flex flex-col gap-3">
            <div className="nd-deck-cards-toolbar flex min-h-11 items-center gap-2.5 text-xs text-muted-foreground">
              <CheckBox checked={allChecked} label="Select all" onClick={() => setChecked(allChecked ? new Set() : new Set(items.map((r) => r.itemId)))} />
              <span className="tabular min-w-0 truncate">
                {error ? <span className="text-destructive">{error}</span> : total == null ? "Loading…" : `${total} card${total === 1 ? "" : "s"}${total > rows.length ? `, showing ${rows.length}` : ""}`}
              </span>
              <div className="flex-1" />
              <OrderSelect value={order} onChange={setOrder} />
            </div>
            <BulkBar
              checked={checked}
              rows={rows}
              decks={decks}
              tags={tags}
              className="nd-deck-cards-bulk-actions !border-0 !bg-transparent"
              onClear={() => setChecked(new Set())}
              onDone={changed}
              onDeleted={(ids) => selected && ids.includes(selected) && onClosePanel(true)}
            />
            <div className="nd-deck-cards-list grid gap-3">
              {items.map((r) => (
                <ItemRow
                  key={r.itemId}
                  row={r}
                  active={selected === r.itemId}
                  checked={checked.has(r.itemId)}
                  hideDeck={!hasChildren}
                  variant="tile"
                  onOpen={() => open(r.itemId)}
                  onToggle={() =>
                    setChecked((prev) => {
                      const n = new Set(prev);
                      n.has(r.itemId) ? n.delete(r.itemId) : n.add(r.itemId);
                      return n;
                    })
                  }
                />
              ))}
            </div>
            {total != null && !items.length && !error && (
              <EmptyState inset title="No matches" action={<Button variant="outline" size="sm" onClick={() => setQuery("")}>Clear search</Button>}>No cards in this deck match that search.</EmptyState>
            )}
            {total != null && total > rows.length && (
              <button className="flex h-12 w-full items-center justify-center rounded-xl border bg-card/40 text-sm text-muted-foreground hover:bg-accent/40 hover:text-foreground" onClick={() => setLimit((l) => Math.min(l + CARDS_PAGE, 1000))}>
                Show {Math.min(CARDS_PAGE, total - rows.length)} more
              </button>
            )}
          </div>
        </Section>
      )}

      {emptyDeck && (
        <EmptyState title="No cards in this deck yet" action={<Button size="sm" className="gap-1.5" onClick={onCreateCard}><Plus className="size-4" />Add a card</Button>}>
          Add one here, or import a pack from the Decks page.
        </EmptyState>
      )}

    </div>
  );
}

function Header({ deck, node, work, tags, breadcrumb, onRenamed, phone, renameScope }: { deck: DeckFull; node?: DeckNode; work: number; tags: string[]; breadcrumb?: React.ReactNode; onRenamed(to: string): void; phone?: boolean; renameScope?: string }) {
  // The deck list's ⋯ → Rename lands here with ?rename=1.
  const renameRequested = new URLSearchParams(location.search).has("rename");
  const [editing, setEditing] = useState(renameRequested);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.has("rename")) {
      setEditing(true);
      p.delete("rename");
      history.replaceState(null, "", `/deck?${p}`);
    }
  }, [deck.name, renameRequested]);
  const leaf = deck.name.split("::").at(-1)!;
  const parent = deck.name.split("::").slice(0, -1).join("::");
  const [text, setText] = useState(leaf);
  useEffect(() => setText(leaf), [leaf]);

  const rename = async () => {
    const t = text.trim();
    if (!t || t === leaf) return setEditing(false);
    if (renameScope && (deck.name === renameScope || !deck.name.startsWith(`${renameScope}::`) || t.includes("::"))) {
      toast.error("Rename this chapter with a name inside its current deck");
      return;
    }
    // Typing "::" moves the deck; a bare name stays under the same parent.
    const to = renameScope ? (parent ? `${parent}::${t}` : t) : t.includes("::") ? t : parent ? `${parent}::${t}` : t;
    try {
      const d = await api.updateDeck(deck.name, { name: to });
      invalidateProgress(deck.name);
      toast.success(`Renamed to ${d.name.split("::").pop()}`);
      setEditing(false);
      onRenamed(d.name);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const deadline = deck.resolved.deadline && new Date(deck.resolved.deadline) > new Date() ? deck.resolved.deadline : null;

  return (
    <header>
      {editing ? (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename();
              if (e.key === "Escape") {
                setText(leaf);
                setEditing(false);
              }
            }}
            aria-label="Deck name"
            className="h-10 text-2xl font-semibold tracking-tight md:text-2xl"
          />
          <Button size="icon" className="size-10 shrink-0" onClick={rename} aria-label="Save name"><Check /></Button>
          <Button size="icon" variant="outline" className="size-10 shrink-0" onClick={() => { setText(leaf); setEditing(false); }} aria-label="Cancel"><X /></Button>
        </div>
      ) : phone ? null : (
        <div className="group flex items-start gap-1">
          <h1 className="min-w-0 py-0.5 text-2xl font-semibold tracking-tight break-words">{leaf}</h1>
          <Button variant="ghost" size="icon" className="-my-0.5 size-10 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)} aria-label="Rename deck">
            <Pencil className="size-4" />
          </Button>
        </div>
      )}

      {!phone && breadcrumb}
      {phone && !editing && (
        <PhoneDeckRename onRename={() => setEditing(true)} />
      )}
      {!phone && deck.archived && <span className="inline-flex items-center gap-2 py-2 text-sm text-muted-foreground"><Archive className="size-4" />Archived</span>}
      {phone && !deck.archived && <DeckStudyActions deck={deck} node={node} work={work} tags={tags} phone />}
      {phone && deck.archived && <span className="inline-flex items-center gap-2 py-2 text-sm text-muted-foreground"><Archive className="size-4" />Archived</span>}

      {!deck.archived && deadline && <Countdown deadline={deadline} margin={deck.resolved.deadlineMargin} />}
      {!deck.archived && deck.resolved.mode !== "watch" && (deck.resolved.adaptiveChallenge || deck.resolved.adaptivePace) && <AdaptiveSummary deck={deck.name} hasNew={(node?.new ?? 0) > 0} />}
      {!deck.archived && !work && node && node.cards > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">{node.nextDue ? `Nothing due now. Next card ${relativeShort(node.nextDue)}.` : "Nothing due now."} Custom study works any time.</p>
      )}
    </header>
  );
}

function DeckStudyActionBar({ deck, node, work, tags, queueCounts, queueError }: {
  deck: DeckFull;
  node?: DeckNode;
  work: number;
  tags: string[];
  queueCounts: Counts | null;
  queueError: string | null;
}) {
  const queueWork = queueCounts ? queueCounts.new + queueCounts.learning + queueCounts.review : work;
  const description = deck.resolved.mode === "watch"
    ? "Take a tour of this deck."
    : queueError
      ? "Study queue unavailable."
      : !queueCounts
        ? "Loading today's study queue…"
        : queueWork === 0
          ? "You're all caught up for today!"
          : `You have ${queueWork} card${queueWork === 1 ? "" : "s"} to study today.`;
  return (
    <div className="nd-deck-study-bar">
      <div className="nd-deck-study-copy text-sm text-muted-foreground" role={queueError ? "status" : undefined} title={queueError ?? undefined}>
        <span>{description}</span>
      </div>
      <DeckStudyActions deck={deck} node={node} work={queueCounts ? queueWork : work} tags={tags} />
    </div>
  );
}

function DeckStudyActions({ deck, node, work, tags, phone }: { deck: DeckFull; node?: DeckNode; work: number; tags: string[]; phone?: boolean }) {
  return (
    <div className="nd-deck-actions flex gap-2">
      {deck.resolved.mode === "watch" ? (
        <Button size="lg" className={cn("flex-1 gap-2 px-6 sm:flex-none", phone && "h-[3.25rem] rounded-full text-[16px] pointer-coarse:h-[3.25rem]")} disabled={!node?.cards} title="A tour: each card can show an example answer, and nothing is scheduled" onClick={() => navigate(`/watch?deck=${enc(deck.name)}`)}>
          <Eye className="size-4" />Watch
        </Button>
      ) : (
        <>
          <CustomStudy deck={deck.name} tags={tags} disabled={!node?.cards} phone={phone} adaptive={deck.resolved.adaptiveChallenge || deck.resolved.adaptivePace} />
          {work || !node?.cards ? (
            <Button size="lg" className={cn("flex-1 gap-2 px-6 sm:flex-none", phone && "h-[3.25rem] rounded-full text-[16px] pointer-coarse:h-[3.25rem]")} disabled={!work} onClick={() => navigate(`/study?deck=${enc(deck.name)}`)}>
              <Play className="size-4" />Practice<DueBadge deck={deck.name} />
            </Button>
          ) : (
            <Button size="lg" className={cn("flex-1 gap-2 px-6 sm:flex-none", phone && "h-[3.25rem] rounded-full text-[16px] pointer-coarse:h-[3.25rem]")} title="Nothing due right now: review early. FSRS counts an early review for less." onClick={() => navigate(`/study?deck=${enc(deck.name)}&ahead=1`)}>
              <FastForward className="size-4" />Practice ahead<DueBadge deck={deck.name} />
            </Button>
          )}
        </>
      )}
    </div>
  );
}

/** Phone: the deck's counts as one quiet line with shape marks, and the total plus a rename button. */
function PhoneDeckRename({ onRename }: { onRename(): void }) {
  return (
    <div className="flex justify-end">
      <button onClick={onRename} aria-label="Rename deck" className="-mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-accent"><Pencil className="size-[18px]" /></button>
    </div>
  );
}

function relativeShort(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  const m = Math.round(ms / 60000);
  if (m < 60) return `in ${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `in ${h}h`;
  return `in ${Math.round(h / 24)}d`;
}

function Countdown({ deadline, margin }: { deadline: string; margin: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(deadline).getTime() - now;
  const d = Math.floor(ms / 86400_000);
  const h = Math.floor((ms % 86400_000) / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  const left = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return (
    <div className="mt-6 flex items-center gap-3 rounded-xl border border-highlight/25 bg-highlight/[0.06] px-4 py-3">
      <CalendarClock className="size-5 shrink-0 text-highlight" />
      <div className="min-w-0 flex-1 text-sm">
        <span className="tabular font-medium text-highlight">{left}</span>
        <span className="text-muted-foreground"> until the deadline · <span className="whitespace-nowrap">{formatDeadline(deadline)}</span></span>
        <div className="text-xs text-muted-foreground">Exam mode is on: every card comes back at least once, no later than {margin}h before.</div>
      </div>
    </div>
  );
}

function CustomStudy({ deck, tags, disabled, phone, adaptive }: { deck: string; tags: string[]; disabled?: boolean; phone?: boolean; adaptive?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const go = (query: string) => navigate(`/study?deck=${enc(deck)}&q=${enc(query)}`);

  useEffect(() => {
    if (!open || !q.trim()) {
      setCount(null);
      setErr(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .search(`deck:"${deck}" (${q})`, { limit: 1 })
        .then((r) => {
          setCount(r.total);
          setErr(null);
        })
        .catch((e) => {
          setCount(null);
          setErr((e as Error).message.replace(/^search: /, ""));
        });
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  // Group tags by their first segment so long tag lists stay navigable.
  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of tags) {
      const head = t.split("::")[0];
      m.set(head, [...(m.get(head) ?? []), t]);
    }
    return [...m.entries()];
  }, [tags]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="lg" className={cn("flex-1 gap-1.5 px-4 sm:flex-none", phone && "h-[3.25rem] flex-none rounded-full px-5 text-[15px] pointer-coarse:h-[3.25rem]")} disabled={disabled}>{phone ? "Custom" : "Custom study"}<ChevronDown className="size-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 sm:w-64" collisionPadding={16}>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Practice a slice of this deck</DropdownMenuLabel>
          <DropdownMenuItem className="h-10" onClick={() => go("is:due")}>Due reviews only</DropdownMenuItem>
          <DropdownMenuItem className="h-10" onClick={() => go("is:new")}>New cards only</DropdownMenuItem>
          <DropdownMenuItem className="h-10" onClick={() => go("rated:1:1")}>Failed today</DropdownMenuItem>
          <DropdownMenuItem className="h-10" onClick={() => go("prop:lapses>=2")}>Frequently forgotten</DropdownMenuItem>
          {adaptive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="h-10" onClick={() => navigate(`/study?${new URLSearchParams({ deck, placement: String(Date.now()) })}`)}>
                Find my level
                <span className="ml-auto text-xs text-muted-foreground">placement</span>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="h-10" disabled={!tags.length}>By tag</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto">
              {groups.map(([head, list], gi) => (
                <div key={head}>
                  {gi > 0 && <DropdownMenuSeparator />}
                  {list.length > 1 && (
                    <DropdownMenuItem className="h-9 font-medium" onClick={() => go(`tag:${head}`)}>{head} <span className="ml-auto text-xs text-muted-foreground">all</span></DropdownMenuItem>
                  )}
                  {list.map((t) => (
                    <DropdownMenuItem key={t} className={cn("h-9 font-mono text-[12.5px]", list.length > 1 && "pl-5")} onClick={() => go(`tag:${t}`)}>{list.length > 1 ? t.slice(head.length + 2) || t : t}</DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="h-10" onClick={() => setOpen(true)}><Search />Any search…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custom study</DialogTitle>
            <DialogDescription>Any search, limited to this deck.</DialogDescription>
          </DialogHeader>
          <div>
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q.trim() && !err && go(q.trim())} placeholder="tag:exam::core is:due" className="h-10 font-mono text-[13px]" />
            <p className={cn("mt-1.5 min-h-4 text-xs", err ? "text-destructive" : "text-muted-foreground")}>
              {err ?? (count != null ? `${count} matching card${count === 1 ? "" : "s"}` : "is:due · is:new · tag:x · rated:1:1 · prop:lapses>=2 · type:numeric")}
            </p>
          </div>
          <DialogFooter>
            <Button className="h-10" disabled={!q.trim() || !!err || count === 0} onClick={() => go(q.trim())}><Play className="size-4" />Practice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TextSection({ title, help, empty, value, markdown, mono, onSave }: { title: string; help?: React.ReactNode; empty: string; value: string; markdown?: boolean; mono?: boolean; onSave(v: string): Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);
  const save = async () => {
    setBusy(true);
    try {
      await onSave(text);
      setEditing(false);
      toast.success(`${title} saved`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (markdown) return <LiveTextSection title={title} help={help} value={value} empty={empty} onSave={onSave} />;
  return (
    <Section
      bare
      title={title}
      description={help}
      aside={
        !editing && (
          <Button variant="ghost" size="sm" className="-my-1.5 -mr-2 gap-1.5 text-muted-foreground" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />Edit
          </Button>
        )
      }
    >
      {editing ? (
        <div className="rounded-xl border bg-card/40 p-3">
          <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} className={cn("min-h-32", mono && "font-mono text-[13px]")} />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" className="h-10" onClick={() => { setText(value); setEditing(false); }}>Cancel</Button>
            <Button className="h-10" disabled={busy || text === value} onClick={save}>Save</Button>
          </div>
        </div>
      ) : value.trim() ? (
        <div className={cn("rounded-xl border bg-card/40 px-4 py-3 text-sm", mono && "font-mono text-[13px] whitespace-pre-wrap")}>{value}</div>
      ) : (
        <button className="w-full rounded-xl border border-dashed px-4 py-4 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground" onClick={() => setEditing(true)}>
          {empty}
        </button>
      )}
    </Section>
  );
}

/** Markdown text that is always editable: the live editor renders like the read view, and edits save on their own. */
function LiveTextSection({ title, help, value, empty, onSave }: { title: string; help?: React.ReactNode; value: string; empty: string; onSave(v: string): Promise<void> }) {
  const [text, setText] = useState(value);
  const [saved, setSaved] = useState(value);
  const [state, setState] = useState<"clean" | "dirty" | "saving">("clean");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const saving = useRef(false);

  // Outside changes (deck switch, sync) replace the text unless the user is mid-edit.
  useEffect(() => {
    setSaved(value);
    if (state === "clean") setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const runSave = useCallback(async (v: string) => {
    saving.current = true;
    setState("saving");
    try {
      await onSave(v);
      setSaved(v);
      setState(pending.current !== null && pending.current !== v ? "dirty" : "clean");
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
      setState("dirty");
    } finally {
      saving.current = false;
      if (pending.current !== null && pending.current !== v) {
        const next = pending.current;
        pending.current = null;
        void runSave(next);
      } else {
        pending.current = null;
      }
    }
  }, [onSave]);

  const schedule = useCallback((v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (saving.current) pending.current = v;
      else void runSave(v);
    }, 800);
  }, [runSave]);

  // Flush on unmount so a quick navigation doesn't lose the last keystrokes.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const change = (v: string) => {
    setText(v);
    if (v === saved) {
      if (timer.current) clearTimeout(timer.current);
      setState("clean");
      return;
    }
    setState("dirty");
    schedule(v);
  };

  return (
    <Section
      bare
      title={title}
      description={help}
      aside={
        <span className={cn("transition-opacity", state === "clean" ? "opacity-0" : "opacity-100")}>
          {state === "saving" ? "Saving…" : "Unsaved changes"}
        </span>
      }
    >
      <div className="rounded-xl border bg-card/40 p-3">
        <MediaPasteProvider>
          <LiveMarkdown className="prose-etude" value={text} onChange={change} minLines={3} placeholder={empty} />
        </MediaPasteProvider>
      </div>
    </Section>
  );
}

function DangerZone({ deck, decks, hasChildren, onMoved }: { deck: DeckFull; decks: DeckNode[]; hasChildren: boolean; onMoved(to: string): void }) {
  const [moving, setMoving] = useState(false);
  const parent = parentOf(deck.name);
  const topClash = !!parent && clashes(decks, deck.name, "");
  const deckActions = useDeckActions(() => navigate(deck.archived ? "/archive" : "/"));
  return (
    <div className="flex flex-col gap-8">
      <Section title="Elsewhere">
        <LinkRow icon={Library} title="Browse cards" description="List, search and edit every card in this deck." onClick={() => navigate(`/browse?q=${enc(`deck:"${deck.name}"`)}`)} />
        <LinkRow icon={BarChart3} title="Statistics" description="Retention, forecast and weakest tags for this deck." onClick={() => navigate(`/stats?deck=${enc(deck.name)}`)} />
      </Section>
      <Section title="Place in the tree">
        <Block
          stackAside
          title="Move deck"
          description={parent ? <>Inside <span className="text-foreground">{leafOf(parent)}</span>. Subdecks, cards and history move with it.</> : "A top-level deck. Put it inside another deck; subdecks, cards and history move with it."}
          aside={
            <div className="flex flex-wrap gap-2">
              {parent && (
                <Button variant="outline" size="sm" className="gap-1.5" disabled={topClash} title={topClash ? `There's already a top-level ${leafOf(deck.name)}` : undefined} onClick={async () => {
                  const to = await moveDeck(decks, deck.name, "", childrenOf(decks, "").indexOf(deck.name.split("::")[0]) + 1, () => {});
                  if (to) onMoved(to);
                }}>
                  <ArrowUpToLine className="size-4" />Make it a deck of its own
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setMoving(true)}><FolderInput className="size-4" />Move to…</Button>
            </div>
          }
        />
      </Section>
      <MoveDeckDialog deck={moving ? deck.name : null} decks={decks} onOpenChange={setMoving} onMoved={onMoved} />
      <Section title="Export">
        <Block
          stackAside
          title="Export as a pack"
          description="A JSON pack with the items, subdecks, presets, tag notes and custom card types. Review history stays here."
          aside={
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a href={api.exportUrl({ deck: deck.name })} onClick={etudeDownload} download={`${deck.name.replace(/::/g, " - ").replace(/[/\\?%*:|"<>]/g, "")}.pack.json`}>
                <Download className="size-4" />Download
              </a>
            </Button>
          }
        />
      </Section>
      <Section title="Danger zone" tone="danger">
        <Block
          stackAside
          title={deck.archived ? "Move out of archive" : "Move to archive"}
          description={deck.archived ? "Returns this deck and its subdecks to the deck list and study." : "Hides this deck and its subdecks from the deck list and study. Cards keep their history."}
          aside={<Button variant="outline" size="sm" className="gap-1.5" disabled={deckActions.busy} onClick={() => deckActions.archive(deck.name, !deck.archived)}>{deck.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}{deck.archived ? "Restore" : "Archive"}</Button>}
        />
        <Block
          stackAside
          title="Delete deck"
          description={`Permanently removes the deck${hasChildren ? " and its subdecks" : ""}, including all cards and review history.`}
          aside={
            <Button variant="outline" size="sm" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={deckActions.busy} onClick={() => deckActions.requestDelete(deck.name)}>
              <Trash2 className="size-4" />Delete
            </Button>
          }
        />
      </Section>
      {deckActions.deleteDialog}
    </div>
  );
}

/** Adaptive decks: per-skill levels, today's pace, and a placement offer before anything is learned. */
function AdaptiveSummary({ deck, hasNew }: { deck: string; hasNew: boolean }) {
  const [summary, setSummary] = useState<LearnerSummary | null>(null);
  useEffect(() => {
    api.skills(deck).then(setSummary, () => setSummary(null));
  }, [deck]);
  if (!summary?.adaptive) return null;
  const answered = summary.skills.some((s) => s.answers > 0);
  const placed = summary.skills.some((s) => s.placement);
  const pct = (x: number | null) => (x == null ? "–" : `${Math.round(x * 100)}%`);
  return (
    <div className="mt-5 flex flex-col gap-3">
      {!answered && !placed && hasNew && (
        <Section>
          <Block
            title="Already know some of this?"
            description="Find your level in about ten minutes. Your answers count as real reviews, and earlier cards come up as quick checks. Or just start from the beginning."
            aside={<Button size="sm" onClick={() => navigate(`/study?${new URLSearchParams({ deck, placement: String(Date.now()) })}`)}>Find my level</Button>}
            stackAside
          />
        </Section>
      )}
      {(answered || placed) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          {summary.skills.map((s) => (
            <span key={s.skill} title={s.answers ? `${s.answers} answers, ${pct(s.success)} right recently` : undefined}>
              <span className="text-foreground">{s.skill}</span> {s.level ? `${s.level.tag.split("::").pop()} · ${pct(s.level.progress)} stable` : pct(s.success)}
            </span>
          ))}
          {summary.known.items > 0 && (
            <span title={summary.known.assumed ? `${summary.known.assumed} of them from your placement, until you miss one` : undefined}>
              <span className="text-foreground">{summary.known.items}</span> known
            </span>
          )}
          {summary.pace && (
            <span title={summary.pace.reason}>
              <span className="text-foreground">{summary.pace.value}</span> new today
            </span>
          )}
        </div>
      )}
    </div>
  );
}

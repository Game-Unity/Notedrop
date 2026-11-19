// The market: decks and card types other people shared, from a public GitHub repository.
// Browse and install here; Publish opens a pull request with the user's GitHub CLI.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Blocks, Check, Download, ExternalLink, Eye, GitPullRequest, Layers, Loader2, RefreshCw, Search, Store, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, Page, PageHeader } from "@/components/page";
import { CardPreview } from "@/components/card-preview";
import { download } from "@/components/type-editor/starter";
import { api, ApiError, type CardType, type MarketEntry, type MarketFile, type MarketKind, type PublishResult } from "@/lib/api";
import { EtudeImg } from "@/lib/local-url";
import { MarketGallery } from "@/components/market-gallery";
import { navigate, useLocation } from "@/lib/router";
import { cn } from "@/lib/utils";
import { serverless } from "@/lib/native";
import { LibraryView, PaidSidebar, PaidTile, SellingView, usePaidIndex } from "@/components/market-paid";
import type { PaidEntry } from "@/lib/account";
import { canShowPurchases, isNativeApp } from "@/lib/platform";
import { track } from "@/lib/telemetry";
import { SidebarFooter, SidebarHeader, SidebarScroll } from "@/components/sidebar/SidebarLayout";

type MarketPublishKind = Exclude<MarketKind, "theme">;
type MarketItem = Omit<MarketEntry, "kind"> & { kind: MarketPublishKind };
const KIND_LABEL: Record<MarketPublishKind, string> = { deck: "Deck", type: "Card type" };
const KIND_ICON: Record<MarketPublishKind, React.ComponentType<{ className?: string }>> = { deck: Layers, type: Blocks };
const GRADER_WORD: Record<string, string> = { self: "self-rated", script: "graded by script", ai: "AI-graded", hybrid: "script + AI" };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const kb = (b: number) => (b < 1e6 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1e6).toFixed(1)} MB`);

type Filter = "all" | MarketPublishKind;
type Tab = "browse" | "library" | "selling";

function isMarketItem(entry: MarketEntry): entry is MarketItem {
  return entry.kind !== "theme";
}

export function MarketPage({ sidebarHost, onSidebarOpenChange }: { sidebarHost: HTMLElement | null; onSidebarOpenChange(open: boolean): void }) {
  // Usage count (only when the person turned usage stats on).
  useEffect(() => track("market.open"), []);
  const { params } = useLocation();
  const requestedFilter = params.get("kind");
  const filter: Filter = requestedFilter === "deck" || requestedFilter === "type" ? requestedFilter : "all";
  // Store apps never sell, so they don't get the Selling tab.
  const tabs: Tab[] = isNativeApp() ? ["browse", "library"] : ["browse", "library", "selling"];
  const tab: Tab = tabs.includes(params.get("tab") as Tab) ? (params.get("tab") as Tab) : "browse";
  const paid = usePaidIndex();
  const [openPaid, setOpenPaid] = useState<PaidEntry | null>(null);
  const [data, setData] = useState<{ repo: string; url: string; entries: MarketItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<MarketItem | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setRefreshing(refresh);
    try {
      const d = await api.market(refresh);
      const visible = { repo: d.repo, url: d.url, entries: d.entries.filter(isMarketItem) };
      setData(visible);
      setError(null);
      return visible;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // ?entry=<kind>/<id> opens an entry directly (shareable links).
  useEffect(() => {
    const want = params.get("entry");
    if (!want || !data) return;
    const [k, id] = want.split("/");
    const hit = data.entries.find((e) => e.kind === k && e.id === id);
    if (hit) {
      setOpen(hit);
      setOpenPaid(null);
      onSidebarOpenChange(true);
    }
  }, [data, params.get("entry"), onSidebarOpenChange]);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (data?.entries ?? [])
      .filter((e) => filter === "all" || e.kind === filter)
      .filter((e) => words.every((w) => [e.name, e.description, e.author, ...e.tags].join(" ").toLowerCase().includes(w)));
  }, [data, filter, query]);

  const paidShown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return filter === "all" || filter === "deck" ? paid.entries.filter((e) => words.every((w) => [e.name, e.description, e.author, ...e.tags].join(" ").toLowerCase().includes(w))) : [];
  }, [paid.entries, filter, query]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, deck: 0, type: 0 };
    for (const e of data?.entries ?? []) {
      c.all++;
      c[e.kind]++;
    }
    c.all += paid.entries.length;
    c.deck += paid.entries.length;
    return c;
  }, [data, paid.entries]);
  const setTab = (t: Tab) => navigate(t === "browse" ? "/market" : `/market?tab=${t}`, { replace: true });

  const setFilter = (f: Filter) => navigate(f === "all" ? "/market" : `/market?kind=${f}`, { replace: true });
  const tabLabel: Record<Tab, string> = { browse: "Browse", library: "Library", selling: "Selling" };
  const openFreeEntry = (entry: MarketItem) => {
    setOpen(entry);
    setOpenPaid(null);
    onSidebarOpenChange(true);
  };
  const openPaidEntry = (entry: PaidEntry) => {
    setOpenPaid(entry);
    setOpen(null);
    onSidebarOpenChange(true);
  };
  const closePaidEntry = () => {
    setOpenPaid(null);
    onSidebarOpenChange(false);
  };
  const closeEntry = () => {
    setOpen(null);
    onSidebarOpenChange(false);
    if (params.get("entry")) navigate(filter === "all" ? "/market" : `/market?kind=${filter}`, { replace: true });
  };
  const selectTab = (t: Tab) => {
    if (t !== "browse") {
      setOpen(null);
      setOpenPaid(null);
      onSidebarOpenChange(false);
    }
    setTab(t);
  };

  return (
    <Page>
      <PageHeader
        title="Market"
        crumbs={[{ label: "Market", onClick: () => navigate("/market") }]}
        description={
          <>
            Decks and card types people made and shared.{" "}
            {data && (
              <a className="whitespace-nowrap underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground" href={`https://github.com/${data.repo}`} target="_blank" rel="noreferrer">
                Browse on GitHub
              </a>
            )}
          </>
        }
        actions={
          <>
            <Button variant="ghost" size="icon" aria-label="Refresh" onClick={() => load(true)} disabled={refreshing}>
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            </Button>
            {/* Publishing opens a pull request with the GitHub CLI on the desktop. */}
            {tab === "browse" && !serverless() && (
              <Button className="gap-1.5" onClick={() => setPublishing(true)}>
                <Upload className="size-4" /> Publish
              </Button>
            )}
          </>
        }
      />

      <nav className="nd-deck-tabs-nav mb-5 h-auto w-full justify-start gap-1.5 rounded-none border-b bg-transparent p-0 pb-3" aria-label="Market sections" data-market-tabs>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => selectTab(t)}
            aria-current={tab === t ? "page" : undefined}
            data-state={tab === t ? "active" : "inactive"}
            className="nd-deck-tab"
          >
            {tabLabel[t]}
          </button>
        ))}
      </nav>

      {tab === "library" && <LibraryView />}
      {tab === "selling" && <SellingView />}

      {tab === "browse" && (<>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <ToggleGroup type="single" variant="outline" value={filter} onValueChange={(v) => v && setFilter(v as Filter)} className="h-10 w-full sm:w-auto">
          {(["all", "deck", "type"] as Filter[]).map((f) => (
            <ToggleGroupItem key={f} value={f} className="h-10 flex-1 gap-1.5 px-2.5 text-[13px] sm:flex-none sm:px-3">
              {f === "all" ? "All" : f === "type" ? "Types" : `${KIND_LABEL[f]}s`}
              {data && <span className="text-muted-foreground tabular-nums">{counts[f]}</span>}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search names, tags, authors" className="h-10 pl-9" aria-label="Search the market" />
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border px-5 py-10 text-center">
          <Store className="mx-auto mb-3 size-6 text-muted-foreground" />
          <div className="text-sm font-medium">Couldn't load the market</div>
          <div className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">{error}</div>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => load(true)}>Try again</Button>
        </div>
      ) : !data ? (
        <div className="nd-deck-overview-container">
          <div className="nd-deck-overview-grid">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        </div>
      ) : shown.length === 0 && paidShown.length === 0 ? (
        <div className="rounded-xl border px-5 py-10 text-center text-sm text-muted-foreground">{query ? `Nothing matches “${query}”.` : "Nothing here yet. Be the first to publish one."}</div>
      ) : (
        <>
          {paidShown.length > 0 && (
            <section className="mb-8" data-paid-section>
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-base font-semibold">{canShowPurchases() ? "Paid decks" : "Your decks"}</h2>
                <span className="text-xs text-muted-foreground">{canShowPurchases() ? "From creators, sold on the Etude website" : "Bought with your Etude account"}</span>
              </div>
              <div className="nd-deck-overview-container">
                <div className="nd-deck-overview-grid">
                  {paidShown.map((e) => <PaidTile key={e.listing} entry={e} onOpen={() => openPaidEntry(e)} />)}
                </div>
              </div>
            </section>
          )}
          {shown.length > 0 && paidShown.length > 0 && <h2 className="mb-3 text-base font-semibold">Free</h2>}
          <div className="nd-deck-overview-container">
            <div className="nd-deck-overview-grid">
              {shown.map((e) => <EntryTile key={`${e.kind}/${e.id}`} entry={e} onOpen={() => openFreeEntry(e)} />)}
            </div>
          </div>
        </>
      )}
      </>)}
      {sidebarHost && openPaid && createPortal(
        <PaidSidebar
          entry={openPaid}
          signedIn={paid.signedIn}
          onClose={closePaidEntry}
          onChanged={() => void paid.reload().then(closePaidEntry)}
        />,
        sidebarHost,
      )}

      {sidebarHost && open && createPortal(
        <EntrySidebar
          entry={open}
          repo={data?.repo ?? ""}
          onClose={closeEntry}
          onInstalled={async () => {
            const d = await load(true);
            const fresh = d?.entries.find((x) => x.kind === open.kind && x.id === open.id);
            if (fresh) setOpen(fresh);
          }}
        />,
        sidebarHost,
      )}
      {publishing && <PublishDialog repo={data?.repo ?? ""} onClose={() => setPublishing(false)} />}
    </Page>
  );
}

// ------------------------------------------------------------------ tiles

function InstalledMark({ state }: { state: MarketEntry["installed"] }) {
  if (!state) return null;
  return (
    <span className="nd-deck-overview-badge gap-1">
      {state === "update" ? <RefreshCw className="size-3" /> : <Check className="size-3" strokeWidth={3} />}
      {state === "update" ? "Update" : "Installed"}
    </span>
  );
}

function Cover({ entry, large }: { entry: MarketItem; large?: boolean }) {
  const s = entry.summary as any;
  const Icon = KIND_ICON[entry.kind];
  if (entry.cover) {
    return (
      <div className={cn("aspect-[16/10] min-w-0 overflow-hidden rounded-lg", large && "rounded-xl")}>
        <EtudeImg src={api.marketCoverUrl(entry.kind, entry.id)} alt="" loading="lazy" className="size-full object-contain" />
      </div>
    );
  }
  const samples: string[] = s.samples ?? [];
  const chips: string[] =
    entry.kind === "deck"
      ? (s.decks as string[]).filter((d) => d.includes("::")).map((d) => d.split("::").pop()!)
      : (s.types as { fields: string[] }[]).flatMap((t) => t.fields);
  const meta =
    entry.kind === "deck"
      ? `${plural(s.items, "card")}${s.watch ? " · tour" : ""}`
      : (s.types as any[]).map((t) => GRADER_WORD[t.grader] ?? t.grader).join(", ");
  return (
    <div className={cn("flex aspect-[16/9] min-w-0 flex-col gap-2.5 overflow-hidden rounded-lg bg-muted/50 p-3.5 sm:aspect-[16/10]", large && "rounded-xl p-5")}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5 text-highlight" />
        <span>{KIND_LABEL[entry.kind]}</span>
        <span className="font-normal tracking-normal normal-case opacity-80">· {meta}</span>
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-1.5">
        {(samples.length ? samples : [entry.name]).slice(0, large ? 3 : 2).map((line, i) => (
          <div
            key={i}
            className={cn("rounded-md border bg-card px-3 py-2 font-[Latin_Modern_Roman,CMU_Serif,Georgia,serif] text-[15px] leading-snug text-card-foreground shadow-sm", samples.length > 1 ? "truncate" : "line-clamp-2")}
            style={{ marginLeft: i * 10, marginRight: -i * 10, opacity: 1 - i * 0.3 }}
          >
            {line}
          </div>
        ))}
      </div>
      <div className="flex max-h-[22px] min-w-0 flex-wrap gap-1 overflow-hidden">
        {chips.slice(0, 8).map((l, i) => (
          <span key={i} className="max-w-full truncate rounded bg-background/60 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">{l}</span>
        ))}
      </div>
    </div>
  );
}

function metaLine(entry: MarketItem): string {
  const s = entry.summary as any;
  if (entry.kind === "deck") return `Deck · ${plural(s.items, "card")}${s.watch ? " · tour" : ""}`;
  return `Card type · ${(s.types as any[]).map((t) => GRADER_WORD[t.grader] ?? t.grader).join(", ")}`;
}

function EntryTile({ entry, onOpen }: { entry: MarketItem; onOpen(): void }) {
  return (
    <button onClick={onOpen} className="nd-deck-card-tile nd-deck-overview-tile group relative flex w-full flex-col rounded-xl border bg-card/40 px-4 py-4 text-left transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <Cover entry={entry} />
      <div className="flex flex-col gap-1 px-1.5 pb-1.5">
        <div className="nd-deck-overview-heading flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.name}</span>
          <InstalledMark state={entry.installed} />
        </div>
        <div className="line-clamp-2 min-h-[2.5em] text-[13px] leading-snug text-muted-foreground">{entry.description || KIND_LABEL[entry.kind]}</div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{metaLine(entry)}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">by {entry.author}</span>
        </div>
      </div>
    </button>
  );
}

// ------------------------------------------------------------------ detail

function EntrySidebar({ entry, repo, onClose, onInstalled }: { entry: MarketItem; repo: string; onClose(): void; onInstalled(): void }) {
  const [file, setFile] = useState<MarketFile | null>(null);
  const [busy, setBusy] = useState<null | "install">(null);
  const s = entry.summary as any;

  useEffect(() => {
    if (entry.kind === "type") api.marketEntry(entry.kind, entry.id).then(setFile).catch((e) => toast.error("Couldn't load the card type", { description: (e as Error).message }));
  }, [entry.kind, entry.id]);

  const install = async () => {
    setBusy("install");
    try {
      const r = await api.marketInstall(entry.id, entry.kind);
      const what = entry.kind === "deck" ? "deck" : "card type";
      toast.success(r.result === "unchanged" ? `You already have the latest ${what}` : `${r.result === "updated" ? "Updated" : "Installed"} ${entry.name}`, {
        description: `${r.report.items.created} new, ${r.report.items.updated} updated item${r.report.items.updated === 1 ? "" : "s"}${r.report.types.created ? `, ${plural(r.report.types.created, "card type")}` : ""}.`,
      });
      onInstalled();
    } catch (e) {
      toast.error("Install failed", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const goTo = () => {
    onClose();
    if (entry.kind === "deck") navigate(`/deck?name=${encodeURIComponent(s.decks[0])}`);
    else navigate(`/types/${encodeURIComponent(s.types[0].id)}`);
  };

  return (
    <section className="nd-market-sidebar" aria-label={`${entry.name} details`}>
      <SidebarHeader className="shrink-0">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h2 className="min-w-0 text-sm font-semibold">{entry.name}</h2>
          <span className="text-xs text-muted-foreground">{KIND_LABEL[entry.kind]}</span>
          <InstalledMark state={entry.installed} />
        </div>
        <Button variant="ghost" size="icon" className="nd-types-sidebar-add size-8 transition-colors" aria-label="Close market details" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </SidebarHeader>
      <SidebarScroll className="min-h-0 flex-1">
        <div className="nd-market-sidebar-content">
        <div className="market-facts">
          <div className="market-fact"><span>Includes</span><strong>{entry.kind === "deck" ? plural(s.items, "card") : plural(s.items, "example")}</strong></div>
          <div className="market-fact"><span>{entry.kind === "deck" ? "Collection" : "Version"}</span><strong>{entry.kind === "deck" ? plural(s.decks.filter((d: string) => !s.decks.some((x: string) => x.startsWith(d + "::"))).length, "topic") : `v${entry.version}`}</strong></div>
          <div className="market-fact"><span>Download</span><strong>{kb(entry.bytes)}</strong></div>
          <div className="market-fact"><span>Creator</span><strong>{entry.author}</strong></div>
        </div>
        <MarketGallery key={`${entry.kind}/${entry.id}`} entry={entry} fallback={<Cover entry={entry} large />} />

        <section id="market-about" className="market-description mb-6">
          <h3 className="mb-3 text-sm font-medium">About this {entry.kind === "type" ? "card type" : entry.kind}</h3>
          <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{(entry.description || "No description yet.").split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</div>
        </section>
        {entry.kind === "type" && <section className="mb-6"><h3 className="mb-3 text-sm font-medium">Try it</h3><TypePreview file={file} /></section>}

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted-foreground">
          {entry.kind === "deck" && (
            <>
              {s.types.length > 0 && <span>Includes {s.types.map((t: any) => t.name).join(", ")}</span>}
              {s.watch && <span>Watch tour</span>}
            </>
          )}
          {entry.kind === "type" &&
            s.types.map((t: any) => (
              <span key={t.id}>
                <code className="text-foreground">{t.id}</code> · {GRADER_WORD[t.grader] ?? t.grader} · fields {t.fields.join(", ")}
              </span>
            ))}
          {entry.kind === "type" && s.items > 0 && <span>{plural(s.items, "example card")}</span>}
          <span>{kb(entry.bytes)}</span>
          {entry.tags.length > 0 && <span>{entry.tags.map((t) => `#${t}`).join(" ")}</span>}
        </div>
        </div>
      </SidebarScroll>
      <SidebarFooter className="flex shrink-0 items-center justify-between gap-3">
          <Button variant="ghost" size="sm" className="gap-1.5" asChild>
            <a href={`https://github.com/${repo}/blob/main/${entry.path}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" /> Source
            </a>
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            {entry.installed && <Button variant="outline" onClick={goTo}>Open</Button>}
            <Button className="gap-1.5" disabled={!!busy || entry.installed === "installed"} onClick={() => install()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : entry.installed === "installed" ? <Check className="size-4" /> : <Download className="size-4" />}
              {entry.installed === "update" ? "Update" : entry.installed ? "Installed" : "Install"}
            </Button>
          </div>
      </SidebarFooter>
    </section>
  );
}

/** The type's first example card, running for real: try it before installing. */
function TypePreview({ file }: { file: MarketFile | null }) {
  const def: CardType | undefined = file?.content.types?.[0];
  const sample = useMemo(() => file?.content.items?.find((i: any) => i.type === def?.id)?.fields ?? {}, [file, def?.id]);
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!def) return;
    api.frameHtml(def).then((r) => setHtml(r.html)).catch((e) => setErr((e as Error).message));
  }, [def]);
  const load = useCallback(async (seed: number, face: string) => {
    if (!def) return null;
    const r = await api.previewType(def, sample, { seed, face });
    if (!r.view) throw new Error(r.errors.join("\n"));
    return { view: r.view, key: r.key ?? {}, seed: r.seed ?? seed };
  }, [def, sample]);
  const grade = useCallback(async (answer: unknown, d: { seed: number }) => {
    if (!def) return null;
    const r = await api.previewType(def, sample, { seed: d.seed, answer });
    return r.grade ?? null;
  }, [def, sample]);
  if (err) return <div className="rounded-xl border p-4 text-sm text-destructive">{err}</div>;
  if (!def || !html) return <Skeleton className="h-72 rounded-xl" />;
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Eye className="size-3.5" /> Try it: this preview runs the card here and saves nothing.</div>
      <CardPreview html={html} version={`market:${def.id}`} load={load} faces={def.faces} generated={!!def.prepare} grade={def.grader.kind === "script" || def.grader.kind === "hybrid" ? grade : undefined} darkTheme markdownEditorStyle />
    </div>
  );
}

// ------------------------------------------------------------------ publish

function PublishDialog({ repo, onClose }: { repo: string; onClose(): void }) {
  const [kind, setKind] = useState<MarketPublishKind>("deck");
  const [options, setOptions] = useState<Record<MarketPublishKind, { value: string; label: string }[]> | null>(null);
  const [ref, setRef] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [version, setVersion] = useState("1");
  const [author, setAuthor] = useState("");
  const [gh, setGh] = useState<{ ok: boolean; login?: string; reason?: string } | null>(null);
  const [preview, setPreview] = useState<PublishResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<PublishResult | null>(null);

  useEffect(() => {
    api.publishStatus().then(setGh).catch(() => setGh({ ok: false, reason: "couldn't check gh" }));
    Promise.all([api.decks(), api.types()]).then(([d, ty]) => {
      setOptions({
        deck: d.filter((x) => x.cards > 0).map((x) => ({ value: x.name, label: `${"  ".repeat(x.depth)}${x.name.split("::").pop()}` })),
        type: ty.filter((x) => !x.builtin).map((x) => ({ value: x.id, label: `${x.name} (${x.id})` })),
      });
    });
  }, []);

  useEffect(() => {
    setRef("");
    setPreview(null);
    setProblem(null);
  }, [kind]);

  const input = () => ({ kind, ref, name: name || undefined, description: description || undefined, author: author || undefined, version: version || undefined, tags: tags.split(/[,\s]+/).filter(Boolean) });

  // Check the submission as it's filled in, so problems show before anything is sent.
  useEffect(() => {
    if (!ref) return;
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await api.publish({ ...input(), dryRun: true });
        if (!live) return;
        setPreview(r);
        setProblem(null);
      } catch (e) {
        if (!live) return;
        setPreview(null);
        setProblem((e as Error).message);
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [kind, ref, name, description, tags, version, author]);

  const send = async () => {
    setSending(true);
    try {
      const r = await api.publish(input());
      setDone(r);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      toast.error("Couldn't open the pull request", { description: msg });
    } finally {
      setSending(false);
    }
  };

  const saveFile = async () => {
    const r = await api.publish({ ...input(), dryRun: true, full: true });
    if (r.file) download(`${r.file.id}.json`, r.file);
  };

  const list = options?.[kind] ?? [];

  if (done) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pull request opened</DialogTitle>
            <DialogDescription>
              {done.entry.name} goes live for everyone once it's reviewed and merged{done.fork ? `. It came from your fork ${done.fork}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button className="gap-1.5" asChild>
              <a href={done.url} target="_blank" rel="noreferrer"><GitPullRequest className="size-4" /> See #{done.number}</a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish to the market</DialogTitle>
          <DialogDescription>
            This opens a pull request on <span className="text-foreground">{repo}</span>. Decks go without your review history.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <ToggleGroup type="single" variant="outline" value={kind} onValueChange={(v) => v && setKind(v as MarketPublishKind)} className="w-full">
            {(["deck", "type"] as MarketPublishKind[]).map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <ToggleGroupItem key={k} value={k} className="flex-1 gap-1.5 text-[13px]">
                  <Icon className="size-4" /> {KIND_LABEL[k]}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>

          <Field label={kind === "deck" ? "Deck" : "Card type"} hint={list.length === 0 && options ? (kind === "type" ? "Only your own card types can be published." : "No decks with cards yet.") : undefined}>
            <Select value={ref} onValueChange={setRef} disabled={!list.length}>
              <SelectTrigger className="h-10 w-full"><SelectValue placeholder={options ? "Choose one" : "Loading…"} /></SelectTrigger>
              <SelectContent>
                {list.map((o) => <SelectItem key={o.value} value={o.value}><span className="whitespace-pre">{o.label}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Name" hint="Shown in the market. Leave empty to use its current name.">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={preview?.entry.name} className="h-10" />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={preview?.entry.description || "What it is and who it's for"} rows={3} />
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Tags" hint="Separated by spaces or commas.">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="beginner, dark, music" className="h-10" />
            </Field>
            <Field label="Version">
              <Input value={version} onChange={(e) => setVersion(e.target.value)} className="h-10 w-20" />
            </Field>
          </div>
          <Field label="Credit as" hint={gh?.ok ? `Default: your GitHub login, ${gh.login}.` : undefined}>
            <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder={gh?.login ?? "your name"} className="h-10" />
          </Field>

          {problem && <p className="rounded-md border border-destructive/30 px-3 py-2 text-[13px] text-destructive">{problem}</p>}
          {preview && (
            <p className="text-[13px] text-muted-foreground">
              Adds <code className="text-foreground">{preview.path}</code> ({kb(preview.bytes)}).
            </p>
          )}
          {gh && !gh.ok && (
            <p className="rounded-md border px-3 py-2 text-[13px] text-muted-foreground">
              To open the pull request from here, Notedrop needs the GitHub CLI signed in on the machine running it ({gh.reason}). You can also save the file and add it on GitHub yourself.
            </p>
          )}
        </div>

        <DialogFooter className="sticky -bottom-[calc(1.25rem+env(safe-area-inset-bottom))] -mx-5 -mb-[calc(1.25rem+env(safe-area-inset-bottom))] gap-2 border-t bg-background/95 px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] backdrop-blur sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6 sm:pb-6">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {preview && (
            <Button variant="outline" className="gap-1.5" onClick={saveFile}>
              <Download className="size-4" /> Save file
            </Button>
          )}
          {gh && !gh.ok && preview ? (
            <Button className="gap-1.5" asChild>
              <a href={preview.manualUrl} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Add on GitHub</a>
            </Button>
          ) : (
            <Button className="gap-1.5" disabled={!preview || sending || !gh?.ok} onClick={send}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <GitPullRequest className="size-4" />} Open pull request
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

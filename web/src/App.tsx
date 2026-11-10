import { autoSync } from "@/lib/sync";
import { Archive, BarChart3, Blocks, Layers, Library, Settings, Sparkles, Store, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SidebarIcon } from "@/components/sidebar-icon";
import { navigate, useLocation } from "@/lib/router";
import { Wordmark } from "@/components/logo";
import { cn } from "@/lib/utils";
import { DecksPage } from "@/pages/decks";
import { StudyPage } from "@/pages/study";
import { WatchPage } from "@/pages/watch";
import { DeckPage } from "@/pages/deck";
import { BrowsePage } from "@/pages/browse";
import { TypesPage } from "@/pages/types";
import { StatsPage } from "@/pages/stats";
import { SettingsPage } from "@/pages/settings";
import { EmbedStudy } from "@/pages/embed";
import { MarketPage } from "@/pages/market";
import { AGENT_SHORTCUT, AgentPanel, announceDataChange, useAgentPanel } from "@/components/agent-panel";
import { SidebarUpdate, useUpdateDot } from "@/components/update-bar";
import { PhoneTabBar } from "@/components/phone-shell";
import { MorePage } from "@/pages/more";
import { usePhone } from "@/lib/phone";
import { Onboarding, ONBOARDING_EVENT } from "@/components/onboarding";
import { api } from "@/lib/api";
import { NoteDropTree } from "@/components/notedrop-tree";
import { NoteDropSidePanel } from "@/components/notedrop-side-panel";
import { invalidateProgress } from "@/lib/notedrop-progress";
import { ItemEditor, NewItemDialog } from "@/components/item-editor";
import type { TypeSummary } from "@/lib/api";
import { toast } from "sonner";

/** First-run setup: shown when the collection has no decks and setup wasn't finished or skipped, or on request. */
function useOnboarding(skip: boolean) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (skip) return;
    let live = true;
    api.onboarding().then((o) => live && o.show && setOpen(true)).catch(() => {});
    return () => {
      live = false;
    };
  }, [skip]);
  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener(ONBOARDING_EVENT, h);
    return () => window.removeEventListener(ONBOARDING_EVENT, h);
  }, []);
  return [open, setOpen] as const;
}

const NAV = [
  { to: "/", label: "Decks", icon: Layers, match: (p: string) => p === "/" || p === "/deck" },
  { to: "/archive", label: "Archive", icon: Archive, match: (p: string) => p === "/archive" },
  { to: "/browse", label: "Browse", icon: Library, match: (p: string) => p === "/browse" },
  { to: "/types", label: "Card types", icon: Blocks, match: (p: string) => p.startsWith("/types") },
  { to: "/market", label: "Market", icon: Store, match: (p: string) => p === "/market" },
  { to: "/stats", label: "Stats", icon: BarChart3, match: (p: string) => p === "/stats" },
];

const SETTINGS_NAV = { to: "/settings", label: "Settings", icon: Settings, match: (p: string) => p === "/settings" };

const COLLAPSED_KEY = "etude.sidebar.collapsed";
/** Pages that only show the collection, so a sync that brought changes can reload them safely. */
const RELOAD_ON_SYNC = new Set(["/", "/archive", "/deck", "/stats", "/more"]);
const toggleKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘B" : "Ctrl+B";

type DeckPanelMode = "overview" | "create" | "edit";
type PanelDestination = { mode: "overview" | "create" } | { mode: "edit"; itemId: string };
type SidePanelContext = {
  path: string;
  deckName: string;
  dataKey: number;
  mode: DeckPanelMode;
  itemId: string | null;
  onChanged(): void;
  onClose(): void;
  onOpenCard(itemId: string): void;
  onSavedEdit(): void;
  onDirtyChange(dirty: boolean): void;
};
const SIDE_PANEL_CONTENTS: {
  id: string;
  matches(context: SidePanelContext): boolean;
  render(context: SidePanelContext): React.ReactNode;
}[] = [
  {
    id: "notedrop-tree",
    matches: ({ path, deckName, mode }) => path === "/deck" && Boolean(deckName) && mode === "overview",
    render: ({ deckName, dataKey }) => <NoteDropTree deckName={deckName} dataKey={dataKey} />,
  },
  {
    id: "deck-card-editor",
    matches: ({ path, deckName, mode }) => path === "/deck" && Boolean(deckName) && mode !== "overview",
    render: (context) => <DeckCardPanel {...context} />,
  },
];

function DeckCardPanel({ deckName, mode, itemId, onChanged, onClose, onOpenCard, onSavedEdit, onDirtyChange }: SidePanelContext) {
  const [decks, setDecks] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [types, setTypes] = useState<TypeSummary[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([api.decks(), api.tags(), api.types()]).then(([deckRows, tagRows, typeRows]) => {
      if (!active) return;
      setDecks(deckRows.map((deck) => deck.name));
      setTags(tagRows.map((tag) => tag.tag));
      setTypes(typeRows);
    }).catch((error) => {
      if (active) toast.error("Couldn't load card editor options", { description: (error as Error).message });
    });
    return () => { active = false; };
  }, []);

  if (mode === "create") {
    return (
      <div className="nd-card-create-panel flex h-full min-h-0 flex-col">
        <div className="nd-card-create-title flex shrink-0 items-center justify-between border-b pb-3">
          <h2 className="text-lg font-semibold">Add a card</h2>
          <Button variant="ghost" size="icon" aria-label="Close card editor" onClick={onClose}><X className="size-4" /></Button>
        </div>
        <NewItemDialog open inline onOpenChange={(open) => !open && onClose()} decks={decks} types={types} defaultDeck={deckName} onCreated={onChanged} />
      </div>
    );
  }

  if (!itemId) return null;
  return (
    <ItemEditor
      key={itemId}
      id={itemId}
      decks={decks}
      tags={tags}
      closeAlways
      onBack={onClose}
      onSaved={onChanged}
      onSaveSuccess={onSavedEdit}
      onDirtyChange={onDirtyChange}
      onDeleted={() => { onSavedEdit(); onChanged(); }}
      onDuplicate={(id) => { onChanged(); onOpenCard(id); }}
    />
  );
}

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === "1");
  useEffect(() => localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0"), [collapsed]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return [collapsed, setCollapsed] as const;
}

export function App() {
  const { path, params } = useLocation();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const studying = path === "/study" || path === "/watch";
  // Sync on its own, so every device shows the same collection without anyone pressing Sync:
  // local changes go up within ~10 s, other devices' changes come down every 30 s and whenever
  // the app comes back to the front. Not during a study session, which syncs when it ends.
  const received = useRef<number | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;
  useEffect(() => {
    if (studying) return;
    let stop = false;
    const run = async (o?: { pendingOnly?: boolean }) => {
      const st = await autoSync(o);
      if (stop || typeof st?.received !== "number") return;
      const before = received.current;
      received.current = st.received;
      // Changes came in: reload the page's data where nothing is being edited.
      if (before !== null && st.received > before && RELOAD_ON_SYNC.has(pathRef.current)) {
        invalidateProgress();
        setDataKey((k) => k + 1);
      }
    };
    void run();
    const pull = setInterval(() => void run(), 30_000);
    const push = setInterval(() => void run({ pendingOnly: true }), 10_000);
    const wake = () => document.visibilityState === "visible" && void run();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      stop = true;
      clearInterval(pull);
      clearInterval(push);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [studying]);
  const agent = useAgentPanel();
  const updateDot = useUpdateDot();
  const phone = usePhone();
  // Bumped after the assistant changed something, so the page remounts and reloads its data.
  const [dataKey, setDataKey] = useState(0);
  const [onboarding, setOnboarding] = useOnboarding(path === "/embed");
  const deckName = params.get("name") ?? "";
  const [panel, setPanel] = useState<{ mode: DeckPanelMode; itemId: string | null }>(() => ({
    mode: path === "/deck" && params.get("item") ? "edit" : "overview",
    itemId: path === "/deck" ? params.get("item") : null,
  }));
  const [panelDirty, setPanelDirty] = useState(false);
  const [confirmPanelChange, setConfirmPanelChange] = useState(false);
  const [pendingPanel, setPendingPanel] = useState<PanelDestination | null>(null);
  const panelRoute = path === "/deck" ? `${path}:${deckName}` : path;
  const previousPanelRoute = useRef(panelRoute);
  useEffect(() => {
    if (previousPanelRoute.current === panelRoute) return;
    previousPanelRoute.current = panelRoute;
    const itemId = path === "/deck" ? params.get("item") : null;
    setPanel({ mode: itemId ? "edit" : "overview", itemId });
    setPanelDirty(false);
    setConfirmPanelChange(false);
    setPendingPanel(null);
  }, [panelRoute, path, params]);

  const updatePanelUrl = (itemId: string | null) => {
    if (path !== "/deck") return;
    const query = new URLSearchParams(location.search);
    if (itemId) query.set("item", itemId);
    else query.delete("item");
    history.replaceState(null, "", `${location.pathname}${query.size ? `?${query}` : ""}`);
  };
  const applyPanelDestination = (destination: PanelDestination) => {
    const itemId = destination.mode === "edit" ? destination.itemId : null;
    setPanel({ mode: destination.mode, itemId });
    setPanelDirty(false);
    updatePanelUrl(itemId);
  };
  const requestPanelDestination = (destination: PanelDestination) => {
    if (destination.mode === panel.mode && (destination.mode !== "edit" || destination.itemId === panel.itemId)) return;
    if (panel.mode === "edit" && panelDirty) {
      setPendingPanel(destination);
      setConfirmPanelChange(true);
      return;
    }
    applyPanelDestination(destination);
  };
  const openPanelCard = (itemId: string) => requestPanelDestination({ mode: "edit", itemId });
  const closePanel = (discard = false) => discard
    ? applyPanelDestination({ mode: "overview" })
    : requestPanelDestination({ mode: "overview" });
  const closePanelAfterSave = () => applyPanelDestination({ mode: "overview" });
  const sidePanelContext: SidePanelContext = {
    path,
    deckName,
    dataKey,
    mode: panel.mode,
    itemId: panel.itemId,
    onChanged: () => {
      invalidateProgress();
      setDataKey((key) => key + 1);
    },
    onClose: closePanel,
    onOpenCard: openPanelCard,
    onSavedEdit: closePanelAfterSave,
    onDirtyChange: setPanelDirty,
  };
  const sidePanelContents = SIDE_PANEL_CONTENTS
    .filter((registration) => registration.matches(sidePanelContext))
    .map((registration) => <Fragment key={registration.id}>{registration.render(sidePanelContext)}</Fragment>);
  if (path === "/embed") {
    const deck = params.get("deck") ?? undefined;
    const q = params.get("q") ?? undefined;
    const card = params.get("card") ? Number(params.get("card")) : undefined;
    const title = params.get("title") ?? (deck ? deck.split("::").pop()! : q ? q : "Etude");
    return (
      <TooltipProvider delayDuration={300}>
        <EmbedStudy scope={{ deck, q }} limit={Math.max(1, Number(params.get("n") ?? 10))} cardId={card} title={title} />
      </TooltipProvider>
    );
  }
  let page: React.ReactNode;
  if (path === "/watch") {
    const deck = params.get("deck") ?? undefined;
    const q = params.get("q") ?? undefined;
    page = <WatchPage key={`${deck}|${q}`} scope={{ deck, q }} title={deck ? deck.split("::").pop()! : q ? `Search: ${q}` : "All cards"} />;
  } else if (studying) {
    const deck = params.get("deck") ?? undefined;
    const q = params.get("q") ?? undefined;
    const card = params.get("card") ? Number(params.get("card")) : undefined;
    const ahead = params.get("ahead") === "1";
    const placement = (deck && params.get("placement")) || undefined;
    page = <StudyPage key={`${deck}|${q}|${card}|${ahead}|${placement}`} scope={{ deck, q, ahead, placement }} startCard={card} title={deck ? deck.split("::").pop()! : q ? `Search: ${q}` : "All cards"} />;
  } else if (path === "/deck") page = (
    <DeckPage
      key={deckName}
      name={deckName}
      dataKey={dataKey}
      activeItemId={panel.mode === "edit" ? panel.itemId : null}
      onOpenCard={openPanelCard}
      onCreateCard={() => requestPanelDestination({ mode: "create" })}
      onClosePanel={closePanel}
    />
  );
  else if (path === "/browse") page = <BrowsePage initialQuery={params.get("q") ?? ""} openItem={params.get("item")} />;
  else if (path.startsWith("/types")) page = <TypesPage id={path.split("/")[2] ? decodeURIComponent(path.split("/")[2]) : null} />;
  else if (path === "/stats") page = <StatsPage deck={params.get("deck") ?? undefined} />;
  else if (path === "/settings") page = <SettingsPage />;
  else if (path === "/market") page = <MarketPage />;
  else if (path === "/more") page = <MorePage />;
  else page = <DecksPage key={path} archived={path === "/archive"} />;

  const renderNavItem = (n: (typeof NAV)[number]) => {
    const btn = (
      <button
        key={n.to}
        onClick={() => navigate(n.to)}
        aria-label={n.label}
        aria-current={n.match(path) ? "page" : undefined}
        className={cn(
          "flex h-8 items-center gap-2.5 rounded-md text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
          collapsed || phone ? "justify-center px-0" : "px-2",
          n.match(path) && "font-medium text-foreground",
        )}
      >
        <n.icon className={cn("size-4 shrink-0", n.match(path) && "text-highlight")} />
        {!collapsed && !phone && <span className="nd-primary-sidebar-label whitespace-nowrap">{n.label}</span>}
      </button>
    );
    return collapsed ? (
      <Tooltip key={n.to}>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="right">{n.label}</TooltipContent>
      </Tooltip>
    ) : (
      btn
    );
  };

  const askEtudeItem = (() => {
    const btn = (
      <button
        onClick={() => agent.setOpen(!agent.open)}
        aria-label="Ask Etude"
        data-agent-launcher
        className={cn(
          "flex h-8 items-center gap-2.5 rounded-md text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
          collapsed || phone ? "justify-center px-0" : "px-2",
          agent.open && "font-medium text-foreground",
        )}
      >
        <Sparkles className={cn("size-4 shrink-0", agent.open && "text-highlight")} />
        {!collapsed && !phone && <span className="nd-primary-sidebar-label whitespace-nowrap">Ask Etude</span>}
      </button>
    );
    return (
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="right">
          Ask Etude <span className="opacity-60">· {AGENT_SHORTCUT}</span>
        </TooltipContent>
      </Tooltip>
    );
  })();

  return (
    <TooltipProvider delayDuration={300}>
      {studying ? (
        page
      ) : (
        <div
          className={cn("nd-app-shell flex min-h-dvh", path === "/deck" && "nd-app-shell--deck")}
          data-panel-mode={panel.mode === "overview" ? "overview" : "editor"}
          data-sidebar-collapsed={collapsed}
          data-agent-open={agent.open}
          style={{ "--agent-offset": agent.open ? `${agent.width}px` : "0px", } as React.CSSProperties}
        >
          <aside
            className={cn(
              "nd-primary-sidebar sticky top-0 flex h-dvh shrink-0 flex-col gap-1 overflow-hidden bg-sidebar py-4 transition-[width] duration-200 ease-out",
              collapsed || phone ? "w-14 px-2" : "w-52 px-3",
            )}
          >
            <div className={cn("nd-primary-sidebar-header mb-6 flex h-8 items-center", collapsed || phone ? "justify-center" : "justify-between pl-2")}>
              {!collapsed && !phone && (
                <button onClick={() => navigate("/")} className="nd-primary-sidebar-brand text-left">
                  <Wordmark className="text-[1.45rem] leading-none" />
                </button>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setCollapsed((c) => !c)}
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    aria-expanded={!collapsed}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                  >
                    <SidebarIcon className="size-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {collapsed ? "Expand" : "Collapse"} <span className="opacity-60">{toggleKey}</span>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="nd-primary-sidebar-nav my-auto flex flex-col gap-1">
              {NAV.map(renderNavItem)}
            </div>
            <div className="nd-primary-sidebar-nav flex flex-col gap-1 pt-4">
              {askEtudeItem}
              {renderNavItem(SETTINGS_NAV)}
              <SidebarUpdate collapsed={collapsed || phone} />
            </div>
          </aside>
          <main key={path === "/deck" ? `deck:${deckName}` : dataKey} className="nd-app-content min-w-0 flex-1 pb-16">{page}</main>
          <NoteDropSidePanel visible={path === "/deck" && Boolean(sidePanelContext.deckName)} mode={panel.mode === "overview" ? "overview" : "editor"}>
            {sidePanelContents}
          </NoteDropSidePanel>
          {agent.open && (
            <AgentPanel
              width={agent.width}
              setWidth={agent.setWidth}
              onClose={() => agent.setOpen(false)}
              onChanged={(final) => {
                announceDataChange();
                if (final) {
                  invalidateProgress();
                  setDataKey((k) => k + 1);
                }
              }}
            />
          )}
          {!phone && <PhoneTabBar path={path} updateDot={updateDot} onAsk={() => agent.setOpen(true)} />}
        </div>
      )}
      <AlertDialog
        open={confirmPanelChange}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmPanelChange(false);
            setPendingPanel(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>Your changes to this card haven't been saved. Continue and discard them?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setConfirmPanelChange(false); setPendingPanel(null); }}>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => {
              if (pendingPanel) applyPanelDestination(pendingPanel);
              setPendingPanel(null);
              setConfirmPanelChange(false);
            }}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {onboarding && (
        <Onboarding
          onFinish={() => {
            setOnboarding(false);
            invalidateProgress();
            setDataKey((k) => k + 1);
          }}
        />
      )}
      <Toaster position={phone ? "bottom-center" : "top-center"} mobileOffset={phone ? { bottom: studying ? 104 : 92, left: 12, right: 12 } : undefined} />
    </TooltipProvider>
  );
}

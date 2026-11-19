import { AgentChat } from "./panels/AgentChat";
import { CardEditor } from "./panels/CardEditor";
import { CardTypePreview } from "./panels/CardTypePreview";
import { DeckTree } from "./panels/DeckTree";
import { MarketContent } from "./panels/MarketContent";
import { SettingsNavigation } from "./panels/SettingsNavigation";
import type { SidebarContext, SidebarPanelMode, SidebarRegistration } from "./SidebarTypes";

const sidebars: SidebarRegistration[] = [
  {
    id: "agent-chat",
    matches: ({ chatOpen }) => chatOpen,
    render: ({ onCloseChat, onAgentChanged }) => <AgentChat onCloseChat={onCloseChat} onAgentChanged={onAgentChanged} />,
  },
  {
    id: "type-library",
    matches: ({ path, chatOpen }) => !chatOpen && path === "/types",
    render: ({ onTypeSidebarHost }) => <div ref={onTypeSidebarHost} className="nd-types-sidebar-host" />,
  },
  {
    id: "type-card-preview",
    matches: ({ path, chatOpen }) => !chatOpen && path.startsWith("/types/") && Boolean(path.split("/")[2]),
    render: ({ onTypePreviewHost, onTypePreviewFooterHost, onTypePreviewEditorHost }) => (
      <CardTypePreview onHost={onTypePreviewHost} onFooterHost={onTypePreviewFooterHost} onEditorHost={onTypePreviewEditorHost} />
    ),
  },
  {
    id: "market-content",
    matches: ({ path, chatOpen }) => !chatOpen && path === "/market",
    render: ({ onMarketSidebarHost }) => <MarketContent onHost={onMarketSidebarHost} />,
  },
  {
    id: "settings",
    matches: ({ path, chatOpen }) => !chatOpen && path === "/settings",
    render: () => <SettingsNavigation />,
  },
  {
    id: "deck-tree",
    matches: ({ path, deckName, mode, chatOpen }) => !chatOpen && path === "/deck" && Boolean(deckName) && mode === "overview",
    render: ({ deckName, dataKey }) => <DeckTree deckName={deckName} dataKey={dataKey} />,
  },
  {
    id: "deck-card-editor",
    matches: ({ path, deckName, mode, itemId, chatOpen }) => !chatOpen && (
      (path === "/deck" && Boolean(deckName) && mode !== "overview")
      || (path === "/study" && mode === "edit" && Boolean(itemId))
    ),
    render: (context) => <CardEditor {...context} />,
  },
];

export function SidebarManager({ context, visible, mode }: { context: SidebarContext; visible: boolean; mode: SidebarPanelMode }) {
  const sidebar = sidebars.find((entry) => entry.matches(context));

  return (
    <aside className="nd-side-panel" aria-label="Side panel" data-mode={mode} hidden={!visible}>
      {sidebar?.render(context)}
    </aside>
  );
}

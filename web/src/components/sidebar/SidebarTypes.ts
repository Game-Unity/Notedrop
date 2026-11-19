import type { ReactNode } from "react";

export type SidebarPanelMode = "overview" | "editor" | "chat" | "types" | "type-preview" | "market" | "settings";

export type SidebarContext = {
  path: string;
  deckName: string;
  onTypeSidebarHost(host: HTMLDivElement | null): void;
  onTypePreviewHost(host: HTMLElement | null): void;
  onTypePreviewFooterHost(host: HTMLElement | null): void;
  onTypePreviewEditorHost(host: HTMLElement | null): void;
  onMarketSidebarHost(host: HTMLDivElement | null): void;
  dataKey: number;
  mode: "overview" | "create" | "edit";
  itemId: string | null;
  chatOpen: boolean;
  phone: boolean;
  saveRef: { current: (() => Promise<boolean>) | null };
  onChanged(): void;
  onClose(): void;
  onOpenCard(itemId: string): void;
  onSavedEdit(): void;
  onDeletedEdit(): void;
  onDirtyChange(dirty: boolean): void;
  onCloseChat(): void;
  onAgentChanged(final: boolean): void;
};

export type CardEditorProps = Pick<SidebarContext,
  | "deckName"
  | "mode"
  | "itemId"
  | "saveRef"
  | "onChanged"
  | "onClose"
  | "onOpenCard"
  | "onSavedEdit"
  | "onDeletedEdit"
  | "onDirtyChange"
>;

export type SidebarRegistration = {
  id: "agent-chat" | "type-library" | "type-card-preview" | "deck-tree" | "deck-card-editor" | "market-content" | "settings";
  matches(context: SidebarContext): boolean;
  render(context: SidebarContext): ReactNode;
};

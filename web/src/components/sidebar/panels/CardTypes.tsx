import type { ReactNode } from "react";
import { FolderPlus } from "lucide-react";
import { TooltipHint } from "@/components/ui/tooltip";
import { SidebarHeader, SidebarScroll } from "../SidebarLayout";

export function CardTypes({ onNewFolder, topLevelItem, folderContent, builtInItem }: {
  onNewFolder(): void;
  topLevelItem: ReactNode;
  folderContent: ReactNode;
  builtInItem: ReactNode;
}) {
  return (
    <nav aria-label="Card type folders" className="nd-types-sidebar flex h-full min-h-0 flex-col gap-0.5 text-sm">
      <SidebarHeader className="nd-types-sidebar-header mb-3 shrink-0">
        <h2 className="min-w-0 flex-1 text-sm font-semibold">Card types</h2>
        <TooltipHint label="New folder"><button className="nd-types-sidebar-add flex size-8 items-center justify-center rounded-md transition-colors" onClick={onNewFolder} aria-label="New folder">
          <FolderPlus className="size-4" />
        </button></TooltipHint>
      </SidebarHeader>
      {topLevelItem}
      <h3 className="nd-types-sidebar-heading mt-4 mb-1.5 shrink-0 text-sm font-medium">Folders</h3>
      <SidebarScroll className="nd-types-sidebar-scroll min-h-0 flex-1">
        {folderContent}
      </SidebarScroll>
      <div className="nd-types-sidebar-divider my-3 h-px shrink-0" />
      {builtInItem}
    </nav>
  );
}

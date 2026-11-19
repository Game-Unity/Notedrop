import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarFooter, SidebarHeader, SidebarScroll } from "../SidebarLayout";

export function CardTypePreview({ onHost, onFooterHost, onEditorHost }: { onHost(host: HTMLElement | null): void; onFooterHost(host: HTMLElement | null): void; onEditorHost(host: HTMLElement | null): void }) {
  const [tab, setTab] = useState("preview");

  return (
    <section className="nd-card-preview-sidebar" aria-label="Type editor and card preview">
      <Tabs value={tab} onValueChange={setTab} className="nd-card-preview-sidebar-tabs">
        <SidebarHeader className="nd-item-editor-title shrink-0">
          <TabsList variant="line" className="nd-item-editor-tabs-list">
            <TabsTrigger value="preview" className="nd-item-editor-tab">Preview</TabsTrigger>
            <TabsTrigger value="editor" className="nd-item-editor-tab">Editor</TabsTrigger>
          </TabsList>
        </SidebarHeader>
        <TabsContent value="preview" forceMount className="nd-card-preview-sidebar-pane">
          <SidebarScroll ref={onHost} className="nd-card-preview-sidebar-scroll">
            <div className="nd-card-preview-sidebar-content" />
          </SidebarScroll>
          <SidebarFooter ref={onFooterHost} className="nd-card-preview-sidebar-footer flex items-center justify-end gap-2" />
        </TabsContent>
        <TabsContent value="editor" forceMount className="nd-card-preview-sidebar-pane nd-item-editor-panel">
          <SidebarScroll className="nd-card-preview-sidebar-scroll">
            <div ref={onEditorHost} className="nd-card-preview-sidebar-content" />
          </SidebarScroll>
        </TabsContent>
      </Tabs>
    </section>
  );
}

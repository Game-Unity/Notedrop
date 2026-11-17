import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function TypePreviewSidebar({ onHost, onFooterHost, onEditorHost }: { onHost(host: HTMLElement | null): void; onFooterHost(host: HTMLElement | null): void; onEditorHost(host: HTMLElement | null): void }) {
  const [tab, setTab] = useState("preview");

  return (
    <section className="nd-card-preview-sidebar" aria-label="Type editor and card preview">
      <Tabs value={tab} onValueChange={setTab} className="nd-card-preview-sidebar-tabs">
        <div className="nd-item-editor-title nd-item-editor-tabs-nav shrink-0">
          <TabsList variant="line" className="nd-item-editor-tabs-list">
            <TabsTrigger value="preview" className="nd-item-editor-tab">Preview</TabsTrigger>
            <TabsTrigger value="editor" className="nd-item-editor-tab">Editor</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="preview" forceMount className="nd-card-preview-sidebar-pane">
          <div ref={onHost} className="nd-card-preview-sidebar-scroll nd-side-panel-scroll">
            <div className="nd-card-preview-sidebar-content" />
          </div>
          <div ref={onFooterHost} className="nd-card-preview-sidebar-footer nd-item-editor-footer flex shrink-0 items-center justify-end gap-2 border-t bg-background py-3" />
        </TabsContent>
        <TabsContent value="editor" forceMount className="nd-card-preview-sidebar-pane nd-item-editor-panel">
          <div className="nd-card-preview-sidebar-scroll nd-side-panel-scroll">
            <div ref={onEditorHost} className="nd-card-preview-sidebar-content" />
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

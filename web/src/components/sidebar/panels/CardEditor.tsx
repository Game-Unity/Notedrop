import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipHint } from "@/components/ui/tooltip";
import { ItemEditor, NewItemDialog } from "@/components/item-editor";
import { api, type TypeSummary } from "@/lib/api";
import { toast } from "sonner";
import type { CardEditorProps } from "../SidebarTypes";
import { SidebarHeader } from "../SidebarLayout";

export function CardEditor({ deckName, mode, itemId, saveRef, onChanged, onClose, onOpenCard, onSavedEdit, onDeletedEdit, onDirtyChange }: CardEditorProps) {
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
        <SidebarHeader className="nd-card-create-title shrink-0">
          <h2 className="min-w-0 flex-1 text-sm font-semibold">Add a card</h2>
          <TooltipHint label="Close card editor"><Button variant="ghost" size="icon" className="nd-types-sidebar-add size-8 transition-colors" aria-label="Close card editor" onClick={onClose}><X className="size-4" /></Button></TooltipHint>
        </SidebarHeader>
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
      saveRef={saveRef}
      onBack={onClose}
      onSaved={onChanged}
      onSaveSuccess={onSavedEdit}
      onDirtyChange={onDirtyChange}
      onDeleted={() => { onDeletedEdit(); onChanged(); }}
      onDuplicate={(id) => { onChanged(); onOpenCard(id); }}
    />
  );
}

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export function NewDeckDialog({ open, onOpenChange, onDone, parent }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onDone(createdName: string): unknown;
  parent?: string;
}) {
  const [name, setName] = useState("");
  const create = async () => {
    const leaf = name.trim();
    if (!leaf) return;
    if (parent && leaf.includes("::")) {
      toast.error("A subdeck name can't contain ::");
      return;
    }
    const createdName = parent ? `${parent}::${leaf}` : leaf;
    try {
      await api.createDeck(createdName);
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    onOpenChange(false);
    setName("");
    try {
      await onDone(createdName);
    } catch (e) {
      toast.error(`Created ${leaf}, but couldn't finish updating the deck list.`, { description: (e as Error).message });
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{parent ? "New subdeck" : "New deck"}</DialogTitle>
          <DialogDescription>{parent ? `Create a subdeck inside ${parent.split("::").at(-1)}.` : "Use :: for subdecks, like Course::Week 1."}</DialogDescription>
        </DialogHeader>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder={parent ? "Subdeck name" : "Deck name"} aria-label={parent ? "Subdeck name" : "Deck name"} />
        <DialogFooter>
          <Button onClick={create} disabled={!name.trim()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useRef, useState } from "react";
import { FolderInput, Image, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { DeckContextMenu, useDeckActions, type DeckMenuEntry } from "@/components/deck-actions";
import { MoveDeckDialog } from "@/components/move-deck";
import { NewDeckDialog } from "@/components/new-deck-dialog";
import { api, type DeckNode } from "@/lib/api";
import { EtudeImg } from "@/lib/local-url";
import { cachedProgress, loadProgress, onProgressInvalidated, relatedDecks, type NoteDropProgress } from "@/lib/notedrop-progress";
import { navigate } from "@/lib/router";

export function DeckOverviewTiles({ decks, allDecks, onChanged }: {
  decks: DeckNode[];
  allDecks: DeckNode[];
  onChanged(): void;
}) {
  const [creating, setCreating] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const deckActions = useDeckActions(onChanged);
  const orderedDecks = decks
    .map((deck, index) => ({ deck, index }))
    .sort((a, b) => {
      const lastReview = (deck: DeckNode) => deck.lastReview ? Date.parse(deck.lastReview) : 0;
      return lastReview(b.deck) - lastReview(a.deck) || a.index - b.index;
    })
    .map(({ deck }) => deck);

  const entries = (deck: DeckNode): DeckMenuEntry[] => [
    { icon: <Plus />, label: "New subdeck", onSelect: () => setCreating(deck.name) },
    { icon: <FolderInput />, label: "Move to…", onSelect: () => setMoving(deck.name) },
    { icon: <Pencil />, label: "Rename", onSelect: () => navigate(`/deck?name=${encodeURIComponent(deck.name)}&rename=1`) },
  ];

  return (
    <>
      <div className="nd-deck-overview-container">
        <div className="nd-deck-overview-grid">
          {orderedDecks.map((deck) => (
            <DeckOverviewTile
              key={deck.id}
              deck={deck}
              disabled={deckActions.busy}
              extra={entries(deck)}
              onArchive={() => deckActions.archive(deck.name, true)}
              onDelete={() => deckActions.requestDelete(deck.name)}
              onOpen={() => navigate(`/deck?name=${encodeURIComponent(deck.name)}`)}
              onChanged={onChanged}
            />
          ))}
        </div>
      </div>
      <MoveDeckDialog
        deck={moving}
        decks={allDecks}
        onOpenChange={(open) => !open && setMoving(null)}
        onMoved={() => onChanged()}
      />
      <NewDeckDialog
        open={creating !== null}
        parent={creating ?? undefined}
        onOpenChange={(open) => !open && setCreating(null)}
        onDone={onChanged}
      />
      {deckActions.deleteDialog}
    </>
  );
}

function DeckThumbnail({ thumbnail }: { thumbnail?: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [thumbnail]);
  return (
    <span className="nd-deck-overview-cover">
      {(!thumbnail || failed) && <Image className="nd-deck-overview-placeholder-icon size-8" aria-hidden="true" />}
      {thumbnail && !failed && (
        <EtudeImg
          src={thumbnail}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

function DeckOverviewTile({ deck, disabled, extra, onArchive, onDelete, onOpen, onChanged }: {
  deck: DeckNode;
  disabled: boolean;
  extra: DeckMenuEntry[];
  onArchive(): void;
  onDelete(): void;
  onOpen(): void;
  onChanged(): void;
}) {
  const [progress, setProgress] = useState<NoteDropProgress | null>(() => cachedProgress(deck.name, deck.cards, deck.unseen));
  const [thumbnail, setThumbnail] = useState(deck.thumbnail ?? null);
  const [savingThumbnail, setSavingThumbnail] = useState(false);
  const thumbnailInput = useRef<HTMLInputElement>(null);

  useEffect(() => setThumbnail(deck.thumbnail ?? null), [deck.thumbnail]);
  useEffect(() => {
    let live = true;
    setProgress(cachedProgress(deck.name, deck.cards, deck.unseen));
    const refresh = async (force = false) => {
      try {
        const value = await loadProgress(deck.name, deck.cards, deck.unseen, force);
        if (live) setProgress(value);
      } catch (error) {
        if (live) toast.error(`Couldn't load mastery for ${deck.name}`, { description: (error as Error).message });
      }
    };
    const unsubscribe = onProgressInvalidated((changedDeck) => {
      if (!changedDeck || relatedDecks(deck.name, changedDeck)) void refresh(true);
    });
    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    void refresh();
    return () => {
      live = false;
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [deck.cards, deck.name, deck.unseen]);

  const due = deck.new + deck.learning + deck.review;
  const menuEntries: DeckMenuEntry[] = [
    ...extra,
    {
      icon: <Image />,
      label: thumbnail ? "Change thumbnail…" : "Set thumbnail…",
      onSelect: () => thumbnailInput.current?.click(),
    },
    ...(thumbnail ? [{
      icon: <Image />,
      label: "Remove thumbnail",
      onSelect: () => {
        setSavingThumbnail(true);
        void api.updateDeck(deck.name, { thumbnail: null }).then(() => {
          setThumbnail(null);
          onChanged();
          toast.success("Thumbnail removed");
        }).catch((error) => toast.error("Couldn't remove thumbnail", { description: (error as Error).message })).finally(() => setSavingThumbnail(false));
      },
    }] : []),
  ];

  return (
    <>
      <input
        ref={thumbnailInput}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={`Choose a thumbnail for ${deck.name}`}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          if (!file.type.startsWith("image/") && !/\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(file.name)) {
            toast.error("Choose an image file");
            return;
          }
          setSavingThumbnail(true);
          void api.uploadMedia(file).then(async (media) => {
            if (media.kind !== "image") throw new Error("Choose an image file");
            await api.updateDeck(deck.name, { thumbnail: media.url });
            setThumbnail(media.url);
            onChanged();
            toast.success("Thumbnail saved");
          }).catch((error) => toast.error("Couldn't save thumbnail", { description: (error as Error).message })).finally(() => setSavingThumbnail(false));
        }}
      />
      <DeckContextMenu
        name={deck.name}
        disabled={disabled || savingThumbnail}
        onArchive={onArchive}
        onDelete={onDelete}
        extra={menuEntries}
      >
        <button
          type="button"
          className="nd-deck-card-tile nd-deck-overview-tile group relative flex w-full flex-col rounded-xl border bg-card/40 px-4 py-4 text-left transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={(event) => {
            if (event.button === 0) onOpen();
          }}
        >
          <DeckThumbnail thumbnail={thumbnail} />
          <span className="flex min-w-0 flex-1 flex-col gap-1 px-1.5 pb-1.5">
            <span className="nd-deck-overview-heading flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{deck.name}</span>
              <span className="nd-deck-overview-badge">
                {due > 0 ? `${due} due` : "Done"}
              </span>
            </span>
            <span className="line-clamp-2 min-h-[2.5em] text-[13px] leading-snug text-muted-foreground">
              {deck.description.trim() || "No description yet."}
            </span>
            <span className="mt-auto block pt-6">
              <span className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Mastered</span>
                <span className="tabular-nums">{progress ? `${progress.percent}%` : "–%"}</span>
              </span>
              <progress
                className="nd-deck-overview-progress"
                value={progress?.percent ?? 0}
                max={100}
                aria-label={progress ? `${progress.percent}% mastered` : "Mastery progress"}
              />
            </span>
          </span>
        </button>
      </DeckContextMenu>
    </>
  );
}

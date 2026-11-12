import { escapeDeckSearch } from "./notedrop-metrics.ts";

export function archiveRoot(name: string) {
  return name.split("::")[0];
}

export function archiveRootSearch(root: string) {
  return `deck:"${escapeDeckSearch(root)}"`;
}

export function matchesArchiveSearch(name: string, query: string) {
  const roots: string[] = [];
  const text = query.replace(/(^|\s)deck:"((?:\\.|[^"\\])*)"(?=\s|$)/g, (_, space: string, root: string) => {
    roots.push(root.replace(/\\(["\\])/g, "$1"));
    return space;
  }).trim();
  return roots.every((root) => archiveRoot(name).toLocaleLowerCase() === root.toLocaleLowerCase())
    && name.toLocaleLowerCase().includes(text.toLocaleLowerCase());
}

export const ARCHIVE_ORDERS = [
  ["default", "Deck order"],
  ["name", "Deck name"],
  ["path", "Path"],
  ["cards", "Most cards"],
  ["newest", "Recently archived"],
  ["oldest", "Oldest archived"],
] as const;

export type ArchiveOrder = typeof ARCHIVE_ORDERS[number][0];

export function sortArchiveDecks<T extends { name: string; cards: number; archivedAt: string | null }>(decks: T[], order: ArchiveOrder): T[] {
  if (order === "default") return decks;
  return [...decks].sort((a, b) => {
    if (order === "cards") return b.cards - a.cards;
    if (order === "newest" || order === "oldest") {
      if (!a.archivedAt || !b.archivedAt) return Number(!a.archivedAt) - Number(!b.archivedAt);
      return order === "newest" ? b.archivedAt.localeCompare(a.archivedAt) : a.archivedAt.localeCompare(b.archivedAt);
    }
    const name = (deck: T) => order === "name" ? deck.name.split("::").at(-1)! : deck.name.split("::").slice(0, -1).join("::");
    return name(a).localeCompare(name(b), undefined, { sensitivity: "base", numeric: true });
  });
}

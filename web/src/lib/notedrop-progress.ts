import { api, type DeckNode } from "@/lib/api";
import { masterySearch, partitionProgress, type NoteDropProgress } from "@/lib/notedrop-metrics";
export { dueSearch, escapeDeckSearch, masterySearch, partitionProgress } from "@/lib/notedrop-metrics";
export type { NoteDropProgress } from "@/lib/notedrop-metrics";

interface CachedProgress {
  value: NoteDropProgress;
  updatedAt: number;
}

const CACHE_MS = 30_000;
const INVALIDATED_EVENT = "notedrop:progress-invalidated";
const DECK_LIST_UPDATED_EVENT = "notedrop:deck-list-updated";
const cache = new Map<string, CachedProgress>();
const inFlight = new Map<string, Promise<NoteDropProgress>>();
const inFlightDecks = new Map<string, string>();
const generations = new Map<string, number>();
let deckCache: { value: DeckNode[]; updatedAt: number } | null = null;
let deckRequest: Promise<DeckNode[]> | null = null;
let deckGeneration = 0;

export function cachedProgress(deck: string, total: number, newCards: number) {
  const entry = cache.get(deck);
  return entry && entry.value.total === total && entry.value.new === newCards ? entry.value : null;
}

export function cachedDeckList() {
  return deckCache?.value ?? null;
}

export function loadDeckList(force = false) {
  if (!force && deckCache && Date.now() - deckCache.updatedAt < CACHE_MS) return Promise.resolve(deckCache.value);
  if (deckRequest) return deckRequest;
  const generation = deckGeneration;
  const request = api.decks(true).then((decks) => {
    if (deckGeneration === generation) {
      deckCache = { value: decks, updatedAt: Date.now() };
      window.dispatchEvent(new CustomEvent(DECK_LIST_UPDATED_EVENT, { detail: decks }));
    }
    return decks;
  }).finally(() => {
    if (deckRequest === request) deckRequest = null;
  });
  deckRequest = request;
  return request;
}

export async function loadProgress(deck: string, total: number, newCards: number, force = false): Promise<NoteDropProgress> {
  const entry = cache.get(deck);
  if (entry && entry.value.total === total && entry.value.new === newCards && !force && Date.now() - entry.updatedAt < CACHE_MS) {
    return entry.value;
  }

  const generation = generations.get(deck) ?? 0;
  const requestKey = `${deck}\0${total}\0${newCards}\0${generation}`;
  const existing = inFlight.get(requestKey);
  if (existing) return existing;

  const request = api.search(masterySearch(deck), { limit: 1 }).then((result) => {
    const value = partitionProgress(total, newCards, result.total);
    if ((generations.get(deck) ?? 0) === generation) cache.set(deck, { value, updatedAt: Date.now() });
    return value;
  }).finally(() => {
    if (inFlight.get(requestKey) === request) {
      inFlight.delete(requestKey);
      inFlightDecks.delete(requestKey);
    }
  });
  inFlight.set(requestKey, request);
  inFlightDecks.set(requestKey, deck);
  return request;
}

export function relatedDecks(left: string, right: string) {
  return left === right || left.startsWith(`${right}::`) || right.startsWith(`${left}::`);
}

export function invalidateProgress(deck?: string) {
  deckCache = null;
  deckGeneration++;
  deckRequest = null;
  const affected = new Set<string>();
  for (const name of cache.keys()) if (!deck || relatedDecks(name, deck)) affected.add(name);
  for (const name of inFlightDecks.values()) if (!deck || relatedDecks(name, deck)) affected.add(name);
  if (deck) affected.add(deck);
  for (const name of affected) {
    cache.delete(name);
    generations.set(name, (generations.get(name) ?? 0) + 1);
  }
  window.dispatchEvent(new CustomEvent(INVALIDATED_EVENT, { detail: { deck } }));
}

export function onProgressInvalidated(listener: (deck?: string) => void) {
  const handle = (event: Event) => listener((event as CustomEvent<{ deck?: string }>).detail?.deck);
  window.addEventListener(INVALIDATED_EVENT, handle);
  return () => window.removeEventListener(INVALIDATED_EVENT, handle);
}

export function onDeckListUpdated(listener: (decks: DeckNode[]) => void) {
  const handle = (event: Event) => listener((event as CustomEvent<DeckNode[]>).detail);
  window.addEventListener(DECK_LIST_UPDATED_EVENT, handle);
  return () => window.removeEventListener(DECK_LIST_UPDATED_EVENT, handle);
}

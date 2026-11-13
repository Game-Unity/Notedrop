import { useRef, useState } from "react";
import type { DeckNode } from "@/lib/api";
import { childrenOf, clashes, parentOf } from "@/components/move-deck";
import { toast } from "sonner";
import { isDescendantDeck } from "@/lib/deck-tree-scope";

export type DeckTreeRow = { name: string; depth: number };
export type DeckTreeDrop = { kind: "line" | "into"; parent: string; index: number | undefined; y: number; depth: number };
type DragState = { name: string; x: number; y: number; drop: DeckTreeDrop | null };

function inScope(name: string, root: string | undefined) {
  return !root || isDescendantDeck(name, root);
}

export function useDeckTreeDrag({
  decks,
  rows,
  scopeRoot,
  collapsed,
  onToggle,
  onMove,
}: {
  decks: DeckNode[];
  rows: DeckTreeRow[];
  scopeRoot?: string;
  collapsed?: Set<string>;
  onToggle?(name: string): void;
  onMove(name: string, parent: string, index: number | undefined, focus?: boolean): void | Promise<void>;
}) {
  const rowElements = useRef(new Map<string, HTMLDivElement>());
  const listElement = useRef<HTMLElement | null>(null);
  const expandTimer = useRef<{ name: string; t: number } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const draggedClick = useRef(false);

  const setListRef = (element: HTMLElement | null) => {
    listElement.current = element;
  };
  const setRowRef = (name: string, element: HTMLDivElement | null) => {
    if (element) rowElements.current.set(name, element);
    else rowElements.current.delete(name);
  };
  const canMoveTo = (name: string, parent: string) =>
    inScope(name, scopeRoot) && (!scopeRoot || parent === scopeRoot || isDescendantDeck(parent, scopeRoot));

  const dropAt = (name: string, y: number): DeckTreeDrop | null => {
    const all = decks;
    const visible = rows.filter((row) => row.name !== name && !row.name.startsWith(`${name}::`) && inScope(row.name, scopeRoot));
    if (!visible.length) return null;
    const rootParent = scopeRoot ?? "";
    const indexAmong = (parent: string, before: string | null) => {
      const siblings = childrenOf(all, parent).filter((child) => child !== name);
      return before === null ? siblings.length : Math.max(0, siblings.indexOf(before));
    };
    const box = (rowName: string) => rowElements.current.get(rowName)!.getBoundingClientRect();
    const last = visible[visible.length - 1];
    if (y > box(last.name).bottom) {
      return { kind: "line", parent: scopeRoot ? rootParent : "", index: indexAmong(rootParent, null), y: box(last.name).bottom, depth: 0 };
    }

    for (let i = 0; i < visible.length; i++) {
      const row = visible[i];
      const rect = box(row.name);
      if (y < rect.top && i > 0) continue;
      if (y > rect.bottom) continue;
      const height = rect.bottom - rect.top;
      const edge = Math.min(14, height * 0.28);
      const parent = parentOf(row.name);
      if (y < rect.top + edge) {
        return { kind: "line", parent, index: indexAmong(parent, row.name), y: rect.top, depth: row.depth };
      }
      if (y > rect.bottom - edge) {
        const next = visible[i + 1];
        if (next && next.depth > row.depth) {
          return { kind: "line", parent: row.name, index: 0, y: rect.bottom, depth: row.depth + 1 };
        }
        const siblings = childrenOf(all, parent).filter((child) => child !== name);
        return { kind: "line", parent, index: siblings.indexOf(row.name) + 1, y: rect.bottom, depth: row.depth };
      }
      return { kind: "into", parent: row.name, index: undefined, y: rect.top, depth: row.depth + 1 };
    }
    return null;
  };

  const isNoop = (name: string, drop: DeckTreeDrop) => {
    if (drop.parent !== parentOf(name)) return false;
    return drop.kind === "into" || drop.index === childrenOf(decks, drop.parent).indexOf(name);
  };
  const blocked = (name: string, drop: DeckTreeDrop) =>
    !canMoveTo(name, drop.parent) || (drop.parent !== parentOf(name) && clashes(decks, name, drop.parent));

  const startDrag = (name: string, event: React.PointerEvent<HTMLButtonElement>, activationDistance = 0) => {
    if (event.button !== 0 || !inScope(name, scopeRoot)) return;
    draggedClick.current = false;
    let active = activationDistance === 0;
    if (active) event.preventDefault();
    const x0 = event.clientX;
    const y0 = event.clientY;
    const grip = event.currentTarget;
    grip.setPointerCapture(event.pointerId);
    if (active) document.body.style.userSelect = "none";
    let drop: DeckTreeDrop | null = null;
    let lastY = y0;
    let lastX = event.clientX;
    const update = (y: number, x = lastX) => {
      lastY = y;
      lastX = x;
      drop = dropAt(name, y);
      if (drop?.kind === "into" && collapsed?.has(drop.parent)) {
        if (expandTimer.current?.name !== drop.parent) expandTimer.current = { name: drop.parent, t: performance.now() };
        else if (performance.now() - expandTimer.current.t > 650) {
          onToggle?.(drop.parent);
          expandTimer.current = null;
        }
      } else expandTimer.current = null;
      setDrag({ name, x, y, drop });
    };
    const move = (event: PointerEvent) => {
      if (!active) {
        if (Math.hypot(event.clientX - x0, event.clientY - y0) < activationDistance) return;
        active = true;
        document.body.style.userSelect = "none";
      }
      draggedClick.current = true;
      event.preventDefault();
      update(event.clientY, event.clientX);
    };
    const auto = window.setInterval(() => {
      if (!active) return;
      const list = listElement.current;
      if (list && list.scrollHeight > list.clientHeight) {
        const rect = list.getBoundingClientRect();
        const localY = lastY - rect.top;
        const edge = 56;
        const speed = localY < edge ? -Math.ceil((edge - localY) / 4) : localY > list.clientHeight - edge ? Math.ceil((localY - (list.clientHeight - edge)) / 4) : 0;
        if (speed) {
          list.scrollTop += speed;
          update(lastY);
        }
      } else {
        const edge = 72;
        const height = window.innerHeight;
        const speed = lastY < edge ? -Math.ceil((edge - lastY) / 4) : lastY > height - edge ? Math.ceil((lastY - (height - edge)) / 4) : 0;
        if (speed) {
          window.scrollBy(0, speed);
          update(lastY);
        }
      }
    }, 16);
    const end = (event: PointerEvent) => {
      window.clearInterval(auto);
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", end);
      grip.removeEventListener("pointercancel", end);
      if (active) document.body.style.userSelect = "";
      expandTimer.current = null;
      setDrag(null);
      if (event.type === "pointercancel") {
        draggedClick.current = false;
        return;
      }
      if (drop && !isNoop(name, drop) && !blocked(name, drop)) void onMove(name, drop.parent, drop.index);
      else if (drop && blocked(name, drop)) {
        toast.error(drop.parent ? `${drop.parent.split("::").at(-1)} already has a deck called ${name.split("::").at(-1)}` : `The top level already has a deck called ${name.split("::").at(-1)}`);
      }
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
    if (active) setDrag({ name, x: event.clientX, y: y0, drop: null });
  };

  const consumeDragClick = () => {
    const value = draggedClick.current;
    draggedClick.current = false;
    return value;
  };

  const keyMove = (name: string, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!inScope(name, scopeRoot)) return;
    const parent = parentOf(name);
    if (scopeRoot && parent !== scopeRoot && !parent.startsWith(`${scopeRoot}::`)) return;
    const siblings = childrenOf(decks, parent);
    const index = siblings.indexOf(name);
    if (event.altKey && event.key === "ArrowLeft" && parent && (!scopeRoot || parent !== scopeRoot)) {
      event.preventDefault();
      const grandparent = parentOf(parent);
      if (canMoveTo(name, grandparent)) void onMove(name, grandparent, childrenOf(decks, grandparent).indexOf(parent) + 1, true);
    } else if (event.altKey && event.key === "ArrowRight" && index > 0) {
      event.preventDefault();
      const newParent = siblings[index - 1];
      if (canMoveTo(name, newParent)) void onMove(name, newParent, undefined, true);
    } else if (!event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const next = index + (event.key === "ArrowUp" ? -1 : 1);
      if (next >= 0 && next < siblings.length) void onMove(name, parent, next, true);
    }
  };

  const isDragged = (name: string) => !!drag && (name === drag.name || name.startsWith(`${drag.name}::`));
  const isTarget = (name: string) =>
    !!drag && drag.drop?.kind === "into" && drag.drop.parent === name && !isNoop(drag.name, drag.drop);
  const dropTop = (drop: DeckTreeDrop) => {
    const list = listElement.current;
    return list ? drop.y - list.getBoundingClientRect().top + list.scrollTop : 0;
  };

  return { drag, setListRef, setRowRef, startDrag, consumeDragClick, keyMove, isDragged, isTarget, isNoop, blocked, dropTop };
}

export interface NoteDropProgress {
  total: number;
  new: number;
  learning: number;
  mastered: number;
  percent: number;
}

export function escapeDeckSearch(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function masterySearch(deck: string) {
  return `deck:"${escapeDeckSearch(deck)}" prop:stability>21 -is:new`;
}

export function dueSearch(deck: string) {
  return `deck:"${escapeDeckSearch(deck)}" is:due`;
}

export function partitionProgress(total: number, newCards: number, mastered: number): NoteDropProgress {
  if (![total, newCards, mastered].every(Number.isInteger) || total < 0 || newCards < 0 || mastered < 0 || newCards + mastered > total) {
    throw new Error("Invalid NoteDrop progress counts");
  }
  const learning = total - newCards - mastered;
  return {
    total,
    new: newCards,
    learning,
    mastered,
    percent: total ? Math.round((mastered / total) * 100) : 0,
  };
}

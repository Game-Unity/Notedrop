export function isDeckWithinScope(name: string, root: string) {
  return name === root || name.startsWith(`${root}::`);
}

export function isDescendantDeck(name: string, root: string) {
  return name.startsWith(`${root}::`);
}

export function canMoveDeckWithinScope(name: string, parent: string, root: string) {
  return isDescendantDeck(name, root) && (parent === root || isDescendantDeck(parent, root));
}

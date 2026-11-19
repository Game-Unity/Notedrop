export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: (string | number)[];
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function parseSemVer(value: string): SemVer | null {
  const match = SEMVER.exec(value);
  if (!match) return null;
  const core = match.slice(1, 4).map(Number);
  if (core.some((part) => !Number.isSafeInteger(part))) return null;
  const rawIdentifiers = match[4]?.split(".") ?? [];
  if (rawIdentifiers.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) return null;
  const identifiers = rawIdentifiers.map((part) => /^\d+$/.test(part) ? Number(part) : part);
  if (identifiers.some((part) => typeof part === "number" && part > Number.MAX_SAFE_INTEGER)) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: identifiers };
}

export function compareSemVer(a: string, b: string): number {
  const left = parseSemVer(a);
  const right = parseSemVer(b);
  if (!left || !right) throw new Error(`invalid semantic version: ${!left ? a : b}`);
  for (const part of ["major", "minor", "patch"] as const) {
    if (left[part] !== right[part]) return left[part] > right[part] ? 1 : -1;
  }
  if (!left.prerelease.length && !right.prerelease.length) return 0;
  if (!left.prerelease.length) return 1;
  if (!right.prerelease.length) return -1;
  for (let i = 0; i < Math.max(left.prerelease.length, right.prerelease.length); i++) {
    const x = left.prerelease[i];
    const y = right.prerelease[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x > y ? 1 : -1;
    if (typeof x === "number") return -1;
    if (typeof y === "number") return 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

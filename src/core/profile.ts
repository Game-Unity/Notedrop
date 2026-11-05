import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type NoteDropProfile = "dev" | "stable";

export class ProfileConfigurationError extends Error {}

const profileHome = (profile: NoteDropProfile) => join(homedir(), profile === "dev" ? ".notedrop-dev" : ".notedrop");
export const noteDropProfilePort = (profile: NoteDropProfile) => (profile === "dev" ? 4612 : 4613);
const originalHome = () => join(homedir(), ".etude");
const otherProfile = (profile: NoteDropProfile): NoteDropProfile => (profile === "dev" ? "stable" : "dev");

function canonical(path: string): string {
  let current = resolve(path);
  const tail: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    tail.unshift(basename(current));
    current = parent;
  }
  return resolve(realpathSync(current), ...tail);
}

function within(path: string, root: string): boolean {
  const r = relative(root, path);
  return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r));
}

function samePath(a: string, b: string): boolean {
  const left = canonical(a);
  const right = canonical(b);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

export function assertSafeStoragePaths(home: string, dbPath: string, appRoot: string): void {
  const root = canonical(appRoot);
  const resolvedHome = canonical(home);
  const resolvedDb = canonical(dbPath);
  if (within(resolvedHome, root)) throw new ProfileConfigurationError(`ETUDE_HOME must be outside the repository or installation directory: ${resolvedHome}`);
  if (within(resolvedDb, root)) throw new ProfileConfigurationError(`The database must be outside the repository or installation directory: ${resolvedDb}`);
}

export function resolveNoteDropProfile(profile: NoteDropProfile, env: Record<string, string | undefined>, appRoot: string, dbOverride?: string) {
  const home = resolve(env.ETUDE_HOME ?? profileHome(profile));
  const dbPath = resolve(dbOverride ?? env.ETUDE_DB ?? join(home, "etude.db"));
  const port = env.ETUDE_PORT === undefined ? noteDropProfilePort(profile) : Number(env.ETUDE_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ProfileConfigurationError(`ETUDE_PORT must be an integer between 1 and 65535.`);
  const reservedPorts = new Set([4610, 4611, noteDropProfilePort(otherProfile(profile))]);
  if (reservedPorts.has(port)) throw new ProfileConfigurationError(`Port ${port} is reserved for Etude Original, Vite, or the other NoteDrop profile.`);

  assertSafeStoragePaths(home, dbPath, appRoot);
  if (!within(canonical(dbPath), canonical(home))) throw new ProfileConfigurationError(`The database must stay inside the ${profile} data directory: ${home}`);

  const reservedHomes = [originalHome(), profileHome(otherProfile(profile))];
  if (reservedHomes.some((reserved) => samePath(home, reserved))) {
    throw new ProfileConfigurationError(`${profile} data must not share a directory with Etude Original or the other NoteDrop profile: ${home}`);
  }
  const marker = join(home, ".notedrop-profile");
  if (existsSync(marker) && readFileSync(marker, "utf8").trim() !== profile) {
    throw new ProfileConfigurationError(`${home} is already assigned to another NoteDrop profile.`);
  }

  const reservedDatabases = reservedHomes.map((reserved) => join(reserved, "etude.db"));
  if (reservedDatabases.some((reserved) => samePath(dbPath, reserved))) {
    throw new ProfileConfigurationError(`${profile} database must not share Etude Original's or the other NoteDrop profile's database: ${dbPath}`);
  }

  return { profile, home, dbPath, port };
}

export function claimNoteDropProfile(profile: NoteDropProfile, home: string): void {
  mkdirSync(home, { recursive: true });
  const marker = join(home, ".notedrop-profile");
  let fd: number;
  try {
    fd = openSync(marker, "wx", 0o600);
    try {
      writeFileSync(fd, profile + "\n");
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (readFileSync(marker, "utf8").trim() !== profile) {
      throw new ProfileConfigurationError(`${home} is already assigned to another NoteDrop profile.`);
    }
  }
}

export function profileEnvironment(profile: NoteDropProfile, env: Record<string, string | undefined>, appRoot: string): Record<string, string | undefined> {
  const configured = resolveNoteDropProfile(profile, env, appRoot);
  return {
    ...env,
    NOTEDROP_PROFILE: profile,
    ETUDE_HOME: configured.home,
    ETUDE_PORT: String(configured.port),
  };
}

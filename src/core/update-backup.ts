import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { SqlConnection } from "./sql.ts";

const MAX_BACKUPS = 5;

export interface UpdateBackupManifest {
  version: 1;
  kind: "update" | "migration" | "before-restore";
  created: string;
  appVersion: string;
  database: string;
  sourceDatabase: string;
}

export interface UpdateBackupResult {
  directory: string;
  database: string;
  files: number;
}

const stamp = (date = new Date()) => date.toISOString().replace(/[:]/g, "").replace(/\..+$/, "").replace("T", "-");

function within(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function assertBackupPaths(home: string, dbPath: string) {
  const resolvedHome = resolve(home);
  const resolvedDb = resolve(dbPath);
  if (!within(resolvedDb, resolvedHome)) throw new Error(`The database must stay inside the Notedrop data directory: ${resolvedHome}`);
}

async function copyDatabase(sql: SqlConnection | null, source: string, destination: string): Promise<number> {
  if (sql?.serialize) {
    const bytes = sql.serialize();
    writeFileSync(destination, bytes);
    return Math.round(bytes.length / 4096);
  }
  const { backup, DatabaseSync } = await import("node:sqlite");
  const own = sql ?? new DatabaseSync(source, { readOnly: true });
  try {
    return await backup(own as any, destination);
  } finally {
    if (!sql) own.close();
  }
}

function topLevelEntries(home: string, dbPath: string): string[] {
  const db = resolve(dbPath);
  const excluded = new Set([db, `${db}-wal`, `${db}-shm`, `${db}-journal`]);
  return readdirSync(home)
    .filter((name) => name !== "update-backups")
    .map((name) => join(home, name))
    .filter((path) => !excluded.has(resolve(path)));
}

function cleanOldBackups(home: string) {
  const dir = join(home, "update-backups");
  if (!existsSync(dir)) return;
  const backups = readdirSync(dir)
    .map((name) => ({ name, path: join(dir, name), stat: statSafe(join(dir, name)) }))
    .filter((entry) => !!entry.stat && entry.stat.isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name));
  for (const old of backups.slice(MAX_BACKUPS)) rmSync(old.path, { recursive: true, force: true });
}

function statSafe(path: string): { isDirectory(): boolean } | null {
  try { return statSync(path); } catch { return null; }
}

export async function createUpdateBackup(opts: {
  home: string;
  dbPath: string;
  appVersion: string;
  kind: UpdateBackupManifest["kind"];
  sql?: SqlConnection | null;
}): Promise<UpdateBackupResult> {
  const home = resolve(opts.home);
  const dbPath = resolve(opts.dbPath);
  assertBackupPaths(home, dbPath);
  if (!existsSync(dbPath)) throw new Error(`Cannot back up Notedrop data: database does not exist at ${dbPath}`);
  mkdirSync(home, { recursive: true });
  const root = join(home, "update-backups");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const final = join(root, `${opts.kind}-${opts.appVersion}-${stamp()}`);
  let directory = final;
  for (let i = 1; existsSync(directory); i++) directory = `${final}-${i}`;
  const stage = `${directory}.tmp-${process.pid}`;
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, "data"), { recursive: true, mode: 0o700 });
  try {
    const database = join(stage, "collection.db");
    await copyDatabase(opts.sql ?? null, dbPath, database);
    const data = topLevelEntries(home, dbPath);
    for (const path of data) cpSync(path, join(stage, "data", basename(path)), { recursive: true, verbatimSymlinks: true });
    const manifest: UpdateBackupManifest = {
      version: 1,
      kind: opts.kind,
      created: new Date().toISOString(),
      appVersion: opts.appVersion,
      database: "collection.db",
      sourceDatabase: basename(dbPath),
    };
    writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
    renameSync(stage, directory);
    cleanOldBackups(home);
    return { directory, database: join(directory, manifest.database), files: data.length + 1 };
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

export function readUpdateBackup(directory: string): UpdateBackupManifest {
  const path = resolve(directory);
  const raw = JSON.parse(readFileSync(join(path, "manifest.json"), "utf8"));
  if (raw?.version !== 1 || !["update", "migration", "before-restore"].includes(raw.kind) || raw.database !== "collection.db" || typeof raw.sourceDatabase !== "string") {
    throw new Error(`${path} is not a valid Notedrop update backup`);
  }
  const db = join(path, raw.database);
  if (!existsSync(db)) throw new Error(`Backup database is missing: ${db}`);
  return raw as UpdateBackupManifest;
}

export async function restoreUpdateBackup(directory: string, home: string, dbPath: string): Promise<{ previous: UpdateBackupResult; restored: number }> {
  const manifest = readUpdateBackup(directory);
  const resolvedHome = resolve(home);
  const resolvedDb = resolve(dbPath);
  assertBackupPaths(resolvedHome, resolvedDb);
  if (basename(resolvedDb) !== manifest.sourceDatabase) throw new Error(`Backup belongs to ${manifest.sourceDatabase}, not ${basename(resolvedDb)}`);
  const previous = await createUpdateBackup({ home: resolvedHome, dbPath: resolvedDb, appVersion: "restore", kind: "before-restore" });
  const { backup, DatabaseSync } = await import("node:sqlite");
  const source = new DatabaseSync(join(resolve(directory), manifest.database), { readOnly: true });
  const staged = join(dirname(resolvedDb), `.notedrop-restore-${process.pid}.db`);
  try {
    rmSync(staged, { force: true });
    await backup(source, staged);
    const check = new DatabaseSync(staged, { readOnly: true });
    try {
      const result = check.prepare("PRAGMA integrity_check").get() as Record<string, unknown>;
      if (Object.values(result)[0] !== "ok") throw new Error("Backup database failed SQLite integrity_check");
    } finally {
      check.close();
    }
    for (const suffix of ["-wal", "-shm"]) rmSync(`${resolvedDb}${suffix}`, { force: true });
    const old = `${resolvedDb}.before-restore-${process.pid}`;
    rmSync(old, { force: true });
    if (existsSync(resolvedDb)) renameSync(resolvedDb, old);
    try {
      renameSync(staged, resolvedDb);
    } catch (error) {
      if (existsSync(old) && !existsSync(resolvedDb)) renameSync(old, resolvedDb);
      throw error;
    }
    rmSync(old, { force: true });
  } finally {
    source.close();
    rmSync(staged, { force: true });
  }
  const data = join(resolve(directory), "data");
  let restored = 1;
  for (const name of readdirSync(data)) {
    cpSync(join(data, name), join(resolvedHome, name), { recursive: true, force: true, verbatimSymlinks: true });
    restored++;
  }
  return { previous, restored };
}

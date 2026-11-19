// Updating Etude from its GitHub repo: check for new commits, fast-forward, rebuild, restart.
// Only a git checkout can update itself. Package installs (npm, the Mac app) get the latest
// release's version and a link instead.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, renameSync, rmSync } from "node:fs";
import { cpSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareSemVer, parseSemVer } from "./semver.ts";
import { updateDistribution, updatesManagedExternally, type UpdateDistribution } from "./distribution.ts";

export const ETUDE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const UPDATE_REPOSITORY = "Game-Unity/Notedrop";
const UPDATE_REPOSITORY_URLS = new Set([
  "https://github.com/Game-Unity/Notedrop.git",
  "https://github.com/Game-Unity/Notedrop",
  "git@github.com:Game-Unity/Notedrop.git",
  "git@github.com:Game-Unity/Notedrop",
]);

export class UpdateError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status = 409, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export interface Commit {
  sha: string;
  subject: string;
  date: string;
}

export type UpdateStatus =
  | {
      kind: "git";
      version: string;
      branch: string | null;
      upstream: string | null;
      commit: string;
      /** New commits on the upstream, newest first (at most 20). */
      incoming: Commit[];
      behind: number;
      ahead: number;
      /** Tracked files with local changes; updating refuses while there are any. */
      dirty: string[];
      checked: string | null;
      checkError?: string;
      /** Why one click can't update right now, if it can't. */
      blocked?: string;
    }
  | { kind: "package"; version: string; latest: string | null; url: string; checked: string | null; checkError?: string };

export interface UpdateResult {
  result: "updated" | "current";
  from: string;
  to: string;
  commits: Commit[];
  steps: { step: string; ms: number }[];
  backup?: string;
}

interface DataPaths {
  home: string;
  dbPath: string;
}

interface Opts {
  root?: string;
  data?: DataPaths;
  distribution?: UpdateDistribution;
  /** Test fixtures only: production never sets this and always uses the fixed Notedrop remote. */
  trustedRemote?: string;
  /** Contact the remote (git fetch / GitHub releases). Without it, status uses what's already known. */
  fetch?: boolean;
  /** Fetch even if the last check was under THROTTLE_MS ago. */
  force?: boolean;
}

const lastCheck = new Map<string, { at: string; error?: string; latest?: string | null }>();

/** Automatic checks (opening the app) hit the remote at most this often. */
export const THROTTLE_MS = 10 * 60_000;
const due = (root: string, o: Opts) => !!o.fetch && (o.force || !lastCheck.get(root) || Date.now() - Date.parse(lastCheck.get(root)!.at) > THROTTLE_MS);

const pkgOf = (root: string) => JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function requireInternalUpdates(root: string, distribution?: UpdateDistribution): void {
  if (updatesManagedExternally(distribution ?? updateDistribution(root))) {
    throw new UpdateError("This copy of Notedrop is updated by the Microsoft Store.", 409);
  }
}

function git(root: string, args: string[], timeout = 60_000, raw = false): string {
  try {
    const out = execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
      // Never stop and wait for a password: the repo is public, and a prompt would hang the server.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", LC_ALL: "C" },
    });
    return raw ? out : out.trim();
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new UpdateError("git isn't installed", 424);
    const msg = String(err?.stderr || err?.message || err).trim();
    throw new UpdateError(`git ${args[0]}: ${msg}`, 502);
  }
}

/** True when `root` is the top of its own git checkout (not a folder inside some other repo). */
export function isCheckout(root = ETUDE_ROOT): boolean {
  if (!existsSync(join(root, ".git"))) return false;
  try {
    return realpathSync.native(resolve(git(root, ["rev-parse", "--show-toplevel"]))) === realpathSync.native(resolve(root));
  } catch {
    return false;
  }
}

const parseLog = (out: string): Commit[] =>
  out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, date, ...s] = l.split("\t");
      return { sha, date, subject: s.join("\t") };
    });


const newer = (a: string, b: string) => compareSemVer(a, b) > 0;

function releaseVersion(tag: unknown): string {
  const version = String(tag ?? "").replace(/^v/, "");
  if (!parseSemVer(version)) throw new Error(`GitHub release has invalid SemVer tag ${JSON.stringify(tag)}`);
  return version;
}

function requireNotedropRemote(root: string, remote: string, trustedRemote?: string): string {
  const urls = git(root, ["config", "--get-all", `remote.${remote}.url`]).split("\n").filter(Boolean);
  if (urls.length !== 1 || !(UPDATE_REPOSITORY_URLS.has(urls[0]) || urls[0] === trustedRemote)) {
    const url = urls.join(", ") || "(missing)";
    throw new UpdateError(`${remote} points at ${url}; updates are restricted to ${UPDATE_REPOSITORY}.`, 409);
  }
  if (!trustedRemote) {
    try {
      const rewrites = git(root, ["config", "--get-regexp", "^url\\..*\\.insteadOf$"], 60_000);
      if (rewrites) throw new UpdateError(`Git URL rewrites are not allowed for secure updates: ${rewrites.split("\n")[0]}.`, 409);
    } catch (error) {
      if (error instanceof UpdateError && error.message.startsWith("Git URL rewrites")) throw error;
    }
  }
  return urls[0];
}

export async function updateStatus(opts: Opts = {}): Promise<UpdateStatus> {
  const root = opts.root ?? ETUDE_ROOT;
  requireInternalUpdates(root, opts.distribution);
  const pkg = pkgOf(root);
  const version: string = pkg.version;
  if (!parseSemVer(version)) throw new UpdateError(`package.json has invalid SemVer version ${JSON.stringify(version)}.`, 500);

  if (!isCheckout(root)) {
    const url = `https://github.com/${UPDATE_REPOSITORY}/releases/latest`;
    if (due(root, opts)) {
      const at = new Date().toISOString();
      try {
        const res = await fetch(`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
        lastCheck.set(root, { at, latest: releaseVersion(((await res.json()) as any).tag_name) });
      } catch (e) {
        lastCheck.set(root, { at, error: (e as Error).message, latest: lastCheck.get(root)?.latest ?? null });
      }
    }
    const c = lastCheck.get(root);
    const latest = c?.latest && newer(c.latest, version) ? c.latest : null;
    return { kind: "package", version, latest, url, checked: c?.at ?? null, ...(c?.error ? { checkError: c.error } : {}) };
  }

  let branch: string | null = null;
  try {
    branch = git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]) || null;
  } catch {
    branch = null;
  }
  let upstream: string | null = null;
  try {
    upstream = git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || null;
  } catch {
    upstream = null;
  }
  if (upstream) {
    try {
      const remote = upstream.split("/")[0];
      if (remote !== "origin") throw new UpdateError(`Updates must track ${UPDATE_REPOSITORY}; branch tracks ${upstream}.`, 409);
      requireNotedropRemote(root, remote, opts.trustedRemote);
    } catch (e) {
      const at = new Date().toISOString();
      lastCheck.set(root, { at, error: (e as Error).message });
      upstream = null;
    }
  }
  if (upstream && due(root, opts)) {
    const at = new Date().toISOString();
    try {
      git(root, ["fetch", "--quiet", upstream.split("/")[0]], 45_000);
      lastCheck.set(root, { at });
    } catch (e) {
      lastCheck.set(root, { at, error: (e as Error).message });
    }
  }
  const commit = git(root, ["rev-parse", "--short", "HEAD"]);
  let behind = 0, ahead = 0, incoming: Commit[] = [];
  if (upstream) {
    const [a, b] = git(root, ["rev-list", "--left-right", "--count", "HEAD...@{u}"]).split(/\s+/).map(Number);
    ahead = a;
    behind = b;
    if (behind) incoming = parseLog(git(root, ["log", "--max-count=20", "--format=%h%x09%cI%x09%s", "HEAD..@{u}"]));
  }
  // Raw: porcelain lines start with a status column that may be a space.
  const dirty = git(root, ["status", "--porcelain", "--untracked-files=no"], 60_000, true).split("\n").filter(Boolean).map((l) => l.slice(3));
  const c = lastCheck.get(root);
  const blocked = !branch
    ? "Not on a branch (detached HEAD)."
    : !upstream
      ? c?.error ?? `Branch ${branch} doesn't track a valid remote branch.`
      : dirty.length
        ? `${dirty.length} file${dirty.length === 1 ? " has" : "s have"} local changes.`
        : ahead && behind
          ? `This copy has ${ahead} commit${ahead === 1 ? "" : "s"} the repo doesn't, so it can't fast-forward.`
          : undefined;
  return { kind: "git", version, branch, upstream, commit, incoming, behind, ahead, dirty, checked: c?.at ?? null, ...(c?.error ? { checkError: c.error } : {}), ...(blocked ? { blocked } : {}) };
}

/** npm next to the node that runs Etude, run through that same node (no PATH lookup, no shebang). */
function npmArgs(): [string, string[]] {
  const cli = join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
  return existsSync(cli) ? [process.execPath, [cli]] : ["npm", []];
}

/**
 * Child processes find this node first, so `#!/usr/bin/env node` scripts work under systemd too.
 * In the desktop app this "node" is Electron, which runs scripts only in its Node mode.
 */
const toolEnv = () => ({
  ...process.env,
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
  GIT_TERMINAL_PROMPT: "0",
  ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
});

function run(step: string, cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = toolEnv(), timeout = 10 * 60_000) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024 });
  if (r.error || r.status !== 0) {
    const log = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim().split("\n").slice(-25).join("\n");
    throw new UpdateError(`${step} failed${r.error ? `: ${r.error.message}` : ` (exit ${r.status})`}`, 500, { step, log });
  }
}

/** Builds the web app beside the live one; activation is a separate reversible step. */
function buildWeb(root: string): () => () => void {
  const web = join(root, "web");
  const next = join(web, ".dist-next"), prev = join(web, ".dist-prev"), dist = join(web, "dist");
  const vite = join(root, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(vite)) throw new UpdateError("vite isn't installed (node_modules/vite is missing)", 500, { step: "build" });
  rmSync(next, { recursive: true, force: true });
  run("build", process.execPath, [vite, "build", "--config", join(web, "vite.config.ts"), "--outDir", next, "--emptyOutDir"], root);
  run("build", process.execPath, [vite, "build", "--config", join(web, "vite.kit.config.ts")], root, { ...toolEnv(), ETUDE_KIT_OUT: join(next, "kit") });
  return () => {
    rmSync(prev, { recursive: true, force: true });
    if (existsSync(dist)) renameSync(dist, prev);
    renameSync(next, dist);
    return () => {
      rmSync(dist, { recursive: true, force: true });
      if (existsSync(prev)) renameSync(prev, dist);
      rmSync(next, { recursive: true, force: true });
    };
  };
}

const freePort = () => new Promise<number>((done, fail) => {
  const server = createServer();
  server.once("error", fail);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") return server.close(() => fail(new Error("couldn't choose a local verification port")));
    const port = address.port;
    server.close((error) => error ? fail(error) : done(port));
  });
});

async function verifyUpdatedStart(root: string, backupDir: string | undefined) {
  const entry = join(root, "bin", "etude.js");
  if (!existsSync(entry)) return;
  const temp = join(root, ".notedrop-update-verify");
  rmSync(temp, { recursive: true, force: true });
  mkdirSync(join(temp, "home"), { recursive: true });
  let dbPath: string | undefined;
  if (backupDir) {
    const source = join(backupDir, "collection.db");
    if (!existsSync(source)) throw new Error(`update backup is missing ${source}`);
    dbPath = join(temp, "home", "etude.db");
    cpSync(source, dbPath);
  }
  const port = await freePort();
  const env: NodeJS.ProcessEnv = { ...process.env, ETUDE_HOME: join(temp, "home"), ...(dbPath ? { ETUDE_DB: dbPath } : {}), ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}) };
  delete env.NOTEDROP_PROFILE;
  const child = spawn(process.execPath, [entry, "serve", "--host", "127.0.0.1", "--port", String(port)], { cwd: root, env, stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr?.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
  const deadline = Date.now() + 30_000;
  try {
    let exited = false;
    child.once("exit", () => { exited = true; });
    while (Date.now() < deadline) {
      if (exited) throw new Error(stderr.trim() || "updated application exited during verification");
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/settings`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          const settings = await response.json() as { version?: string };
          const current = pkgOf(root).version;
          if (settings.version !== current) throw new Error(`updated app reported version ${settings.version ?? "unknown"}, expected ${current}`);
          return;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("updated application did not answer within 30 seconds");
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await new Promise<void>((done) => {
      if (child.exitCode !== null || child.signalCode !== null) return done();
      child.once("exit", () => done());
      setTimeout(done, 3000).unref();
    });
    rmSync(temp, { recursive: true, force: true });
  }
}

let busy = false;

/** Fast-forwards to the upstream, installs dependencies if the lockfile moved, rebuilds the web app. */
export async function applyUpdate(opts: Omit<Opts, "fetch"> = {}): Promise<UpdateResult> {
  const root = opts.root ?? ETUDE_ROOT;
  requireInternalUpdates(root, opts.distribution);
  if (busy) throw new UpdateError("an update is already running");
  busy = true;
  try {
    const st = await updateStatus({ root, fetch: true, force: true, trustedRemote: opts.trustedRemote });
    // Run by the desktop app's program (its etude command), this is the app's copy.
    if (st.kind !== "git" && process.versions.electron) throw new UpdateError("This copy came with the Notedrop desktop app, which updates itself.", 409);
    if (st.kind !== "git") throw new UpdateError(st.latest ? `This install can't update itself: get ${st.latest} from ${st.url}` : "This install can't update itself (it isn't a git checkout).", 409);
    if (st.checkError) throw new UpdateError(`Couldn't reach the repo: ${st.checkError}`, 502);
    if (st.blocked) throw new UpdateError(st.blocked, 409, { dirty: st.dirty });
    const steps: { step: string; ms: number }[] = [];
    const time = (step: string, f: () => void) => {
      const t = Date.now();
      f();
      steps.push({ step, ms: Date.now() - t });
    };
    const from = git(root, ["rev-parse", "HEAD"]);
    if (!st.behind) return { result: "current", from: from.slice(0, 7), to: from.slice(0, 7), commits: [], steps: [{ step: "fetch", ms: 0 }] };

    let backupDir: string | undefined;
    if (opts.data && existsSync(opts.data.dbPath)) {
      const { createUpdateBackup } = await import("./update-backup.ts");
      const backup = await createUpdateBackup({ home: opts.data.home, dbPath: opts.data.dbPath, appVersion: st.version, kind: "update" });
      backupDir = backup.directory;
      steps.push({ step: "backup", ms: 0 });
    }
    let dependencyChange = false;
    let rollbackWeb: (() => void) | null = null;
    time("pull", () => git(root, ["merge", "--ff-only", "--quiet", "@{u}"]));
    const to = git(root, ["rev-parse", "HEAD"]);
    const changed = git(root, ["diff", "--name-only", from, to]).split("\n").filter(Boolean);
    try {
      const hasDeps = Object.keys({ ...pkgOf(root).dependencies, ...pkgOf(root).devDependencies }).length > 0;
      dependencyChange = hasDeps && (changed.some((f) => f === "package.json" || f === "package-lock.json") || !existsSync(join(root, "node_modules")));
      if (dependencyChange) {
        const [cmd, pre] = npmArgs();
        time("install", () => run("install", cmd, [...pre, "install", "--no-audit", "--no-fund", "--loglevel=error"], root));
      }
      if (existsSync(join(root, "web", "vite.config.ts"))) {
        let activate: (() => () => void) | undefined;
        time("build", () => { activate = buildWeb(root); });
        rollbackWeb = activate!();
      }
      if (opts.data) await verifyUpdatedStart(root, backupDir);
      if (rollbackWeb) rmSync(join(root, "web", ".dist-prev"), { recursive: true, force: true });
    } catch (e) {
      const recovery: string[] = [];
      try {
        rollbackWeb?.();
      } catch (error) {
        recovery.push(`web restore: ${(error as Error).message}`);
      }
      try {
        git(root, ["reset", "--keep", "--quiet", from]);
      } catch (error) {
        recovery.push(`git restore: ${(error as Error).message}`);
      }
      if (dependencyChange) {
        try {
          const [cmd, pre] = npmArgs();
          run("restore install", cmd, [...pre, "install", "--no-audit", "--no-fund", "--loglevel=error"], root);
        } catch (error) {
          recovery.push(`dependency restore: ${(error as Error).message}`);
        }
      }
      const reason = e instanceof Error ? e.message : String(e);
      throw new UpdateError(`Update failed and was rolled back: ${reason}${recovery.length ? `. Recovery also reported: ${recovery.join("; ")}` : ""}`, 500, { backup: backupDir, recovery });
    }
    return { result: "updated", from: from.slice(0, 7), to: to.slice(0, 7), commits: st.incoming, steps, ...(backupDir ? { backup: backupDir } : {}) };
  } finally {
    busy = false;
  }
}

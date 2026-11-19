import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyUpdate, updateStatus } from "../src/core/update.ts";
import { createUpdateBackup, restoreUpdateBackup } from "../src/core/update-backup.ts";
import { DatabaseSync } from "node:sqlite";
import { Etude } from "../src/core/engine.ts";
import { parseUpdateDistribution, updateDistribution } from "../src/core/distribution.ts";
import { createApp } from "../src/server/app.ts";

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const ident = ["-c", "user.name=Test", "-c", "user.email=test@example.invalid"];

/** A bare "GitHub" repo, a clone of it playing the install, and a second clone that pushes. */
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "etude-update-"));
  const origin = join(dir, "origin.git"), app = join(dir, "app"), dev = join(dir, "dev");
  sh(dir, "init", "--quiet", "--bare", "-b", "main", origin);
  sh(dir, "clone", "--quiet", "-c", "core.autocrlf=false", origin, dev);
  const official = "https://github.com/Game-Unity/Notedrop.git";
  sh(dev, "config", `url.${origin}.insteadOf`, official);
  sh(dev, "remote", "set-url", "origin", official);
  writeFileSync(join(dev, "package.json"), JSON.stringify({ name: "etude-fixture", version: "2.0.0" }));
  writeFileSync(join(dev, "notes.txt"), "one\n");
  sh(dev, "add", ".");
  sh(dev, ...ident, "commit", "--quiet", "-m", "first");
  sh(dev, "push", "--quiet", "origin", "main");
  sh(dir, "clone", "--quiet", "-c", "core.autocrlf=false", origin, app);
  sh(app, "config", `url.${origin}.insteadOf`, official);
  sh(app, "remote", "set-url", "origin", official);
  const push = (msg: string, text: string) => {
    writeFileSync(join(dev, "notes.txt"), text);
    sh(dev, ...ident, "commit", "--quiet", "-am", msg);
    sh(dev, "push", "--quiet", "origin", "main");
  };
  return { dir, app, dev, origin, push, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("update: sees new commits on the upstream and fast-forwards to them", async () => {
  const f = fixture();
  try {
    let st = await updateStatus({ root: f.app, fetch: true, force: true, trustedRemote: f.origin });
    assert.equal(st.kind, "git");
    if (st.kind !== "git") return;
    assert.equal(st.behind, 0);
    assert.equal(st.upstream, "origin/main");
    assert.equal(st.blocked, undefined);

    f.push("second", "two\n");
    f.push("third", "three\n");
    st = await updateStatus({ root: f.app, fetch: true, force: true, trustedRemote: f.origin });
    assert.equal(st.kind === "git" && st.behind, 2);
    assert.deepEqual(st.kind === "git" && st.incoming.map((c) => c.subject), ["third", "second"]);

    const out = await applyUpdate({ root: f.app, trustedRemote: f.origin });
    assert.equal(out.result, "updated");
    assert.deepEqual(out.commits.map((c) => c.subject), ["third", "second"]);
    assert.equal(readFileSync(join(f.app, "notes.txt"), "utf8"), "three\n");
    assert.equal(sh(f.app, "rev-parse", "--short", "HEAD"), out.to);

    assert.equal((await applyUpdate({ root: f.app, trustedRemote: f.origin })).result, "current");
  } finally {
    f.done();
  }
});

test("update: refuses to touch local changes or a diverged branch", async () => {
  const f = fixture();
  try {
    f.push("upstream change", "upstream\n");
    writeFileSync(join(f.app, "notes.txt"), "my edit\n");
    let st = await updateStatus({ root: f.app, fetch: true, force: true, trustedRemote: f.origin });
    assert.match(String(st.kind === "git" && st.blocked), /local changes/);
    assert.deepEqual(st.kind === "git" && st.dirty, ["notes.txt"]);
    await assert.rejects(applyUpdate({ root: f.app, trustedRemote: f.origin }), /local changes/);
    assert.equal(readFileSync(join(f.app, "notes.txt"), "utf8"), "my edit\n");

    sh(f.app, ...ident, "commit", "--quiet", "-am", "mine");
    st = await updateStatus({ root: f.app, fetch: true, force: true, trustedRemote: f.origin });
    assert.match(String(st.kind === "git" && st.blocked), /can't fast-forward/);
    await assert.rejects(applyUpdate({ root: f.app, trustedRemote: f.origin }), /can't fast-forward/);
  } finally {
    f.done();
  }
});

test("update: a folder that isn't a git checkout reports the fixed Notedrop release page", async () => {
  const dir = mkdtempSync(join(tmpdir(), "etude-pkg-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "2.0.0", repository: { url: "git+https://github.com/Zibhelina/etude.git" } }));
    const st = await updateStatus({ root: dir });
    assert.equal(st.kind, "package");
    assert.equal(st.kind === "package" && st.url, "https://github.com/Game-Unity/Notedrop/releases/latest");
    await assert.rejects(applyUpdate({ root: dir }), /can't update itself/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("update: Microsoft Store builds reject checks and updates before touching git or the network", async () => {
  const f = fixture();
  try {
    await assert.rejects(updateStatus({ root: f.app, distribution: "microsoft-store", fetch: true, force: true, trustedRemote: f.origin }), /updated by the Microsoft Store/);
    await assert.rejects(applyUpdate({ root: f.app, distribution: "microsoft-store", trustedRemote: f.origin }), /updated by the Microsoft Store/);
    assert.equal(sh(f.app, "status", "--porcelain"), "");
  } finally {
    f.done();
  }
});

test("distribution: packaged marker is immutable but development builds allow an environment override", () => {
  const root = mkdtempSync(join(tmpdir(), "notedrop-distribution-"));
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({ notedrop: { distribution: "microsoft-store" } }));
    assert.equal(updateDistribution(root, {}), "microsoft-store");
    assert.equal(updateDistribution(root, { NOTEDROP_DISTRIBUTION: "github" }), "github");
    assert.equal(updateDistribution(root, { NOTEDROP_DISTRIBUTION: "github" }, true), "microsoft-store");
    assert.equal(parseUpdateDistribution(undefined), "development");
    assert.throws(() => parseUpdateDistribution("guess"), /must be/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("update API: Store packages keep version settings but refuse internal update endpoints", async () => {
  const home = mkdtempSync(join(tmpdir(), "notedrop-store-api-"));
  const e = await Etude.open(join(home, "etude.db"), { home });
  try {
    const app = createApp(e, { webDist: null, updateDistribution: "microsoft-store" });
    const get = await app.request("/api/update?check=1");
    const post = await app.request("/api/update", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(get.status, 409);
    assert.equal(post.status, 409);
    const settings = await (await app.request("/api/settings")).json() as { version: string; updateDistribution: string };
    assert.ok(settings.version);
    assert.equal(settings.updateDistribution, "microsoft-store");
  } finally {
    e.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("update: rejects invalid package versions instead of comparing them loosely", async () => {
  const dir = mkdtempSync(join(tmpdir(), "etude-pkg-version-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "latest" }));
    await assert.rejects(updateStatus({ root: dir }), /invalid SemVer/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("update: rejects a checkout tracking a different repository", async () => {
  const f = fixture();
  try {
    sh(f.app, "remote", "set-url", "origin", "https://github.com/Zibhelina/etude.git");
    const st = await updateStatus({ root: f.app, fetch: true, force: true, trustedRemote: f.origin });
    assert.equal(st.kind, "git");
    assert.equal(st.kind === "git" && st.behind, 0);
    assert.match(String(st.kind === "git" && st.blocked), /restricted to Game-Unity\/Notedrop/);
    await assert.rejects(applyUpdate({ root: f.app, trustedRemote: f.origin }), /restricted to Game-Unity\/Notedrop/);
  } finally {
    f.done();
  }
});

test("update: rejects insecure HTTP remotes", async () => {
  const f = fixture();
  try {
    for (const url of [
      "http://github.com/Game-Unity/Notedrop.git",
      "http://github.com/Game-Unity/Notedrop",
    ]) {
      sh(f.app, "remote", "set-url", "origin", url);
      const st = await updateStatus({ root: f.app, fetch: false });
      assert.equal(st.kind, "git");
      assert.match(String(st.kind === "git" && st.blocked), /restricted to Game-Unity\/Notedrop/);
    }
  } finally {
    f.done();
  }
});

test("update: a failed build restores the old commit and keeps a data backup", async () => {
  const f = fixture();
  const home = join(f.dir, "home");
  const dbPath = join(home, "etude.db");
  mkdirHomeDb(home, dbPath);
  try {
    f.push("broken web build", "two\n");
    const changed = join(f.dev, "web");
    if (!existsSync(changed)) mkdirSync(changed, { recursive: true });
    writeFileSync(join(changed, "vite.config.ts"), "export default { invalid: true };\n");
    sh(f.dev, "add", ".");
    sh(f.dev, ...ident, "commit", "--quiet", "-m", "add broken build");
    sh(f.dev, "push", "--quiet", "origin", "main");
    const before = sh(f.app, "rev-parse", "HEAD");
    await assert.rejects(applyUpdate({ root: f.app, data: { home, dbPath }, trustedRemote: f.origin }), /rolled back/);
    assert.equal(sh(f.app, "rev-parse", "HEAD"), before);
    assert.equal(readFileSync(join(f.app, "notes.txt"), "utf8"), "one\n");
    const backups = readdirSync(join(home, "update-backups"));
    assert.equal(backups.length, 1);
    assert.equal(JSON.parse(readFileSync(join(home, "update-backups", backups[0], "manifest.json"), "utf8")).kind, "update");
  } finally {
    f.done();
  }
});

test("update: a failed dependency install restores the old manifest and commit", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.dev, "package.json"), JSON.stringify({ name: "etude-fixture", version: "2.0.0", dependencies: { broken: "file:./missing-local-package" } }));
    sh(f.dev, "add", ".");
    sh(f.dev, ...ident, "commit", "--quiet", "-m", "break dependencies");
    sh(f.dev, "push", "--quiet", "origin", "main");
    const before = sh(f.app, "rev-parse", "HEAD");
    await assert.rejects(applyUpdate({ root: f.app, trustedRemote: f.origin }), /rolled back.*install|rolled back.*ENOENT/is);
    assert.equal(sh(f.app, "rev-parse", "HEAD"), before);
    assert.equal(JSON.parse(readFileSync(join(f.app, "package.json"), "utf8")).dependencies, undefined);
  } finally {
    f.done();
  }
});

test("update backup: database, settings, media and restoration are preserved", async () => {
  const home = mkdtempSync(join(tmpdir(), "notedrop-backup-"));
  const dbPath = join(home, "etude.db");
  mkdirHomeDb(home, dbPath);
  try {
    const snapshot = await createUpdateBackup({ home, dbPath, appVersion: "1.0.0", kind: "update" });
    const db = new DatabaseSync(dbPath);
    db.exec("INSERT INTO values_table(value) VALUES ('changed')");
    db.close();
    writeFileSync(join(home, "media", "card.txt"), "changed\n");
    const restored = await restoreUpdateBackup(snapshot.directory, home, dbPath);
    const check = new DatabaseSync(dbPath, { readOnly: true });
    assert.equal(check.prepare("SELECT COUNT(*) AS n FROM values_table").get()!.n, 0);
    check.close();
    assert.equal(readFileSync(join(home, "media", "card.txt"), "utf8"), "original\n");
    assert.ok(existsSync(restored.previous.database));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("schema migration takes a data snapshot before changing the database", async () => {
  const home = mkdtempSync(join(tmpdir(), "notedrop-migration-"));
  const dbPath = join(home, "etude.db");
  try {
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('schema_version', '1')");
    db.close();
    const e = await Etude.open(dbPath, { home });
    e.close();
    const backups = readdirSync(join(home, "update-backups"));
    assert.equal(backups.length, 1);
    assert.equal(JSON.parse(readFileSync(join(home, "update-backups", backups[0], "manifest.json"), "utf8")).kind, "migration");
    const check = new DatabaseSync(dbPath, { readOnly: true });
    assert.equal(check.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()!.value, "2");
    check.close();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

function mkdirHomeDb(home: string, dbPath: string) {
  mkdirSync(join(home, "media"), { recursive: true });
  writeFileSync(join(home, "media", "card.txt"), "original\n");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE values_table (value TEXT)");
  db.close();
}

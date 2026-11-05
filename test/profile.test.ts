import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli/run.ts";
import { claimNoteDropProfile, profileEnvironment, ProfileConfigurationError, resolveNoteDropProfile } from "../src/core/profile.ts";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "notedrop-profile-"));
  const root = join(dir, "app");
  mkdirSync(root);
  return { dir, root };
}

test("NoteDrop profiles resolve distinct homes and backend ports", () => {
  const { dir, root } = fixture();
  try {
    const dev = resolveNoteDropProfile("dev", {}, root);
    const stable = resolveNoteDropProfile("stable", {}, root);
    assert.equal(dev.home, join(homedir(), ".notedrop-dev"));
    assert.equal(dev.dbPath, join(dev.home, "etude.db"));
    assert.equal(dev.port, 4612);
    assert.equal(stable.home, join(homedir(), ".notedrop"));
    assert.equal(stable.dbPath, join(stable.home, "etude.db"));
    assert.equal(stable.port, 4613);
    assert.notEqual(dev.dbPath, stable.dbPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("profile overrides stay inside their isolated home", () => {
  const { dir, root } = fixture();
  try {
    const home = join(dir, "data");
    const configured = resolveNoteDropProfile("dev", {
      ETUDE_HOME: home,
      ETUDE_DB: join(home, "custom.db"),
      ETUDE_PORT: "4712",
    }, root);
    assert.equal(configured.home, home);
    assert.equal(configured.dbPath, join(home, "custom.db"));
    assert.equal(configured.port, 4712);
    assert.equal(profileEnvironment("stable", {}, root).ETUDE_HOME, join(homedir(), ".notedrop"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("profiles reject Etude Original, cross-profile, repository, and escaping database paths", () => {
  const { dir, root } = fixture();
  try {
    const originalHome = join(homedir(), ".etude");
    const stableHome = join(homedir(), ".notedrop");
    assert.throws(() => resolveNoteDropProfile("dev", { ETUDE_HOME: originalHome }, root), ProfileConfigurationError);
    assert.throws(() => resolveNoteDropProfile("dev", { ETUDE_HOME: stableHome }, root), ProfileConfigurationError);
    assert.throws(() => resolveNoteDropProfile("stable", { ETUDE_HOME: root }, root), ProfileConfigurationError);
    assert.throws(
      () => resolveNoteDropProfile("dev", { ETUDE_HOME: join(dir, "data"), ETUDE_DB: join(dir, "elsewhere.db") }, root),
      ProfileConfigurationError,
    );
    assert.throws(() => resolveNoteDropProfile("stable", { ETUDE_PORT: "0" }, root), ProfileConfigurationError);
    assert.throws(() => resolveNoteDropProfile("stable", { ETUDE_PORT: "4612" }, root), ProfileConfigurationError);
    assert.throws(() => resolveNoteDropProfile("dev", { ETUDE_PORT: "4610" }, root), ProfileConfigurationError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a data directory stays assigned to the profile that first claimed it", () => {
  const { dir, root } = fixture();
  try {
    const home = join(dir, "claimed");
    claimNoteDropProfile("dev", home);
    assert.equal(resolveNoteDropProfile("dev", { ETUDE_HOME: home }, root).home, home);
    assert.throws(() => resolveNoteDropProfile("stable", { ETUDE_HOME: home }, root), ProfileConfigurationError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI rejects profile data inside the checkout before opening a database", async () => {
  let stderr = "";
  const code = await run(["db", "path"], {
    stdout: () => {},
    stderr: (s) => (stderr += s),
    stdin: () => "",
    isTTY: false,
    env: { NOTEDROP_PROFILE: "stable", ETUDE_HOME: process.cwd() },
  });
  assert.equal(code, 4);
  assert.match(stderr, /outside the repository or installation directory/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSemVer, parseSemVer } from "../src/core/semver.ts";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("SemVer parser accepts release versions and orders prereleases correctly", () => {
  for (const valid of ["1.0.0", "2.4.1-beta.2", "3.0.0+build.9"]) assert.ok(parseSemVer(valid), valid);
  for (const invalid of ["1.0", "v1.0.0", "01.0.0", "1.0.0-", "latest"]) assert.equal(parseSemVer(invalid), null, invalid);
  assert.ok(compareSemVer("1.0.1", "1.0.0") > 0);
  assert.ok(compareSemVer("1.0.0", "1.0.0-rc.1") > 0);
  assert.ok(compareSemVer("1.0.0-rc.2", "1.0.0-rc.1") > 0);
  assert.ok(compareSemVer("1.0.0-beta", "1.0.0-2") > 0);
  assert.throws(() => compareSemVer("latest", "1.0.0"), /invalid semantic version/);
});

test("release check enforces the package version tag", () => {
  const node = process.execPath;
  assert.doesNotThrow(() => execFileSync(node, ["scripts/check-release.ts", "v1.0.0"], { stdio: "pipe" }));
  assert.throws(() => execFileSync(node, ["scripts/check-release.ts", "v9.9.9"], { stdio: "pipe" }), (error: any) =>
    String(error.stderr).includes("release tag v9.9.9 does not match"));
});

test("release check rejects stale Etude metadata and mismatched artifact versions", () => {
  const out = mkdtempSync(join(tmpdir(), "notedrop-release-"));
  try {
    writeFileSync(join(out, "latest.yml"), "version: 1.0.0\npath: Notedrop-windows-setup.exe\nsha512: test\n");
    assert.doesNotThrow(() => execFileSync(process.execPath, ["scripts/check-release.ts", "v1.0.0", out], { stdio: "pipe" }));
    writeFileSync(join(out, "latest.yml"), "version: 0.9.0\npath: Etude-windows-setup.exe\nsha512: test\n");
    assert.throws(() => execFileSync(process.execPath, ["scripts/check-release.ts", "v1.0.0", out], { stdio: "pipe" }));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

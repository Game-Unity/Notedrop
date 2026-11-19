import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("desktop update and release configuration is fixed to Notedrop", () => {
  const build = read("desktop/build.ts");
  const storeBuild = read("scripts/build-store.ts");
  const updates = read("desktop/updates.ts");
  const workflow = read(".github/workflows/desktop.yml");
  const mac = read("packaging/macos/Info.plist");
  assert.match(build, /appId: "com\.gameunity\.notedrop\.desktop"/);
  assert.match(build, /publish: \{ provider: "github" as const, owner: "Game-Unity", repo: "Notedrop" \}/);
  assert.match(build, /executableName: "notedrop-desktop"/);
  assert.match(mac, /com\.gameunity\.notedrop\.macos/);
  assert.match(updates, /owner: "Game-Unity", repo: "Notedrop"/);
  assert.match(updates, /autoInstallOnAppQuit = false/);
  assert.match(updates, /await createUpdateBackup/);
  assert.match(updates, /mode === "store"/);
  assert.match(build, /notedrop: \{ distribution \}/);
  assert.match(build, /NOTEDROP_DISTRIBUTION \?\? "github"/);
  assert.match(build, /target: storeBuild \? "appx" : "nsis"/);
  assert.match(build, /MSIX_IDENTITY_NAME/);
  assert.match(build, /MSIX_PUBLISHER/);
  assert.match(build, /MSIX_APPLICATION_ID/);
  assert.match(storeBuild, /NOTEDROP_DISTRIBUTION = "microsoft-store"/);
  assert.match(storeBuild, /MSIX_IDENTITY_NAME \?\?= "30994AppZoid\.Notedrop"/);
  assert.match(storeBuild, /MSIX_APPLICATION_ID \?\?= "NOTEDROP"/);
  assert.match(build, /electronUpdaterAware: false/);
  assert.doesNotMatch(build, /identityName:\s*["'][^"']+["']/);
  assert.match(workflow, /node scripts\/check-release\.ts "\$TAG"/);
  assert.doesNotMatch(workflow, /Etude-(?:mac|windows|linux)/);
});

test("Microsoft Store builds suppress every updater surface but keep the About version", () => {
  const updateBar = read("web/src/components/update-bar.tsx");
  const settings = read("web/src/pages/settings.tsx");
  const platform = read("web/src/lib/platform.ts");
  const preload = read("desktop/preload.cjs");
  assert.match(updateBar, /internalUpdatesAvailable\(\)/);
  assert.match(updateBar, /!started && !serverless\(\) && internalUpdatesAvailable\(\)/);
  assert.match(settings, /internalUpdatesAvailable\(\).*<p/);
  assert.match(settings, /Version .*saved\.version/s);
  assert.match(platform, /distribution: "development" \| "github" \| "microsoft-store"/);
  assert.match(preload, /distribution: process\.env\.NOTEDROP_DISTRIBUTION/);
});

test("desktop package keeps compatibility names without using them as release identity", () => {
  const pkg = JSON.parse(read("desktop/package.json"));
  assert.equal(pkg.productName, "Notedrop");
  assert.equal(pkg.name, "notedrop-desktop");
  const root = JSON.parse(read("package.json"));
  assert.equal(root.bin.notedrop, "./bin/notedrop.js");
  assert.equal(root.bin.etude, "./bin/etude.js");
});

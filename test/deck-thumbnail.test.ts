import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Etude } from "../src/core/engine.ts";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lT8AAAAASUVORK5CYII=", "base64");

async function openCollection(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "etude-deck-thumbnail-"));
  const path = join(dir, "collection", "etude.db");
  let etude = await Etude.open(path, { home: dir });
  t.after(() => {
    etude.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, path, etude, replaceEtude: (next: Etude) => { etude = next; } };
}

test("thumbnail metadata migrates, persists, and clears without changing the description", async (t) => {
  const { dir, path, etude, replaceEtude } = await openCollection(t);
  etude.ensureDeck("Course");
  const description = "Learning goals\n\n![Existing note image](/media/files/existing.png)";
  etude.updateDeck("Course", { description });
  const media = etude.storeMedia("cover.png", PNG);
  assert.equal(etude.updateDeck("Course", { thumbnail: media.url }).thumbnail, media.url);
  assert.equal(etude.deck("Course").description, description);

  etude.db.sql.exec("ALTER TABLE decks DROP COLUMN thumbnail");
  etude.close();
  const reopened = await Etude.open(path, { home: dir });
  replaceEtude(reopened);

  assert.equal(reopened.deck("Course").thumbnail, null);
  assert.equal(reopened.deck("Course").description, description);
  assert.equal(reopened.updateDeck("Course", { thumbnail: media.url }).thumbnail, media.url);
  assert.equal(reopened.updateDeck("Course", { thumbnail: null }).thumbnail, null);
  assert.equal(reopened.deck("Course").description, description);
  assert.equal(existsSync(media.path), true);
});

test("pack round-trip carries thumbnail bytes and association, while old packs leave it unchanged", async (t) => {
  const { etude } = await openCollection(t);
  etude.ensureDeck("Course");
  etude.ensureDeck("Course::Unit");
  const description = "Learning goals\n\n![Existing note image](/media/files/existing.png)";
  const media = etude.storeMedia("cover.png", PNG);
  etude.updateDeck("Course", { description, thumbnail: media.url });
  etude.updateDeck("Course::Unit", { description: "Subdeck description" });

  const pack = etude.exportPack({ deck: "Course" }) as { decks: { name: string; thumbnail: string | null }[] };
  assert.deepEqual(pack.decks.map((deck) => deck.name), ["Course", "Course::Unit"]);
  assert.equal(pack.decks[0].thumbnail, `data:image/png;base64,${PNG.toString("base64")}`);

  const targetDir = mkdtempSync(join(tmpdir(), "etude-deck-thumbnail-import-"));
  const imported = await Etude.open(join(targetDir, "collection", "etude.db"), { home: targetDir });
  t.after(() => {
    imported.close();
    rmSync(targetDir, { recursive: true, force: true });
  });
  imported.importPack(pack);
  const importedDeck = imported.deck("Course");
  assert.ok(importedDeck.thumbnail);
  assert.equal(readFileSync(join(imported.mediaDir, importedDeck.thumbnail!.slice("/media/".length))).compare(PNG), 0);
  assert.equal(importedDeck.description, description);

  imported.importPack({ etude: "pack/1", decks: [{ name: "Course", description: "Updated goals" }] });
  assert.equal(imported.deck("Course").thumbnail, importedDeck.thumbnail);
  assert.equal(imported.deck("Course").description, "Updated goals");
  imported.importPack({ etude: "pack/1", decks: [{ name: "Course", thumbnail: null }] });
  assert.equal(imported.deck("Course").thumbnail, null);
});

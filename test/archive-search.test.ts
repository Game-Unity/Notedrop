import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveRoot, archiveRootSearch, matchesArchiveSearch, sortArchiveDecks } from "../web/src/lib/archive-search.ts";

test("archive search filters full deck paths and exact main-deck groups", () => {
  assert.equal(archiveRoot("Course::Unit::Topic"), "Course");
  assert.ok(matchesArchiveSearch("Course::Unit::Topic", "unit"));
  assert.ok(matchesArchiveSearch("Course::Unit", 'unit deck:"Course"'));
  assert.ok(matchesArchiveSearch("Course", 'deck:"course"'));
  assert.ok(!matchesArchiveSearch("Coursework::Unit", 'deck:"Course"'));
  assert.ok(!matchesArchiveSearch("Course::Unit", 'missing deck:"Course"'));
  assert.ok(!matchesArchiveSearch("Course::Unit", 'deck:"Course" deck:"Other"'));
  const root = 'A "quoted" \\ course';
  assert.ok(matchesArchiveSearch(`${root}::Unit`, archiveRootSearch(root)));
});

test("archive sort preserves original order and sorts names, paths, cards and dates", () => {
  const decks = [
    { name: "Zoo::Alpha", cards: 2, archivedAt: null },
    { name: "Beta", cards: 9, archivedAt: "2026-02-01T00:00:00.000Z" },
    { name: "Alpha::Gamma", cards: 1, archivedAt: "2026-01-01T00:00:00.000Z" },
  ];
  const names = (order: Parameters<typeof sortArchiveDecks>[1]) => sortArchiveDecks(decks, order).map((deck) => deck.name);
  assert.deepEqual(names("default"), ["Zoo::Alpha", "Beta", "Alpha::Gamma"]);
  assert.deepEqual(names("name"), ["Zoo::Alpha", "Beta", "Alpha::Gamma"]);
  assert.deepEqual(names("path"), ["Beta", "Alpha::Gamma", "Zoo::Alpha"]);
  assert.deepEqual(names("cards"), ["Beta", "Zoo::Alpha", "Alpha::Gamma"]);
  assert.deepEqual(names("newest"), ["Beta", "Alpha::Gamma", "Zoo::Alpha"]);
  assert.deepEqual(names("oldest"), ["Alpha::Gamma", "Beta", "Zoo::Alpha"]);
  assert.equal(decks[0].name, "Zoo::Alpha");
});

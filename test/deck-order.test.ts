import { test } from "node:test";
import assert from "node:assert/strict";
import { Etude } from "../src/core/engine.ts";
import { canMoveDeckWithinScope, isDeckWithinScope } from "../web/src/lib/deck-tree-scope.ts";

test("decks: sibling order, subdecks follow their parent", async () => {
  const e = await Etude.open(":memory:");
  for (const n of ["Biology", "Chess", "Networks::Week 1", "Networks::Week 2", "Networks::Week 3", "Zoo"]) e.ensureDeck(n);
  const names = () => e.deckTree().map((d) => d.name);
  // No order yet: by name.
  assert.deepEqual(names(), ["Biology", "Chess", "Networks", "Networks::Week 1", "Networks::Week 2", "Networks::Week 3", "Zoo"]);

  assert.deepEqual(e.reorderDecks("", ["Networks", "Zoo"]), ["Networks", "Zoo", "Biology", "Chess"]);
  assert.deepEqual(names(), ["Networks", "Networks::Week 1", "Networks::Week 2", "Networks::Week 3", "Zoo", "Biology", "Chess"]);

  e.reorderDecks("Networks", ["networks::week 3"]);
  assert.deepEqual(names().slice(0, 4), ["Networks", "Networks::Week 3", "Networks::Week 1", "Networks::Week 2"]);

  // A new deck lands after the ordered ones; renaming keeps a deck's place.
  e.ensureDeck("Algebra");
  assert.deepEqual(names().filter((n) => !n.includes("::")), ["Networks", "Zoo", "Biology", "Chess", "Algebra"]);
  e.renameDeck("Zoo", "Zoology");
  assert.deepEqual(names().filter((n) => !n.includes("::")), ["Networks", "Zoology", "Biology", "Chess", "Algebra"]);
  assert.equal(e.deck("Zoology").position, 1);

  assert.throws(() => e.reorderDecks("", ["Networks::Week 1"]), /isn't a subdeck/);
  assert.throws(() => e.reorderDecks("Nope", []), /unknown deck/);
});

test("deck tree: latest review includes cards in subdecks", async () => {
  const e = await Etude.open(":memory:");
  e.ensureDeck("Course");
  e.ensureDeck("Course::Unit");
  e.ensureDeck("Other");
  e.upsertItem({ id: "course-card", deck: "Course", type: "basic", fields: { front: "Q", back: "A" } });
  e.upsertItem({ id: "unit-card", deck: "Course::Unit", type: "basic", fields: { front: "Q", back: "A" } });

  const courseReview = "2026-01-01T10:00:00.000Z";
  const unitReview = "2026-02-01T10:00:00.000Z";
  e.db.run("UPDATE cards SET last_review = ? WHERE item_id = ?", courseReview, "course-card");
  e.db.run("UPDATE cards SET last_review = ? WHERE item_id = ?", unitReview, "unit-card");

  const tree = e.deckTree();
  assert.equal(tree.find((deck) => deck.name === "Course")?.lastReview, unitReview);
  assert.equal(tree.find((deck) => deck.name === "Course::Unit")?.lastReview, unitReview);
  assert.equal(tree.find((deck) => deck.name === "Other")?.lastReview, null);
});

test("decks: move a subdeck to another deck, out to the top level, and back", async () => {
  const e = await Etude.open(":memory:");
  for (const n of ["Biology", "Networks::Week 1", "Networks::Week 2", "Networks::Week 2::Lab", "Games::Chess"]) e.ensureDeck(n);
  e.reorderDecks("", ["Networks", "Games", "Biology"]);
  const names = () => e.deckTree().map((d) => d.name);

  // Out to the top level at a given place, with its own subdeck.
  assert.equal(e.moveDeck("Networks::Week 2", "", 1).name, "Week 2");
  assert.deepEqual(names(), ["Networks", "Networks::Week 1", "Week 2", "Week 2::Lab", "Games", "Games::Chess", "Biology"]);

  // Into another deck; no index means last.
  e.moveDeck("Week 2", "Games");
  assert.deepEqual(names(), ["Networks", "Networks::Week 1", "Games", "Games::Chess", "Games::Week 2", "Games::Week 2::Lab", "Biology"]);
  e.moveDeck("Games::Week 2", "Games", 0);
  assert.deepEqual(names().slice(2, 5), ["Games", "Games::Week 2", "Games::Week 2::Lab"]);

  // A top-level deck becomes a subdeck.
  e.moveDeck("Biology", "Networks", 0);
  assert.deepEqual(names().slice(0, 3), ["Networks", "Networks::Biology", "Networks::Week 1"]);

  // Items and their cards come along.
  e.upsertItem({ id: "x.1", deck: "Games::Week 2::Lab", type: "basic", fields: { front: "q", back: "a" } });
  e.moveDeck("Games::Week 2", "Networks");
  assert.equal(e.item("x.1").deck, "Networks::Week 2::Lab");

  assert.throws(() => e.moveDeck("Networks", "Networks::Week 1"), /inside itself/);
  assert.throws(() => e.moveDeck("Networks", "Networks"), /inside itself/);
  e.ensureDeck("Week 1");
  assert.throws(() => e.moveDeck("Networks::Week 1", ""), /already has a deck called "Week 1"/);
  assert.equal(e.deck("Networks::Week 1").name, "Networks::Week 1");

});

test("chapter tree management: sort, nest, return to its root, rename and delete three levels", async () => {
  const e = await Etude.open(":memory:");
  for (const name of ["Course", "Course::First", "Course::First::Deep", "Course::First::Deep::Leaf", "Course::Second", "Other", "Other::Unit"]) {
    e.ensureDeck(name);
  }
  const names = () => e.deckTree().map((deck) => deck.name);

  e.reorderDecks("Course", ["Course::Second", "Course::First"]);
  assert.deepEqual(names().slice(0, 3), ["Course", "Course::Second", "Course::First"]);

  assert.equal(e.moveDeck("Course::Second", "Course::First::Deep").name, "Course::First::Deep::Second");
  assert.ok(names().includes("Course::First::Deep::Second"));
  assert.equal(e.moveDeck("Course::First::Deep::Second", "Course", 0).name, "Course::Second");
  assert.deepEqual(names().slice(0, 2), ["Course", "Course::Second"]);

  e.renameDeck("Course::First", "Course::Renamed");
  assert.ok(names().includes("Course::Renamed::Deep::Leaf"));
  assert.throws(() => e.moveDeck("Course", "Course::Renamed"), /inside itself/);

  e.deleteDeck("Course::Renamed", { items: true });
  assert.ok(!names().some((name) => name === "Course::Renamed" || name.startsWith("Course::Renamed::")));
  assert.ok(names().includes("Other::Unit"));
});

test("chapter tree management: only descendants may move within the selected root", () => {
  assert.equal(isDeckWithinScope("Course", "Course"), true);
  assert.equal(isDeckWithinScope("Course::Unit::Lesson", "Course"), true);
  assert.equal(isDeckWithinScope("Coursework::Unit", "Course"), false);
  assert.equal(canMoveDeckWithinScope("Course::Unit", "Course", "Course"), true);
  assert.equal(canMoveDeckWithinScope("Course::Unit::Lesson", "Course::Unit", "Course"), true);
  assert.equal(canMoveDeckWithinScope("Course", "Course::Unit", "Course"), false);
  assert.equal(canMoveDeckWithinScope("Course::Unit", "Other", "Course"), false);
  assert.equal(canMoveDeckWithinScope("Course::Unit", "", "Course"), false);
});

test("creating a root chapter preserves the existing sibling order and appends the new child", async () => {
  const e = await Etude.open(":memory:");
  e.ensureDeck("Course");
  assert.deepEqual(e.deckTree().map((deck) => deck.name), ["Course"]);

  e.ensureDeck("Course::Zulu");
  e.ensureDeck("Course::Alpha");
  e.reorderDecks("Course", ["Course::Zulu", "Course::Alpha"]);
  e.ensureDeck("Course::Aardvark");
  e.reorderDecks("Course", ["Course::Zulu", "Course::Alpha", "Course::Aardvark"]);

  assert.deepEqual(
    e.deckTree().filter((deck) => deck.name.startsWith("Course::")).map((deck) => deck.name),
    ["Course::Zulu", "Course::Alpha", "Course::Aardvark"],
  );
});

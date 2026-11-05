import { test } from "node:test";
import assert from "node:assert/strict";
import { Etude } from "../src/core/engine.ts";
import { compile } from "../src/core/query.ts";
import { masterySearch, partitionProgress } from "../web/src/lib/notedrop-metrics.ts";

const type = {
  id: "metric-card",
  name: "Metric card",
  faces: ["front", "back"],
  fields: [{ name: "front", kind: "text" as const, required: true }, { name: "back", kind: "text" as const, required: true }],
  template: { html: "<div>{{front}}</div>" },
  grader: { kind: "self" as const },
};

test("mastery metric uses a strict 21-day threshold and excludes new cards", () => {
  const query = masterySearch("Course::Chapter");
  assert.equal(query, 'deck:"Course::Chapter" prop:stability>21 -is:new');
  const compiled = compile(query);
  assert.match(compiled.where, /c\.stability > \?/);
  assert.match(compiled.where, /NOT c\.state = 0/);
  assert.ok(compiled.params.includes(21));
});

test("learning is the exclusive remainder and the three metrics partition total", () => {
  const value = partitionProgress(9, 3, 2);
  assert.deepEqual(value, { total: 9, new: 3, learning: 4, mastered: 2, percent: 22 });
  assert.equal(value.new + value.learning + value.mastered, value.total);
});

test("empty decks have zero mastery and invalid overlapping counts fail", () => {
  assert.deepEqual(partitionProgress(0, 0, 0), { total: 0, new: 0, learning: 0, mastered: 0, percent: 0 });
  assert.throws(() => partitionProgress(2, 1, 2), /Invalid NoteDrop progress counts/);
  assert.throws(() => partitionProgress(3, 1.5, 0), /Invalid NoteDrop progress counts/);
});

test("strict mastery boundary partitions cards across a deck and its subdecks", async () => {
  const etude = await Etude.open(":memory:");
  etude.saveType(type);
  const add = (id: string, deck: string, state: number, stability: number) => {
    etude.upsertItem({ id, type: type.id, deck, fields: { front: id, back: id } });
    etude.db.run("UPDATE cards SET state = ?, stability = ? WHERE item_id = ?", state, stability, id);
  };
  add("boundary", "Root", 1, 21);
  add("mastered", "Root::Chapter", 2, 21.01);
  add("new", "Root::Chapter", 0, 100);

  const total = etude.search('deck:"Root"', { limit: 1 }).total;
  const newCards = etude.search('deck:"Root" is:new', { limit: 1 }).total;
  const mastered = etude.search(masterySearch("Root"), { limit: 1 }).total;
  assert.deepEqual(partitionProgress(total, newCards, mastered), { total: 6, new: 2, learning: 2, mastered: 2, percent: 33 });
  etude.close();
});

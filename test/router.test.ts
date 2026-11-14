/// <reference types="vite/client" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const { window } = new JSDOM("", { url: "http://localhost/" });
window.scrollTo = () => {};
Object.assign(globalThis, { window, location: window.location, history: window.history });
const { navigate, studyReturnTo } = await import("../web/src/lib/router.ts");

test("study navigation returns to the originating route with its query", () => {
  const origin = "/browse?q=tag%3Abwl&item=12";
  window.history.replaceState(null, "", origin);
  navigate("/study?deck=BWL");
  assert.equal(studyReturnTo(), origin);
  navigate("/study?deck=BWL&ahead=1");
  assert.equal(studyReturnTo(), origin);
  navigate("/study?deck=BWL&card=12", { replace: true });
  assert.equal(studyReturnTo(), origin);
  navigate(studyReturnTo());
  assert.equal(window.location.pathname + window.location.search, origin);
});

test("direct study links fall back to decks rather than an external or study route", () => {
  for (const state of [null, { studyReturnTo: "//example.com" }, { studyReturnTo: "/study?deck=Other" }]) {
    window.history.replaceState(state, "", "/study?deck=BWL");
    assert.equal(studyReturnTo(), "/");
  }
  window.history.replaceState(null, "", "/study?deck=BWL");
  navigate("/study?deck=BWL&ahead=1");
  assert.equal(studyReturnTo(), "/");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { JSDOM } from "jsdom";

test("card runtime: explanation action stays inside the revealed answer and notifies the host once", async (t) => {
  const { window } = new JSDOM('<!doctype html><html><body><div id="card"></div></body></html>', { pretendToBeVisual: true });
  Object.assign(globalThis, {
    window,
    document: window.document,
    MutationObserver: window.MutationObserver,
    ResizeObserver: class {
      observe() {}
    },
  });
  const sent: { type: string }[] = [];
  window.postMessage = (message) => { sent.push(message); };
  const runtimeUrl = new URL("../runtime/runtime.js", import.meta.url).href;
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL === runtimeUrl && specifier === "./vendor/marked.js") return nextResolve(import.meta.resolve("marked"), context);
      if (context.parentURL === runtimeUrl && specifier === "./vendor/katex.js") return nextResolve(import.meta.resolve("katex"), context);
      return nextResolve(specifier, context);
    },
  });
  t.after(() => {
    hooks.deregister();
    window.close();
  });
  const { boot } = await import(runtimeUrl);
  boot(() => {}, '<div class="prose">Front</div><template data-on="result"><div class="e-reveal">Back</div></template>');
  const message = (type: string, extra = {}) => {
    const event = new window.MessageEvent("message", { data: { etude: 1, type, ...extra } });
    Object.defineProperty(event, "source", { value: window });
    window.dispatchEvent(event);
  };
  message("init", { view: {} });
  await new Promise(setImmediate);
  assert.equal(window.document.querySelector("[data-explain-action]"), null);
  message("result", { result: { key: {} } });
  message("explain-action", { available: true });
  message("explain-action", { available: true });
  assert.equal(window.document.querySelectorAll(".e-reveal > [data-explain-action]").length, 1);
  const button = window.document.querySelector<HTMLButtonElement>("[data-explain-action]");
  assert.ok(button);
  button.click();
  button.click();
  assert.equal(sent.filter((event) => event.type === "explain").length, 1);
  message("explain-action", { available: false });
  assert.equal(window.document.querySelector("[data-explain-action]"), null);
});

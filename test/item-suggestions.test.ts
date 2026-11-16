import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

test("deck and tag suggestions support keyboard selection and free text", async (t) => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost", pretendToBeVisual: true });
  const globals = ["window", "document", "HTMLElement", "HTMLInputElement", "Element", "Node", "CustomEvent", "MutationObserver", "DocumentFragment", "getComputedStyle", "DOMRect", "Event", "MouseEvent"] as const;
  for (const name of globals) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class { observe() {} unobserve() {} disconnect() {} } });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const vite = await createServer({ configFile: "web/vite.config.ts", server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
  t.after(async () => {
    await vite.close();
    dom.window.close();
    for (const name of [...globals, "IS_REACT_ACT_ENVIRONMENT", "ResizeObserver"]) Reflect.deleteProperty(globalThis, name);
  });
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { Tooltip } = await import("radix-ui");
  const { DeckInput, TagInput } = await vite.ssrLoadModule("/src/components/item-editor.tsx");
  const root = createRoot(document.getElementById("root")!);
  const key = (input: HTMLInputElement, name: string) => input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: name, bubbles: true }));
  const type = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  };
  let deck = "";
  let tags: string[] = [];
  function Form() {
    const [selectedDeck, setDeck] = React.useState("");
    const [selectedTags, setTags] = React.useState<string[]>([]);
    return React.createElement(Tooltip.Provider, null,
      React.createElement(DeckInput, { value: selectedDeck, decks: ["Biology", "Chemistry"], onChange: (value: string) => { deck = value; setDeck(value); } }),
      React.createElement(TagInput, { value: selectedTags, known: ["cell", "chemistry"], onChange: (value: string[]) => { tags = value; setTags(value); } }),
    );
  }
  await act(async () => root.render(React.createElement(Form)));
  const deckInput = document.querySelector<HTMLInputElement>('input[aria-label="Deck"]')!;
  await act(async () => deckInput.focus());
  assert.equal(document.querySelectorAll('[role="option"]').length, 2);
  await act(async () => new Promise((resolve) => setTimeout(resolve, 100)));
  await act(async () => {
    deckInput.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    deckInput.dispatchEvent(new dom.window.MouseEvent("pointerup", { bubbles: true, cancelable: true }));
    deckInput.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  assert.equal(deckInput.getAttribute("aria-expanded"), "true");
  await act(async () => key(deckInput, "ArrowDown"));
  await act(async () => key(deckInput, "Enter"));
  assert.equal(deck, "Biology");
  assert.equal(deckInput.getAttribute("aria-expanded"), "false");
  await act(async () => type(deckInput, "New deck"));
  assert.equal(deck, "New deck");
  assert.equal(document.querySelector('[role="listbox"]'), null);

  const tagInput = document.querySelector<HTMLInputElement>('input[aria-label="Tags"]')!;
  await act(async () => tagInput.focus());
  await act(async () => key(tagInput, "ArrowDown"));
  await act(async () => key(tagInput, "Enter"));
  assert.deepEqual(tags, ["cell"]);
  await act(async () => type(tagInput, "custom"));
  await act(async () => key(tagInput, "Enter"));
  assert.deepEqual(tags, ["cell", "custom"]);
  await act(async () => type(tagInput, "chem"));
  const option = document.querySelector<HTMLElement>('[role="option"]');
  assert.equal(option?.textContent, "chemistry");
  await act(async () => {
    option!.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    option!.click();
  });
  assert.deepEqual(tags, ["cell", "custom", "chemistry"]);
  await act(async () => root.unmount());
});

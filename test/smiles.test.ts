import { test, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// smiles-drawer draws into the DOM; the browser globals it touches come from jsdom here.
const { window } = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const k of ["window", "document", "getComputedStyle", "SVGSVGElement", "SVGElement", "HTMLElement", "HTMLCanvasElement"]) (globalThis as any)[k] = (window as any)[k];

const { renderSmiles, renderSmilesBlocks, inlineSmiles } = await import("../web/src/editor/smiles.ts");

before(() => {
  // jsdom has no canvas: text measurement falls back, which is fine for structure, not for metrics.
  window.document.body.innerHTML = "";
});

test("renderSmiles draws an SVG structure", async () => {
  const el = window.document.createElement("div");
  window.document.body.appendChild(el);
  const svg = await renderSmiles("CC(=O)Oc1ccccc1C(=O)O", el);
  assert.equal(svg.tagName.toLowerCase(), "svg");
  assert.ok(svg.getAttribute("viewBox"));
  assert.equal(svg.getAttribute("aria-label"), "CC(=O)Oc1ccccc1C(=O)O");
  assert.ok(svg.querySelectorAll("line, path, text").length > 0);
});

test("renderSmiles honors color CSS variables", async () => {
  const el = window.document.createElement("div");
  el.style.setProperty("--smiles-color", "#112233");
  el.style.setProperty("--smiles-color-o", "#445566");
  window.document.body.appendChild(el);
  const svg = await renderSmiles("CCO", el);
  const html = svg.outerHTML;
  assert.ok(html.includes("#445566"), "oxygen uses the element override");
  assert.ok(html.includes("#112233"), "bonds and carbon use the base override");
});

test("renderSmiles rejects invalid SMILES", async () => {
  const el = window.document.createElement("div");
  await assert.rejects(renderSmiles("notasmiles((", el));
  assert.equal(el.querySelector("svg"), null);
});

test("renderSmiles widens the viewBox to cover measured ink", async () => {
  const el = window.document.createElement("div");
  window.document.body.appendChild(el);
  const proto = (window as any).SVGElement.prototype;
  proto.getBBox = () => ({ x: -1000, y: 0, width: 3000, height: 10 });
  try {
    const svg = await renderSmiles("CCO", el);
    const [x, , w] = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
    assert.ok(x <= -1002, "left edge covers the measured ink plus padding");
    assert.ok(x + w >= 2002, "right edge covers the measured ink plus padding");
  } finally {
    delete proto.getBBox;
  }
});

test("renderSmiles uses real super/subscript positioning instead of Unicode glyphs", async () => {
  const el = window.document.createElement("div");
  window.document.body.appendChild(el);
  const svg = await renderSmiles("[NH4+]", el);
  const tspans = [...svg.querySelectorAll("tspan")];
  const unicodeScripts = /[⁰-⁹⁺⁻₀-₉]/;
  assert.ok(tspans.length > 0);
  assert.ok(tspans.every((t) => !unicodeScripts.test(t.textContent ?? "")), "no Unicode script characters left");
  const sup = tspans.find((t) => t.getAttribute("baseline-shift") === "super");
  assert.ok(sup, "charge becomes a superscript tspan");
  assert.equal(sup!.textContent, "+");
  assert.equal(sup!.getAttribute("font-size"), "0.7em");
  const sub = tspans.find((t) => t.getAttribute("baseline-shift") === "sub");
  assert.ok(sub, "hydrogen count becomes a subscript tspan");
  assert.equal(sub!.textContent, "4");
  const plain = tspans.filter((t) => !t.hasAttribute("baseline-shift")).map((t) => t.textContent);
  assert.deepEqual(plain.sort(), ["H", "N"], "element and hydrogen stay plain text");
});

test("renderSmiles keeps position attributes on the first fragment", async () => {
  const el = window.document.createElement("div");
  window.document.body.appendChild(el);
  const svg = await renderSmiles("[OH-]", el);
  const tspans = [...svg.querySelectorAll("tspan")];
  const sup = tspans.find((t) => t.getAttribute("baseline-shift") === "super");
  assert.ok(sup);
  assert.equal(sup!.textContent, "-");
  assert.equal(sup!.getAttribute("fill"), tspans[0].getAttribute("fill"), "script fragment keeps the element color");
});

test("inlineSmiles extracts the source", () => {
  assert.equal(inlineSmiles("smiles:CCO"), "CCO");
  assert.equal(inlineSmiles("  smiles: c1ccccc1 "), "c1ccccc1");
  assert.equal(inlineSmiles("smiles:"), null);
  assert.equal(inlineSmiles("plain code"), null);
});

test("renderSmilesBlocks upgrades blocks and inline spans", async () => {
  const root = window.document.createElement("div");
  root.innerHTML = `<pre><code class="language-smiles">CCO\nc1ccccc1</code></pre><p>Ethanol <code>smiles:CCO</code> and <code>keep me</code></p>`;
  window.document.body.appendChild(root);
  await renderSmilesBlocks(root);
  const fig = root.querySelector("figure.e-smiles");
  assert.ok(fig, "block becomes a figure");
  assert.equal(fig!.querySelectorAll("svg").length, 2, "one structure per line");
  assert.equal(root.querySelector("pre"), null);
  assert.ok(root.querySelector("span.e-smiles-inline svg"), "inline span becomes an SVG");
  const kept = [...root.querySelectorAll("code")].map((c) => c.textContent);
  assert.deepEqual(kept, ["keep me"], "ordinary inline code is untouched");
});

test("renderSmilesBlocks keeps invalid sources as code", async () => {
  const root = window.document.createElement("div");
  root.innerHTML = `<pre><code class="language-smiles">((broken</code></pre><p><code>smiles:((broken</code></p>`;
  window.document.body.appendChild(root);
  await renderSmilesBlocks(root);
  assert.ok(root.querySelector("pre.e-smiles-error code"), "block stays, marked as an error");
  assert.ok(root.querySelector("code.e-smiles-error"), "inline span stays, marked as an error");
  await renderSmilesBlocks(root); // marked as handled: a second pass must not re-process
});

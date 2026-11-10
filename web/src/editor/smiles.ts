// 2D chemical structures from SMILES strings, drawn with smiles-drawer (loaded on demand, SVG
// output). One module for every render target: the live markdown editor, rendered cards (through
// the kit) and app-side markdown. Styling hooks: the structure inherits the surrounding text color,
// and `--smiles-font` / `--smiles-stroke` / `--smiles-scale` on any ancestor set the label font,
// the bond thickness and a size multiplier (default 1). `--smiles-color` overrides the base color
// (bonds, carbon, hydrogen) and `--smiles-color-<element>` (lowercase, e.g. `--smiles-color-o`,
// `--smiles-color-cl`) overrides a single element's color.

/** The slice of smiles-drawer this module uses (the package's own types shift with module interop). */
interface SmilesDrawerLib {
  parse(smiles: string, success: (tree: unknown) => void, error: (e: Error) => void): void;
  SvgDrawer: new (options: object) => { draw(tree: unknown, target: Element, theme: string): SVGSVGElement };
}

let loaded: Promise<SmilesDrawerLib> | null = null;

const load = () =>
  (loaded ??= import("smiles-drawer").then((m) => {
    // Node and Vite place the default of this ESM/UMD hybrid differently; unwrap either shape.
    const d = (m as { default?: unknown }).default ?? m;
    return ((d as { default?: unknown }).default ?? d) as SmilesDrawerLib;
  }));

/** Rendered size: SVG user units (bond length 30) to CSS pixels. */
const SCALE = 0.6;

/** Element colors shared by the light and dark themes; carbon and hydrogen follow the text color. */
const PALETTE = { O: "#e74c3c", N: "#3498db", F: "#27ae60", CL: "#16a085", BR: "#d35400", I: "#8e44ad", P: "#d35400", S: "#f1c40f", B: "#e67e22", SI: "#e67e22" };

// Widgets render before they are attached; computed styles then come from the body instead.
const probe = (el: HTMLElement): HTMLElement => (el.isConnected ? el : document.body);

function textColor(el: HTMLElement): string {
  const c = getComputedStyle(probe(el)).color;
  return c && c !== "transparent" ? c : "#222222";
}

function cssVar(el: HTMLElement, name: string): string {
  return getComputedStyle(probe(el)).getPropertyValue(name).trim();
}

/** The element palette with every `--smiles-color-<element>` override applied. */
function palette(el: HTMLElement): Record<string, string> {
  const colors: Record<string, string> = { ...PALETTE };
  for (const key of Object.keys(colors)) {
    const v = cssVar(el, `--smiles-color-${key.toLowerCase()}`);
    if (v) colors[key] = v;
  }
  return colors;
}

export interface SmilesRenderOptions {
  /** Smaller rendering for structures inside a line of text. */
  inline?: boolean;
}

/** Parses `smiles` or throws the parser's SyntaxError. */
function parse(SD: SmilesDrawerLib, smiles: string): unknown {
  let tree: unknown = null;
  let error: Error | null = null;
  SD.parse(smiles, (t: unknown) => (tree = t), (e: Error) => (error = e));
  if (error) throw error;
  return tree;
}

/** Unicode super/subscript characters smiles-drawer puts into labels, mapped back to ASCII. */
const SUPERSCRIPT = new Map([..."⁰¹²³⁴⁵⁶⁷⁸⁹"].map((ch, i) => [ch, String(i)] as const));
SUPERSCRIPT.set("⁺", "+").set("⁻", "-");
const SUBSCRIPT = new Map([..."₀₁₂₃₄₅₆₇₈₉"].map((ch, i) => [ch, String(i)] as const));

/**
 * smiles-drawer writes charges, isotopes and atom counts as Unicode super/subscript characters
 * (⁻, ⁺, ₂, …) into the label text. Fonts without those glyphs fall back to a system font, which
 * looks mixed next to the rest. Split affected tspans into fragments that use real SVG script
 * positioning (baseline-shift plus a smaller font-size) with plain ASCII text.
 */
function fixScripts(svg: SVGSVGElement): void {
  for (const tspan of svg.querySelectorAll("tspan")) {
    const text = tspan.textContent ?? "";
    const runs: { shift: "super" | "sub" | null; text: string }[] = [];
    for (const ch of text) {
      const shift = SUPERSCRIPT.has(ch) ? ("super" as const) : SUBSCRIPT.has(ch) ? ("sub" as const) : null;
      const ascii = shift === "super" ? SUPERSCRIPT.get(ch)! : shift === "sub" ? SUBSCRIPT.get(ch)! : ch;
      const last = runs[runs.length - 1];
      if (last && last.shift === shift) last.text += ascii;
      else runs.push({ shift, text: ascii });
    }
    if (runs.length === 1 && runs[0].shift === null) continue;
    const frag = document.createDocumentFragment();
    runs.forEach((run, i) => {
      const el = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      // The first fragment keeps the position; the rest flow on inline from there.
      for (const attr of i === 0 ? ["fill", "x", "y"] : ["fill"]) {
        const v = tspan.getAttribute(attr);
        if (v !== null) el.setAttribute(attr, v);
      }
      if (run.shift) {
        el.setAttribute("baseline-shift", run.shift);
        el.setAttribute("font-size", "0.7em");
      }
      el.textContent = run.text;
      frag.appendChild(el);
    });
    tspan.replaceWith(frag);
  }
}

/**
 * smiles-drawer fits the viewBox to atom centers plus a fixed padding, never to the rendered
 * labels, so wide terminal labels (NH₃⁺, COOH, …) overflow the box and get clipped. Measure the
 * actual ink and widen the viewBox to cover it.
 */
function fitLabels(svg: SVGSVGElement): void {
  if (typeof svg.getBBox !== "function") return; // jsdom in tests
  const box = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
  if (box.length !== 4) return;
  // getBBox needs a rendered element; measure in the document, invisibly, then detach again.
  svg.style.position = "absolute";
  svg.style.visibility = "hidden";
  document.body.appendChild(svg);
  let b: { x: number; y: number; width: number; height: number } | null = null;
  try {
    b = svg.getBBox();
  } catch {
    b = null; // not renderable here; keep the fitted box
  }
  svg.remove();
  svg.style.position = "";
  svg.style.visibility = "";
  if (!b || !(b.width > 0)) return;
  // getBBox stops at the glyph advance boxes; antialiased edges and stroke caps reach further.
  const pad = 8;
  const minX = Math.min(box[0], b.x - pad);
  const minY = Math.min(box[1], b.y - pad);
  const maxX = Math.max(box[0] + box[2], b.x + b.width + pad);
  const maxY = Math.max(box[1] + box[3], b.y + b.height + pad);
  svg.setAttribute("viewBox", `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
}

/**
 * Draws the 2D structure for one SMILES string as an SVG appended to `el`.
 * Rejects with the parser's error when the string is invalid.
 */
export async function renderSmiles(smiles: string, el: HTMLElement, opts: SmilesRenderOptions = {}): Promise<SVGSVGElement> {
  const SD = await load();
  const tree = parse(SD, smiles.trim());
  const color = cssVar(el, "--smiles-color") || textColor(el);
  const font = cssVar(el, "--smiles-font") || "Arial, Helvetica, sans-serif";
  const stroke = Number.parseFloat(cssVar(el, "--smiles-stroke")) || 1;
  const drawer = new SD.SvgDrawer({
    bondThickness: stroke,
    fontFamily: font,
    themes: { etude: { ...palette(el), FOREGROUND: color, BACKGROUND: "transparent", C: color, H: color } },
  });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  drawer.draw(tree, svg, "etude");
  fixScripts(svg);
  fitLabels(svg);
  // The viewBox is fitted to the molecule; sizing by it keeps bond lengths consistent across structures.
  const box = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
  const user = Number.parseFloat(cssVar(el, "--smiles-scale"));
  const scale = SCALE * (opts.inline ? 0.75 : 1) * (user > 0 ? user : 1);
  if (box.length === 4 && box[2] > 0) svg.style.width = `${Math.round(box[2] * scale)}px`;
  if (box.length === 4 && box[3] > 0) svg.style.height = `${Math.round(box[3] * scale)}px`;
  svg.style.maxWidth = "100%";
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", smiles.trim());
  el.appendChild(svg);
  return svg;
}

const INLINE = /^\s*smiles:\s*(\S.*)$/s;

/** The SMILES source of an inline `smiles:…` code span, or null. */
export function inlineSmiles(text: string): string | null {
  return INLINE.exec(text)?.[1]?.trim() ?? null;
}

/**
 * Renders SMILES wherever markdown left them under `root`: every `pre > code.language-smiles`
 * block (one structure per non-empty line) becomes a `figure.e-smiles`, and every inline code span
 * starting with `smiles:` becomes a `span.e-smiles-inline`. Invalid sources keep their code element.
 */
export async function renderSmilesBlocks(root: ParentNode): Promise<void> {
  const blocks = [...root.querySelectorAll<HTMLElement>("pre > code.language-smiles:not([data-smiles])")];
  const spans = [...root.querySelectorAll<HTMLElement>("code:not([data-smiles]):not([class*='language-'])")].filter((el) => !el.closest("pre") && inlineSmiles(el.textContent ?? "") !== null);
  if (!blocks.length && !spans.length) return;
  await load();
  for (const el of blocks) {
    el.dataset.smiles = "1";
    const fig = document.createElement("figure");
    fig.className = "e-smiles";
    const lines = (el.textContent ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    try {
      for (const line of lines) await renderSmiles(line, fig);
      el.parentElement?.replaceWith(fig);
    } catch (e) {
      el.title = e instanceof Error ? e.message : String(e);
      el.parentElement?.classList.add("e-smiles-error");
    }
  }
  for (const el of spans) {
    el.dataset.smiles = "1";
    const span = document.createElement("span");
    span.className = "e-smiles-inline";
    try {
      await renderSmiles(inlineSmiles(el.textContent ?? "") ?? "", span, { inline: true });
      el.replaceWith(span);
    } catch (e) {
      el.title = e instanceof Error ? e.message : String(e);
      el.classList.add("e-smiles-error");
    }
  }
}

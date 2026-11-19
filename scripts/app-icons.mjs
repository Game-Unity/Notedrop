// Source images for `npx capacitor-assets generate` (icons and splash screens for android/ and ios/).
// node scripts/app-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BG = "#000000";
const source = fileURLToPath(new URL("../assets/notedrop-icon.svg", import.meta.url));
const out = fileURLToPath(new URL("../assets/", import.meta.url));
mkdirSync(out, { recursive: true });
const png = (buf, name) => sharp(buf).png().toFile(join(out, name));
const icon = (name, size, background, padding) => sharp(source)
  .resize(Math.round(size * (1 - 2 * padding)), Math.round(size * (1 - 2 * padding)), { fit: "contain" })
  .extend({ top: Math.round(size * padding), bottom: Math.round(size * padding), left: Math.round(size * padding), right: Math.round(size * padding), background })
  .png()
  .toFile(join(out, name));
await icon("icon-only.png", 1024, BG, 0.08); // iOS and legacy Android icons: full square
await icon("icon-foreground.png", 1024, { r: 0, g: 0, b: 0, alpha: 0 }, 0.16); // Android adaptive: inside the 66% safe zone
await png(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BG}"/></svg>`), "icon-background.png");
await icon("splash.png", 2732, BG, 0.42);
await icon("splash-dark.png", 2732, BG, 0.42);
console.log("assets/ written");

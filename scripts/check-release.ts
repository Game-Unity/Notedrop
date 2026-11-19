import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseSemVer } from "../src/core/semver.ts";

const root = join(import.meta.dirname, "..");
const tag = process.argv[2];
const output = process.argv[3] ? resolve(process.argv[3]) : null;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = String(pkg.version);
if (!parseSemVer(version)) throw new Error(`package.json has invalid SemVer version ${JSON.stringify(version)}`);
if (tag && tag !== `v${version}`) throw new Error(`release tag ${tag} does not match package.json version v${version}`);
if (output) {
  if (!existsSync(output)) throw new Error(`release output directory does not exist: ${output}`);
  const files = readdirReleaseFiles(output);
  const metadata = files.filter((f) => /^latest.*\.yml$/.test(f));
  if (!metadata.length) throw new Error(`release output has no latest*.yml update metadata: ${output}`);
  for (const file of metadata) {
    const text = readFileSync(join(output, file), "utf8");
    if (!new RegExp(`^version:\\s*${version.replaceAll(".", "\\.")}\\s*$`, "m").test(text)) {
      throw new Error(`${file} does not describe version ${version}`);
    }
    if (/Zibhelina\/etude|Etude-(?:mac|windows|linux)/i.test(text)) {
      throw new Error(`${file} still references an Etude release artifact or repository`);
    }
    if (!/Notedrop-/.test(text)) throw new Error(`${file} does not reference a Notedrop artifact`);
  }
}
console.log(JSON.stringify({ version, tag: tag ?? null, output: output ?? null }));

function readdirReleaseFiles(dir: string): string[] {
  const names = readdirSync(dir);
  const unexpected = names.filter((name) => /Etude-(?:mac|windows|linux)/i.test(name));
  if (unexpected.length) throw new Error(`unexpected Etude release artifacts: ${unexpected.join(", ")}`);
  return names;
}

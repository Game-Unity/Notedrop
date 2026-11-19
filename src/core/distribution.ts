import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type UpdateDistribution = "development" | "github" | "microsoft-store";

export function parseUpdateDistribution(value: string | undefined): UpdateDistribution {
  if (value === undefined || value === "") return "development";
  if (value === "development" || value === "github" || value === "microsoft-store") return value;
  throw new Error(`NOTEDROP_DISTRIBUTION must be "development", "github", or "microsoft-store" (got "${value}").`);
}

/** Environment may select development builds; packaged apps use their immutable build marker. */
export function updateDistribution(
  root: string,
  env: Record<string, string | undefined> = process.env,
  packaged = false,
): UpdateDistribution {
  if (!packaged && env.NOTEDROP_DISTRIBUTION !== undefined) return parseUpdateDistribution(env.NOTEDROP_DISTRIBUTION);
  const manifest = join(root, "package.json");
  if (!existsSync(manifest)) return "development";
  const pkg = JSON.parse(readFileSync(manifest, "utf8"));
  return pkg.notedrop?.distribution ? parseUpdateDistribution(pkg.notedrop.distribution) : "development";
}

export const updatesManagedExternally = (distribution: UpdateDistribution) => distribution === "microsoft-store";

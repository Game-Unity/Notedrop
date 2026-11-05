import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { claimNoteDropProfile, profileEnvironment, type NoteDropProfile } from "../src/core/profile.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const profile = process.argv[2];
if (profile !== "dev" && profile !== "stable") throw new Error("Choose the NoteDrop profile: dev or stable.");

const env = profileEnvironment(profile, process.env, ROOT) as NodeJS.ProcessEnv;
claimNoteDropProfile(profile, env.ETUDE_HOME!);
const args =
  profile === "dev"
    ? ["--watch", "src/cli/main.ts", "serve", "--dev"]
    : ["src/cli/main.ts", "serve"];
const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => child.kill(signal));
}
child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});

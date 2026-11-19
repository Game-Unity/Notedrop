// The etude command: the app's own CLI on the PATH, for terminals, scripts and agents, always the
// same version as the app. The .deb, .rpm and AUR packages install it as /usr/bin/etude. Here the
// app installs it on a Mac (/usr/local/bin, after the admin password), on Windows (its folder on
// the user's PATH) and from the AppImage (~/.local/bin). An etude from anywhere else stays.
import { app } from "electron";
import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";

const BIN = join(import.meta.dirname, "bin");
const MARK = "etude-desktop launcher";
const appImageLauncher = () => join(homedir(), ".local", "bin", "etude");
const notedropAppImageLauncher = () => join(homedir(), ".local", "bin", "notedrop");

export interface CommandState {
  /** Where `etude` is found on the PATH, if anywhere. */
  path: string | null;
  /** That one is this app's. */
  ours: boolean;
  canInstall: boolean;
  /** One line on how it's installed here, or why the app doesn't. */
  note: string;
}

function onPath(env: Record<string, string | undefined>): string | null {
  const names = process.platform === "win32" ? ["notedrop.cmd", "notedrop.exe", "notedrop", "etude.cmd", "etude.exe", "etude"] : ["notedrop", "etude"];
  for (const dir of (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean)) {
    for (const name of names) if (existsSync(join(dir, name))) return join(dir, name);
  }
  return null;
}

function isOurs(path: string): boolean {
  try {
    if (process.platform === "win32") return dirname(path).toLowerCase() === BIN.toLowerCase();
    if ([join(BIN, "etude"), join(BIN, "notedrop")].some((p) => realpathSync(path) === realpathSync(p))) return true;
    return readFileSync(path, "utf8").includes(MARK);
  } catch {
    return false;
  }
}

export function commandState(env: Record<string, string | undefined>): CommandState {
  const path = onPath(env);
  const ours = !!path && isOurs(path);
  if (!app.isPackaged) return { path, ours, canInstall: false, note: "From a checkout, `npm link` puts etude on the PATH." };
  if (process.platform === "linux" && !process.env.APPIMAGE) return { path, ours, canInstall: false, note: "Installed with the app as /usr/bin/etude." };
  const note =
    process.platform === "darwin"
      ? "Installs /usr/local/bin/notedrop and /usr/local/bin/etude. macOS asks for your password once."
      : process.platform === "win32"
        ? "Adds Notedrop's command folder to your PATH. Terminals opened afterwards find it."
        : "Installs ~/.local/bin/notedrop and ~/.local/bin/etude. Most systems have that folder on the PATH.";
  return { path, ours, canInstall: !path || ours, note };
}

/** The AppImage's launcher: it runs the CLI from wherever the AppImage is mounted this time. */
function appImageScript(appImage: string, name: "etude" | "notedrop"): string {
  const q = `'${appImage.replaceAll("'", `'\\''`)}'`;
  const cliName = name === "notedrop" ? " NOTEDROP_CLI_NAME=notedrop" : "";
  return `#!/bin/sh\n# ${MARK}: the ${name} command from the Notedrop AppImage.\nNOTEDROP_PROFILE=stable${cliName} ELECTRON_RUN_AS_NODE=1 exec ${q} -e 'import(require("node:url").pathToFileURL(process.env.APPDIR + "/resources/app/bin/etude.js"))' ${name} "$@"\n`;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((done, fail) => execFile(cmd, args, (err, _out, stderr) => (err ? fail(new Error(String(stderr || err.message).trim())) : done())));
}

export async function installCommand(env: Record<string, string | undefined>): Promise<CommandState> {
  const before = commandState(env);
  if (!before.canInstall) return before;
  if (process.platform === "darwin") {
    if (/['"\\]/.test(BIN)) throw new Error("Move Notedrop to the Applications folder first.");
    const shell = `mkdir -p /usr/local/bin && ln -sf '${join(BIN, "etude")}' /usr/local/bin/etude && ln -sf '${join(BIN, "notedrop")}' /usr/local/bin/notedrop`;
    await run("osascript", ["-e", `do shell script "${shell}" with administrator privileges`]);
  } else if (process.platform === "win32") {
    const bin = BIN.replaceAll("'", "''");
    const add = `$p = [Environment]::GetEnvironmentVariable('Path', 'User'); $parts = @($p -split ';' | Where-Object { $_ }); if ($parts -notcontains '${bin}') { [Environment]::SetEnvironmentVariable('Path', (($parts + '${bin}') -join ';'), 'User') }`;
    await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", add]);
  } else if (process.env.APPIMAGE) {
    mkdirSync(dirname(appImageLauncher()), { recursive: true });
    writeFileSync(appImageLauncher(), appImageScript(process.env.APPIMAGE, "etude"));
    chmodSync(appImageLauncher(), 0o755);
    writeFileSync(notedropAppImageLauncher(), appImageScript(process.env.APPIMAGE, "notedrop"));
    chmodSync(notedropAppImageLauncher(), 0o755);
  }
  const after = commandState({ ...env, PATH: [env.PATH, process.platform === "win32" ? BIN : dirname(appImageLauncher()), "/usr/local/bin"].filter(Boolean).join(delimiter) });
  return { ...after, ours: true };
}

/** An AppImage that moved keeps its command working: the launcher follows it. */
export function refreshAppImageCommand() {
  const appImage = process.env.APPIMAGE;
  if (!appImage) return;
  for (const [path, name] of [[appImageLauncher(), "etude"], [notedropAppImageLauncher(), "notedrop"]] as const) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    if (text.includes(MARK) && text !== appImageScript(appImage, name)) writeFileSync(path, appImageScript(appImage, name));
  }
}

// Per-platform daemon lifecycle — launchd (macOS), systemd --user
// (Linux), Scheduled Task (Windows). Each `daemon{Start,Stop,Status}`
// returns a uniform DaemonResult so the CLI commands render output the
// same way regardless of OS.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { homedir, platform, userInfo } from "node:os";
import path from "node:path";
import { dataDir, logsDir } from "./config";
import { LAUNCHD_PLIST_TMPL, renderTemplate, SYSTEMD_SERVICE_TMPL, WINDOWS_TASK_XML_TMPL } from "./templates";

export type DaemonState = "running" | "stopped" | "not-installed";

export interface DaemonResult {
  state: DaemonState;
  platform: NodeJS.Platform;
  unitPath: string;
  summary: string;
  detail?: string;
}

const LAUNCHD_LABEL = "dev.pella.collector";
const SYSTEMD_UNIT = "pella.service";
const WINDOWS_TASK = "\\Pella\\Collector";

function resolveBinary(): string {
  // For a compiled binary, process.execPath IS the binary. For dev
  // (`bun src/bin.ts`), execPath is the bun runtime — fall back to a
  // PATH lookup and let the user override with PELLA_BIN.
  const exec = process.execPath;
  if (exec && !/bun(?:\.exe)?$/.test(exec)) return exec;
  if (process.env.PELLA_BIN) return process.env.PELLA_BIN;
  return "pella";
}

function run(cmd: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return {
    status: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

// ---------- macOS (launchd) ----------

function launchdUnitPath(): string {
  return path.join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
}

function launchdDomain(): string {
  return `gui/${userInfo().uid}`;
}

function launchdInstall(bin: string): string {
  const p = launchdUnitPath();
  const content = renderTemplate(LAUNCHD_PLIST_TMPL, { HOME: homedir(), BIN: bin });
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.mkdirSync(logsDir(), { recursive: true });
  fs.mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(p, content, { mode: 0o644 });
  return p;
}

function launchdIsRunning(): boolean {
  const r = run("launchctl", ["print", `${launchdDomain()}/${LAUNCHD_LABEL}`]);
  if (r.status !== 0) return false;
  return /state\s*=\s*running/i.test(r.stdout);
}

function launchdStart(): DaemonResult {
  const bin = resolveBinary();
  const unitPath = launchdInstall(bin);
  const boot = run("launchctl", ["bootstrap", launchdDomain(), unitPath]);
  // Re-bootstrapping an already-loaded unit surfaces as "already
  // loaded" OR as errno 5 ("Input/output error") on macOS 14+. Treat
  // both as benign — kickstart below forces a refresh.
  const bootOut = `${boot.stderr}\n${boot.stdout}`;
  const already =
    /already loaded/i.test(bootOut) ||
    /input\/output error/i.test(bootOut) ||
    /\b5:\s*Input\/output/i.test(bootOut);
  if (boot.status !== 0 && !already) {
    return {
      state: "stopped",
      platform: "darwin",
      unitPath,
      summary: `launchctl bootstrap failed: ${boot.stderr.trim() || boot.stdout.trim()}`,
      detail: boot.stderr,
    };
  }
  // Force a restart so a freshly-written plist (new binary path, new
  // template) actually takes effect. `-k` = kill existing and respawn.
  // Do NOT pass `-s` — that is launchctl's "start suspended (for
  // debugger attach)" flag, which leaves the process SIGSTOP'd at
  // _dyld_start forever. Prior versions used `-k -s` under the wrong
  // assumption that `-s` meant "synchronous".
  run("launchctl", ["kickstart", "-k", `${launchdDomain()}/${LAUNCHD_LABEL}`]);
  // Poll briefly — kickstart returns once launchd has accepted the
  // request, but `launchctl print` can still race the agent's
  // transition to state=running.
  let running = false;
  for (let i = 0; i < 10; i++) {
    running = launchdIsRunning();
    if (running) break;
    const until = Date.now() + 200;
    while (Date.now() < until) {}
  }
  return {
    state: running ? "running" : "stopped",
    platform: "darwin",
    unitPath,
    summary: running
      ? `pella started (launchd: ${LAUNCHD_LABEL})`
      : "launchd loaded the unit but the process isn't confirmed running — check `pella logs`.",
  };
}

function launchdStop(): DaemonResult {
  const unitPath = launchdUnitPath();
  if (!fs.existsSync(unitPath)) {
    return {
      state: "not-installed",
      platform: "darwin",
      unitPath,
      summary: "pella is not installed as a launchd agent",
    };
  }
  const r = run("launchctl", ["bootout", launchdDomain(), unitPath]);
  if (r.status !== 0 && !/not loaded/i.test(r.stderr + r.stdout)) {
    return {
      state: "running",
      platform: "darwin",
      unitPath,
      summary: `launchctl bootout failed: ${r.stderr.trim() || r.stdout.trim()}`,
    };
  }
  try {
    fs.rmSync(unitPath);
  } catch {}
  return { state: "stopped", platform: "darwin", unitPath, summary: "pella stopped" };
}

function launchdStatus(): DaemonResult {
  const unitPath = launchdUnitPath();
  if (!fs.existsSync(unitPath)) {
    return {
      state: "not-installed",
      platform: "darwin",
      unitPath,
      summary: "not installed (run `pella start`)",
    };
  }
  const r = run("launchctl", ["print", `${launchdDomain()}/${LAUNCHD_LABEL}`]);
  if (r.status !== 0) {
    return {
      state: "stopped",
      platform: "darwin",
      unitPath,
      summary: "unit file exists but not loaded — run `pella start`",
    };
  }
  const running = /state\s*=\s*running/i.test(r.stdout);
  return {
    state: running ? "running" : "stopped",
    platform: "darwin",
    unitPath,
    summary: running ? "running" : "loaded but not running",
    detail: r.stdout,
  };
}

// ---------- Linux (systemd --user) ----------

function systemdUnitPath(): string {
  return path.join(homedir(), ".config", "systemd", "user", SYSTEMD_UNIT);
}

function systemdInstall(bin: string): string {
  const p = systemdUnitPath();
  const content = renderTemplate(SYSTEMD_SERVICE_TMPL, { BIN: bin });
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(p, content, { mode: 0o644 });
  return p;
}

function systemdIsActive(): boolean {
  const r = run("systemctl", ["--user", "is-active", SYSTEMD_UNIT]);
  return r.stdout.trim() === "active";
}

function systemdStart(): DaemonResult {
  const bin = resolveBinary();
  const unitPath = systemdInstall(bin);
  const reload = run("systemctl", ["--user", "daemon-reload"]);
  if (reload.status !== 0) {
    return {
      state: "stopped",
      platform: "linux",
      unitPath,
      summary: `systemctl daemon-reload failed: ${reload.stderr.trim()}`,
    };
  }
  const enable = run("systemctl", ["--user", "enable", "--now", SYSTEMD_UNIT]);
  if (enable.status !== 0) {
    return {
      state: "stopped",
      platform: "linux",
      unitPath,
      summary: `systemctl enable --now failed: ${enable.stderr.trim() || enable.stdout.trim()}`,
    };
  }
  const running = systemdIsActive();
  let summary = running
    ? `pella started (systemd --user: ${SYSTEMD_UNIT})`
    : "unit enabled but not active — check `pella logs`";
  const linger = run("loginctl", ["show-user", userInfo().username, "-p", "Linger"]);
  if (linger.status === 0 && /Linger=no/i.test(linger.stdout)) {
    summary += " — note: run `loginctl enable-linger` for survive-logout";
  }
  return { state: running ? "running" : "stopped", platform: "linux", unitPath, summary };
}

function systemdStop(): DaemonResult {
  const unitPath = systemdUnitPath();
  if (!fs.existsSync(unitPath)) {
    return {
      state: "not-installed",
      platform: "linux",
      unitPath,
      summary: "pella is not installed as a systemd user unit",
    };
  }
  run("systemctl", ["--user", "disable", "--now", SYSTEMD_UNIT]);
  try {
    fs.rmSync(unitPath);
  } catch {}
  return { state: "stopped", platform: "linux", unitPath, summary: "pella stopped" };
}

function systemdStatus(): DaemonResult {
  const unitPath = systemdUnitPath();
  if (!fs.existsSync(unitPath)) {
    return {
      state: "not-installed",
      platform: "linux",
      unitPath,
      summary: "not installed (run `pella start`)",
    };
  }
  const r = run("systemctl", ["--user", "show", SYSTEMD_UNIT, "--no-page"]);
  const active = systemdIsActive();
  return {
    state: active ? "running" : "stopped",
    platform: "linux",
    unitPath,
    summary: active ? "running" : "installed but not active",
    detail: r.stdout,
  };
}

// ---------- Windows (Scheduled Task) ----------

function windowsTaskXmlPath(): string {
  return path.join(dataDir(), "pella-task.xml");
}

function windowsInstall(bin: string): string {
  const p = windowsTaskXmlPath();
  const user = userInfo().username;
  const content = renderTemplate(WINDOWS_TASK_XML_TMPL, { USER: user, BIN: bin });
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.mkdirSync(logsDir(), { recursive: true });
  // schtasks /Create /XML requires UTF-16 LE on disk.
  fs.writeFileSync(p, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(content, "utf16le")]));
  run("schtasks", ["/Create", "/TN", WINDOWS_TASK, "/XML", p, "/F"]);
  return p;
}

function windowsIsRunning(): boolean {
  const r = run("schtasks", ["/Query", "/TN", WINDOWS_TASK, "/FO", "CSV", "/NH"]);
  if (r.status !== 0) return false;
  return /"Running"/i.test(r.stdout);
}

function windowsStart(): DaemonResult {
  const bin = resolveBinary();
  const unitPath = windowsInstall(bin);
  const r = run("schtasks", ["/Run", "/TN", WINDOWS_TASK]);
  if (r.status !== 0) {
    return {
      state: "stopped",
      platform: "win32",
      unitPath,
      summary: `schtasks /Run failed: ${r.stderr.trim() || r.stdout.trim()}`,
    };
  }
  const running = windowsIsRunning();
  return {
    state: running ? "running" : "stopped",
    platform: "win32",
    unitPath,
    summary: running
      ? `pella started (Scheduled Task: ${WINDOWS_TASK})`
      : "Scheduled Task created but not confirmed running — check `pella status`",
  };
}

function windowsStop(): DaemonResult {
  const unitPath = windowsTaskXmlPath();
  run("schtasks", ["/End", "/TN", WINDOWS_TASK]);
  run("schtasks", ["/Delete", "/TN", WINDOWS_TASK, "/F"]);
  return { state: "stopped", platform: "win32", unitPath, summary: "pella stopped" };
}

function windowsStatus(): DaemonResult {
  const unitPath = windowsTaskXmlPath();
  const q = run("schtasks", ["/Query", "/TN", WINDOWS_TASK, "/FO", "CSV", "/NH"]);
  if (q.status !== 0) {
    return {
      state: "not-installed",
      platform: "win32",
      unitPath,
      summary: "not installed (run `pella start`)",
    };
  }
  const running = /"Running"/i.test(q.stdout);
  return {
    state: running ? "running" : "stopped",
    platform: "win32",
    unitPath,
    summary: running ? "running" : "installed but not running",
    detail: q.stdout,
  };
}

// ---------- dispatch ----------

export function daemonStart(): DaemonResult {
  switch (platform()) {
    case "darwin":
      return launchdStart();
    case "linux":
      return systemdStart();
    case "win32":
      return windowsStart();
    default:
      return unsupported();
  }
}

export function daemonStop(): DaemonResult {
  switch (platform()) {
    case "darwin":
      return launchdStop();
    case "linux":
      return systemdStop();
    case "win32":
      return windowsStop();
    default:
      return unsupported();
  }
}

export function daemonStatus(): DaemonResult {
  switch (platform()) {
    case "darwin":
      return launchdStatus();
    case "linux":
      return systemdStatus();
    case "win32":
      return windowsStatus();
    default:
      return unsupported();
  }
}

function unsupported(): DaemonResult {
  return {
    state: "not-installed",
    platform: platform(),
    unitPath: "",
    summary: `unsupported platform: ${platform()}`,
  };
}

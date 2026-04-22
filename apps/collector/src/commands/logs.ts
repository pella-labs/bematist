import { spawn } from "node:child_process";
import fs from "node:fs";
import { platform } from "node:os";
import path from "node:path";
import { logsDir } from "../config";

/**
 * Tail the collector's stdout/stderr.
 *
 * macOS + Windows: launchd / schtasks write to files under
 * ~/.pella/logs/ — `tail -F` both (or `Get-Content -Wait` on Windows).
 * Linux: systemd --user → the journal; `journalctl --user -u
 * pella.service -f` is authoritative.
 */
export async function runLogs(): Promise<void> {
  if (platform() === "linux") {
    const p = spawn("journalctl", ["--user", "-u", "pella.service", "-f", "-n", "200"], {
      stdio: "inherit",
    });
    p.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  const dir = logsDir();
  const out = path.join(dir, "out.log");
  const err = path.join(dir, "err.log");
  if (!fs.existsSync(out) && !fs.existsSync(err)) {
    console.error(`pella logs: no log files in ${dir}. Is the service running?`);
    process.exit(1);
  }
  const files = [out, err].filter((p) => fs.existsSync(p));

  if (platform() === "win32") {
    // Interleaving PowerShell Get-Content -Wait streams across two
    // files is awkward; just follow the primary stdout log. The error
    // log is still inspectable statically via `Get-Content`.
    const p = spawn("powershell", ["-NoProfile", "-Command", `Get-Content -Path '${files[0]}' -Wait -Tail 200`], {
      stdio: "inherit",
    });
    p.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  const p = spawn("tail", ["-F", "-n", "200", ...files], { stdio: "inherit" });
  p.on("exit", (code) => process.exit(code ?? 0));
}

import fs from "node:fs";
import { configEnvPath, loadConfig } from "../config";
import { daemonStatus } from "../daemon";

export async function runStatus(): Promise<void> {
  const ds = daemonStatus();
  console.log(`pella: ${ds.summary}`);
  if (ds.unitPath) console.log(`pella: unit → ${ds.unitPath}`);
  const cfgPath = configEnvPath();
  if (fs.existsSync(cfgPath)) {
    const cfg = loadConfig();
    console.log(`pella: config → ${cfgPath}`);
    console.log(`pella: endpoint → ${cfg.url}`);
    console.log(`pella: poll interval → ${cfg.pollIntervalMs}ms`);
    console.log(`pella: token → ${cfg.token ? `${cfg.token.slice(0, 6)}…` : "(missing)"}`);
  } else {
    console.log("pella: no config.env (run `pella login --token pm_…`).");
  }
  process.exit(ds.state === "running" ? 0 : 1);
}

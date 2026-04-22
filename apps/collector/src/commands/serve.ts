import { loadConfig } from "../config";
import { startServeLoop } from "../serve";

export async function runServe(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.token) {
    console.error("pella serve: no PELLA_TOKEN in ~/.pella/config.env or environment.");
    console.error("pella serve: run `pella login --token pm_…` first.");
    process.exit(1);
  }

  const handle = startServeLoop(cfg);
  // The service manager owns the process lifecycle — we stay in the
  // foreground and shut down cleanly on SIGINT/SIGTERM.
  const shutdown = async (signal: string) => {
    console.log(`pella serve: received ${signal}, shutting down`);
    await handle.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  await handle.done;
}

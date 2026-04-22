import { runOnce } from "./commands/runOnce";
import { runLogin } from "./commands/login";
import { runLogout } from "./commands/logout";
import { runLogs } from "./commands/logs";
import { runServe } from "./commands/serve";
import { runStart } from "./commands/start";
import { runStatus } from "./commands/status";
import { runStop } from "./commands/stop";
import { COLLECTOR_VERSION, DEFAULT_URL, loadConfig } from "./config";

export async function main(argv: string[]): Promise<void> {
  const [cmd, ...args] = argv;

  switch (cmd) {
    case "login":
      return runLogin(args);
    case "logout":
      return runLogout();
    case "start":
      return runStart();
    case "stop":
      return runStop();
    case "status":
      return runStatus();
    case "logs":
      return runLogs();
    case "serve":
      return runServe();
    case "run-once":
      return runOnceCli(args);
    case "--version":
    case "-v":
    case "version":
      console.log(`pella ${COLLECTOR_VERSION}`);
      return;
    case undefined:
    case "help":
    case "-h":
    case "--help":
      printHelp();
      return;
    default:
      console.error(`pella: unknown command: ${cmd}`);
      printHelp();
      process.exit(2);
  }
}

async function runOnceCli(args: string[]): Promise<void> {
  // Inherit token/url from ~/.pella/config.env by default; allow
  // overriding via flags so developers can point a one-shot run at a
  // staging backend without editing their config.
  const cfg = loadConfig();
  let token = cfg.token;
  let url = cfg.url;
  let since = cfg.since;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--token") token = args[++i] ?? token;
    else if (a?.startsWith("--token=")) token = a.slice("--token=".length);
    else if (a === "--url") url = (args[++i] ?? url).replace(/\/$/, "");
    else if (a?.startsWith("--url=")) url = a.slice("--url=".length).replace(/\/$/, "");
    else if (a === "--since") since = new Date(args[++i] ?? "");
    else if (a?.startsWith("--since=")) since = new Date(a.slice("--since=".length));
  }
  if (!token) {
    console.error("pella run-once: no token (run `pella login --token pm_…` or pass --token).");
    process.exit(1);
  }
  await runOnce({ url, token, since });
}

function printHelp() {
  console.log(`pella ${COLLECTOR_VERSION} — AI-coding metrics collector

Commands:
  login --token pm_xxx   Save API token and start the background service
  logout                 Stop the service and remove saved config
  start                  Install + start the OS service (launchd / systemd / schtasks)
  stop                   Stop the OS service
  status                 Show service state + config
  logs                   Tail the service's stdout/stderr (or journalctl on Linux)
  serve                  Run the collector loop in the foreground (what the service invokes)
  run-once               Backfill + upload once, then exit (legacy one-shot behavior)
  --version              Print version

Config:
  ~/.pella/config.env    KEY=VALUE file with PELLA_TOKEN and PELLA_URL (default ${DEFAULT_URL})

Env overrides:
  PELLA_TOKEN            bearer token (required)
  PELLA_URL              ingest endpoint
  PELLA_POLL_INTERVAL_MS daemon poll cadence (default 10000)
  PELLA_SINCE            ISO date; ignore events before this
`);
}

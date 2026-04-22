import { daemonStop } from "../daemon";

export async function runStop(): Promise<void> {
  const res = daemonStop();
  console.log(`pella: ${res.summary}`);
  process.exit(res.state === "stopped" || res.state === "not-installed" ? 0 : 1);
}

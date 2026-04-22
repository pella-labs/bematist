import { daemonStart } from "../daemon";

export async function runStart(): Promise<void> {
  const res = daemonStart();
  console.log(`pella: ${res.summary}`);
  if (res.unitPath) console.log(`pella: unit → ${res.unitPath}`);
  if (res.state === "running") {
    console.log("pella: tail with `pella logs` or check `pella status`.");
  }
  process.exit(res.state === "running" ? 0 : 1);
}

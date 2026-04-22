import { configEnvPath, deleteConfig } from "../config";
import { daemonStop } from "../daemon";

export async function runLogout(): Promise<void> {
  const stop = daemonStop();
  console.log(`pella: ${stop.summary}`);
  const removed = deleteConfig();
  if (removed) {
    console.log(`pella: removed ${configEnvPath()}`);
  } else {
    console.log("pella: no config.env to remove.");
  }
}

/** Production-style start: SMART agents + `next start`. Set SMART_AUTO_START_AGENTS=false to skip agents. */
import { spawn } from "child_process";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { spawnNext } from "./ensure-next.mjs";
import { ensureSmartAgentsRunning, stopSmartAgents } from "./smart-agents.mjs";

const portalRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentChildren = await ensureSmartAgentsRunning();
const shutdownAgents = () => stopSmartAgents(agentChildren);
process.on("exit", shutdownAgents);
process.on("SIGINT", () => {
  shutdownAgents();
  process.exit(130);
});

const child = spawnNext("start", process.argv.slice(2));
child.on("exit", (code) => {
  shutdownAgents();
  process.exit(code ?? 0);
});

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

const root = path.resolve(__dirname, "..");
const rootForMatch = root.replaceAll("\\", "/").toLowerCase();
const ports = [8081, 47329];

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 15000,
    windowsHide: true,
    ...options,
  });
}

function parseJson(result, label) {
  if (result.error) throw new Error(`Could not inspect ${label}: ${result.error.message}`);
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || "").trim();
    throw new Error(details || `Could not inspect ${label}.`);
  }
  try {
    return JSON.parse(result.stdout || "{}");
  } catch {
    throw new Error(`Could not read ${label} information.`);
  }
}

function asArray(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function windowsSnapshot() {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "$ports = @(8081, 47329)",
    "$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort } | ForEach-Object { [pscustomobject]@{ pid = [int]$_.OwningProcess; port = [int]$_.LocalPort } })",
    "$processes = @(Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = $_.Name; commandLine = $_.CommandLine } })",
    "[pscustomobject]@{ listeners = $listeners; processes = $processes } | ConvertTo-Json -Depth 4 -Compress",
  ].join("; ");
  const result = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command]);
  const snapshot = parseJson(result, "development processes");
  return {
    listeners: asArray(snapshot.listeners),
    processes: asArray(snapshot.processes),
  };
}

function unixSnapshot() {
  const listeners = [];
  for (const port of ports) {
    const result = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    if (result.error) {
      throw new Error("The dev:stop command requires lsof to inspect listening ports.");
    }
    if (result.status !== 0 && (result.stdout.trim() || result.stderr.trim())) {
      throw new Error((result.stderr || result.stdout).trim() || "Could not inspect listening ports.");
    }
    for (const pid of result.stdout.split(/\s+/).filter(Boolean).map(Number)) {
      listeners.push({ pid, port });
    }
  }

  const result = run("ps", ["-eo", "pid=,ppid=,comm=,args="]);
  if (result.error || result.status !== 0) {
    throw new Error((result.stderr || "Could not inspect development processes.").trim());
  }
  const processes = result.stdout.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    return match
      ? [{ pid: Number(match[1]), ppid: Number(match[2]), name: match[3], commandLine: match[4] }]
      : [];
  });
  return { listeners, processes };
}

function normalize(value) {
  return String(value ?? "").replaceAll("\\", "/").toLowerCase();
}

function belongsToProject(processInfo) {
  return normalize(processInfo.commandLine).includes(rootForMatch);
}

function devMode(processInfo) {
  const commandLine = normalize(processInfo.commandLine);
  const match = commandLine.match(/(?:^|[\s"'/])scripts\/dev\.js[\s"']+(local|cloud|worker)(?:[\s"']|$)/);
  return match?.[1] ?? null;
}

function traceListener(listener, processesById) {
  const chain = [];
  const visited = new Set();
  let current = processesById.get(Number(listener.pid));
  while (current && !visited.has(Number(current.pid))) {
    const pid = Number(current.pid);
    visited.add(pid);
    chain.push(current);
    current = processesById.get(Number(current.ppid));
  }

  const supervisor = chain.find((item) => devMode(item));
  if (supervisor && chain.some(belongsToProject)) {
    return { targetPid: Number(supervisor.pid), mode: devMode(supervisor), process: chain[0] };
  }

  // A crash can leave a project-owned listener behind after its supervisor exits.
  const projectProcess = chain.filter(belongsToProject).at(-1);
  if (projectProcess) {
    return { targetPid: Number(projectProcess.pid), mode: null, process: chain[0] };
  }
  return { targetPid: null, mode: null, process: chain[0] ?? null };
}

function stopWindows(pid) {
  const result = run("taskkill.exe", ["/PID", String(pid), "/T", "/F"]);
  if (result.error) throw new Error(`Could not stop process ${pid}: ${result.error.message}`);
  if (result.status !== 0 && !/not found|no running instance/i.test(`${result.stdout}\n${result.stderr}`)) {
    throw new Error((result.stderr || result.stdout || `Could not stop process ${pid}.`).trim());
  }
}

async function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

async function waitForExit(pid, milliseconds) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (!(await processExists(pid))) return true;
    await delay(100);
  }
  return !(await processExists(pid));
}

async function stopUnix(pid) {
  try {
    process.kill(pid, "SIGINT");
  } catch (error) {
    if (error.code === "ESRCH") return;
    throw error;
  }
  if (await waitForExit(pid, 5000)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (error.code === "ESRCH") return;
    throw error;
  }
  if (await waitForExit(pid, 2000)) return;
  process.kill(pid, "SIGKILL");
}

async function main() {
  const snapshot = process.platform === "win32" ? windowsSnapshot() : unixSnapshot();
  const processesById = new Map(snapshot.processes.map((item) => [Number(item.pid), item]));
  const targets = new Map();
  const unmanaged = [];

  for (const listener of snapshot.listeners) {
    const traced = traceListener(listener, processesById);
    if (traced.targetPid) targets.set(traced.targetPid, traced);
    else unmanaged.push({ listener, process: traced.process });
  }

  for (const { listener, process: owner } of unmanaged) {
    console.warn(
      `Port ${listener.port} is used by ${owner?.name ?? "an unknown process"} (process ${listener.pid}); leaving it running because it is not owned by this project.`,
    );
  }

  if (!targets.size) {
    if (!unmanaged.length) console.log("No InfiniteCanvas development service is listening on ports 8081 or 47329.");
    return;
  }

  for (const [pid, target] of targets) {
    const description = target.mode ? `${target.mode} development server` : "stale project process";
    console.log(`Stopping the ${description} (process ${pid})...`);
    if (process.platform === "win32") stopWindows(pid);
    else await stopUnix(pid);
  }
  console.log("InfiniteCanvas development services stopped.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Could not stop the development services.");
  process.exitCode = 1;
});

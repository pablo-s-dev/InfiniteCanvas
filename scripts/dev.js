const { spawn, spawnSync } = require("node:child_process");
const { createConnection } = require("node:net");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { parseEnv } = require("node:util");
const {
  EXPO_PORT,
  LOCAL_WORKER_PORT,
  LOCAL_WORKER_URL,
  parseInvocation,
  validateCloudEnvironment,
} = require("./dev-config");

const root = path.resolve(__dirname, "..");
const expoCli = path.join(root, "node_modules", "expo", "bin", "cli");
const wranglerCli = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const cloudEnvPath = path.join(root, ".env.cloud");
const appConfig = require(path.join(root, "app.json"));
const androidPackage = appConfig.expo.android.package;

function readCloudEnvironment() {
  let fileContents;
  try {
    fileContents = readFileSync(cloudEnvPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Create .env.cloud in the project root before running dev:cloud.");
    }
    throw new Error("Could not read .env.cloud.");
  }

  let environment;
  try {
    environment = parseEnv(fileContents);
  } catch {
    throw new Error("Could not parse .env.cloud.");
  }
  return validateCloudEnvironment(environment);
}

function getAndroidTool(environment) {
  const sdkRoot = environment.ANDROID_HOME || environment.ANDROID_SDK_ROOT;
  if (sdkRoot) {
    const candidate = path.join(
      sdkRoot,
      "platform-tools",
      process.platform === "win32" ? "adb.exe" : "adb",
    );
    if (existsSync(candidate)) return candidate;
  }
  return process.platform === "win32" ? "adb.exe" : "adb";
}

function runCaptured(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 15000,
    windowsHide: true,
    ...options,
  });
  return result;
}

function listAndroidDevices(adb) {
  const result = runCaptured(adb, ["devices"]);
  if (result.error || result.status !== 0) return [];

  return result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === "device")
    .map((parts) => parts[0]);
}

function chooseAndroidSerial(devices, environment, required) {
  const requested = environment.ANDROID_SERIAL;
  const selected = requested ? devices.filter((serial) => serial === requested) : devices;

  if (selected.length !== 1) {
    if (!required && !requested && selected.length === 0) return null;
    throw new Error(
      requested
        ? "The Android device selected by ANDROID_SERIAL is not connected."
        : selected.length === 0
          ? "Connect one Android device or emulator before starting the Android target."
          : "More than one Android device is connected. Set ANDROID_SERIAL to choose one.",
    );
  }
  return selected[0];
}

function ensureDebugAndroidInstall(adb, serial) {
  const result = runCaptured(adb, ["-s", serial, "shell", "run-as", androidPackage, "id"]);
  if (result.error || result.status !== 0) {
    throw new Error(
      "No debuggable InfiniteCanvas app is installed. Run npm run dev:local -- android build (or npm run dev:cloud -- android build) first.",
    );
  }
}

function assertPortAvailable(port, label) {
  const canConnect = (host, family) => new Promise((resolve, reject) => {
    const socket = createConnection({ host, port, family });
    socket.setTimeout(300);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`Could not check whether ${label} port ${port} is available.`));
    });
    socket.once("error", (error) => {
      socket.destroy();
      if (["ECONNREFUSED", "ECONNRESET"].includes(error.code)) resolve(false);
      else if (
        family === 6 &&
        ["EAFNOSUPPORT", "EADDRNOTAVAIL", "ENETUNREACH"].includes(error.code)
      ) resolve(false);
      else reject(new Error(`Could not check whether ${label} port ${port} is available.`));
    });
  });

  return Promise.all([canConnect("127.0.0.1", 4), canConnect("::1", 6)]).then((results) => {
    if (results.some(Boolean)) {
      throw new Error(`${label} port ${port} is already in use; stop that service and retry.`);
    }
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForHttp(url, supervisor, label) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (supervisor.stopping) throw new Error(`${label} stopped before it became ready.`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return;
    } catch {
      // The process may need a few seconds to bind and initialize.
    }
    await delay(300);
  }
  throw new Error(`${label} did not become ready within 60 seconds.`);
}

function terminateTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    const pid = child.pid;
    setTimeout(() => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // The child process tree has already exited.
        }
      }
    }, 3000).unref();
  }
}

class ProcessSupervisor {
  constructor() {
    this.children = new Map();
    this.stopping = false;
    this.exitCode = 0;
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
    this.onInterrupt = () => this.stop(130);
    this.onTerminate = () => this.stop(143);
  }

  start(label, command, args, environment) {
    const child = spawn(command, args, {
      cwd: root,
      env: environment,
      stdio: "inherit",
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    this.children.set(child, label);
    child.once("error", () => {
      console.error(`Could not start ${label}. Check that project dependencies are installed.`);
      this.stop(1);
    });
    child.once("close", (code) => {
      this.children.delete(child);
      if (!this.stopping) this.stop(code === 0 ? 0 : 1);
      this.finishIfStopped();
    });
    return child;
  }

  stop(code = 0) {
    if (this.stopping) {
      if (code !== 0) this.exitCode = code;
      return;
    }
    this.stopping = true;
    this.exitCode = code;
    for (const child of this.children.keys()) terminateTree(child);
    this.finishIfStopped();
  }

  finishIfStopped() {
    if (this.stopping && this.children.size === 0) {
      process.removeListener("SIGINT", this.onInterrupt);
      process.removeListener("SIGTERM", this.onTerminate);
      this.resolveDone(this.exitCode);
    }
  }

  listenForInterrupts() {
    process.once("SIGINT", this.onInterrupt);
    process.once("SIGTERM", this.onTerminate);
  }
}

function forwardAndroidPorts(adb, serial, localWorker) {
  const ports = [EXPO_PORT, ...(localWorker ? [LOCAL_WORKER_PORT] : [])];
  for (const port of ports) {
    const result = runCaptured(adb, ["-s", serial, "reverse", `tcp:${port}`, `tcp:${port}`]);
    if (result.error || result.status !== 0) {
      throw new Error("Could not connect the Android device to the local development server.");
    }
  }
}

function connectAndroid(adb, serial, localWorker) {
  forwardAndroidPorts(adb, serial, localWorker);

  const launch = runCaptured(adb, [
    "-s",
    serial,
    "shell",
    "monkey",
    "-p",
    androidPackage,
    "-c",
    "android.intent.category.LAUNCHER",
    "1",
  ]);
  if (launch.error || launch.status !== 0) {
    throw new Error("Could not open the installed InfiniteCanvas development app.");
  }
}

function workerArguments() {
  return [
    "dev",
    "--local",
    "--port",
    String(LOCAL_WORKER_PORT),
    "--var",
    "LOCAL_DEV_MODE:true",
    "--var",
    "ALLOWED_WEB_ORIGINS:http://localhost:8081,http://127.0.0.1:8081",
  ];
}

function openWorkerInWindowsTerminal(environment) {
  if (process.platform !== "win32" || !environment.WT_SESSION) return null;

  const windowsTerminal = environment.LOCALAPPDATA
    ? path.join(environment.LOCALAPPDATA, "Microsoft", "WindowsApps", "wt.exe")
    : "wt.exe";
  const workerScript = path.join(__dirname, "dev.js");

  return new Promise((resolve, reject) => {
    const terminal = spawn(windowsTerminal, [
      "--window",
      "0",
      "new-tab",
      "--title",
      "InfiniteCanvas Backend",
      "--suppressApplicationTitle",
      "--startingDirectory",
      root,
      process.execPath,
      workerScript,
      "worker",
    ], {
      cwd: root,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    terminal.stdout.on("data", (chunk) => { output += chunk; });
    terminal.stderr.on("data", (chunk) => { output += chunk; });

    terminal.once("error", (error) => {
      reject(new Error(`Could not open the local Worker in a Windows Terminal tab: ${error.message}`));
    });
    terminal.once("close", (code) => {
      if (code === 0) resolve(true);
      else {
        const detail = output.trim();
        reject(new Error(
          detail
            ? `Windows Terminal could not open the local Worker tab: ${detail}`
            : `Windows Terminal could not open the local Worker tab (exit code ${code ?? "unknown"}).`,
        ));
      }
    });
  });
}

function expoArguments(invocation, androidSerial) {
  if (invocation.build) {
    const args = [`run:${invocation.platform}`, "--port", String(EXPO_PORT)];
    if (invocation.platform === "android" && androidSerial) args.push("--device", androidSerial);
    return args;
  }
  const args = ["start", "--port", String(EXPO_PORT), "--host", "localhost"];
  if (invocation.platform === "web") args.push("--web");
  if (invocation.platform === "ios") args.push("--ios");
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const [mode, ...args] = argv;
  const invocation = parseInvocation(mode, args);
  if (invocation.platform === "ios" && process.platform !== "darwin") {
    throw new Error("The iOS target requires macOS and Xcode.");
  }

  if (!existsSync(expoCli)) throw new Error("Expo is not installed. Run npm install first.");
  if (invocation.mode !== "cloud" && !existsSync(wranglerCli)) {
    throw new Error("Wrangler is not installed. Run npm install first.");
  }

  const environment = { ...process.env };
  if (invocation.mode === "cloud") {
    const cloudEnvironment = readCloudEnvironment();
    Object.assign(environment, cloudEnvironment);
    environment.INFINITE_CANVAS_API_PROXY_TARGET = cloudEnvironment.EXPO_PUBLIC_CLOUD_SYNC_API_URL;
  } else {
    environment.EXPO_PUBLIC_CLOUD_SYNC_API_URL = LOCAL_WORKER_URL;
    environment.INFINITE_CANVAS_API_PROXY_TARGET = LOCAL_WORKER_URL;
  }

  const localWorker = invocation.mode === "local" || invocation.mode === "worker";
  const adb = invocation.platform === "android" || !invocation.platform
    ? getAndroidTool(environment)
    : null;
  let androidSerial = null;
  let interactiveAndroidSerials = [];
  if (adb && invocation.platform === "android") {
    androidSerial = chooseAndroidSerial(listAndroidDevices(adb), environment, true);
    if (!invocation.build) ensureDebugAndroidInstall(adb, androidSerial);
  } else if (adb) {
    interactiveAndroidSerials = listAndroidDevices(adb);
    if (environment.ANDROID_SERIAL) {
      interactiveAndroidSerials = interactiveAndroidSerials.filter(
        (serial) => serial === environment.ANDROID_SERIAL,
      );
    }
  }

  const expoNeeded = invocation.mode !== "worker";
  if (localWorker) await assertPortAvailable(LOCAL_WORKER_PORT, "Worker");
  if (expoNeeded) await assertPortAvailable(EXPO_PORT, "Expo");

  const supervisor = new ProcessSupervisor();
  supervisor.listenForInterrupts();
  try {
    if (localWorker) {
      const workerTab = invocation.mode === "local"
        ? await openWorkerInWindowsTerminal(environment)
        : null;
      if (!workerTab) {
        supervisor.start("the local Worker", process.execPath, [wranglerCli, ...workerArguments()], environment);
      }
      await waitForHttp(`${LOCAL_WORKER_URL}/health`, supervisor, "The local Worker");
      console.log(
        workerTab
          ? `Local Worker is ready on port ${LOCAL_WORKER_PORT} in the new Windows Terminal tab.`
          : `Local Worker is ready on port ${LOCAL_WORKER_PORT}.`,
      );
    }

    if (expoNeeded) {
      if (androidSerial && invocation.build) {
        forwardAndroidPorts(adb, androidSerial, invocation.mode === "local");
      } else if (!invocation.platform) {
        for (const serial of interactiveAndroidSerials) {
          forwardAndroidPorts(adb, serial, invocation.mode === "local");
        }
      }

      supervisor.start(
        "Expo",
        process.execPath,
        [expoCli, ...expoArguments(invocation, androidSerial)],
        environment,
      );
      if (androidSerial && !invocation.build) {
        await waitForHttp(`http://localhost:${EXPO_PORT}/status`, supervisor, "Expo");
        connectAndroid(adb, androidSerial, invocation.mode === "local");
        console.log("Android is connected to the current development server.");
      }
    }
  } catch (error) {
    supervisor.stop(1);
    await supervisor.done;
    throw error;
  }

  return supervisor.done;
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "Development startup failed.");
      process.exitCode = 1;
    });
}

module.exports = {
  assertPortAvailable,
  main,
  readCloudEnvironment,
};

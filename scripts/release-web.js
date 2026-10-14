const { spawn } = require("node:child_process");
const { resolve } = require("node:path");
const { readReleaseEnvironment } = require("./release-config");

const root = resolve(__dirname, "..");
try {
  const environment = readReleaseEnvironment(process.argv[2]);
  const child = spawn(process.execPath, [resolve(root, "node_modules/expo/bin/cli"), "export", "--platform", "web", "--output-dir", "dist"], {
    cwd: root,
    env: { ...process.env, ...environment, NODE_ENV: "production" },
    stdio: "inherit",
    windowsHide: true,
  });
  child.on("error", () => { console.error("Could not start the web release build."); process.exitCode = 1; });
  child.on("close", code => { process.exitCode = code ?? 1; });
} catch (error) { console.error(error.message); process.exitCode = 1; }

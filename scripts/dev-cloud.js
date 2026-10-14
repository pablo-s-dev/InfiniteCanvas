// Keep the earlier direct entry point working while package scripts use dev.js.
const { main } = require("./dev");

main(["cloud", ...process.argv.slice(2)])
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Cloud development startup failed.");
    process.exitCode = 1;
  });

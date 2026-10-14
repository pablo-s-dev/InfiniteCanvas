const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateReleaseEnvironment } = require("./release-config");
const valid = {
  EXPO_PUBLIC_CLOUD_SYNC_API_URL: "https://canvas.example",
  EXPO_PUBLIC_GOOGLE_CLIENT_ID: "123456-example.apps.googleusercontent.com",
  EXPO_PUBLIC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER: "123456789012",
};
test("a release accepts complete public remote configuration", () => {
  assert.deepEqual(validateReleaseEnvironment(valid), valid);
});
test("a release cannot silently ship without its verifier or Integrity project", () => {
  for (const key of Object.keys(valid)) assert.throws(() => validateReleaseEnvironment({ ...valid, [key]: "" }));
});
test("a release rejects local endpoints and URL credentials", () => {
  for (const url of ["http://canvas.example", "https://localhost", "https://127.0.0.1:47329", "https://[::1]", "https://192.168.0.4", "https://user:password@canvas.example"]) {
    assert.throws(() => validateReleaseEnvironment({ ...valid, EXPO_PUBLIC_CLOUD_SYNC_API_URL: url }));
  }
});
test("a release configuration cannot include backend credentials", () => {
  assert.throws(() => validateReleaseEnvironment({ ...valid, GOOGLE_OAUTH_CLIENT_SECRET: "secret" }));
});

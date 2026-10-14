import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}", "worker/src/**/*.test.ts", "scripts/**/*.test.{js,mjs}"],
    maxWorkers: 2,
  },
});

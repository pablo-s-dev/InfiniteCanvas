import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import dev from "./dev.js";

const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("development server port checks", () => {
  it("detects a port already bound on IPv6 loopback", async () => {
    const server = createServer();
    servers.push(server);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "::1", resolve);
    });

    const { port } = server.address();
    await expect(dev.assertPortAvailable(port, "Expo")).rejects.toThrow(
      `Expo port ${port} is already in use`,
    );
  });
});

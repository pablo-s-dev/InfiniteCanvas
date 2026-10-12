import { afterEach, describe, expect, it, vi } from "vitest";
import { updateDriveDocument, deleteDriveFile } from "./googleDrive";
afterEach(() => vi.unstubAllGlobals());
describe("conditional Drive writes", () => {
  it("rejects a stale base before sending any content", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({etag: '"version-2"', headRevisionId: "revision-2"}));
    vi.stubGlobal("fetch", fetch);
    await expect(updateDriveDocument("test-token", "drive-file", "{}", "revision-1")).rejects.toMatchObject({code: "drawing_conflict"});
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("sends If-Match and surfaces a write racing a manual edit", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({etag: '"version-1"', headRevisionId: "revision-1"}))
      .mockResolvedValueOnce(new Response("changed", {status: 412}));
    vi.stubGlobal("fetch", fetch);
    await expect(updateDriveDocument("test-token", "drive-file", "{}", "revision-1")).rejects.toMatchObject({code: "drawing_conflict"});
    expect(fetch.mock.calls[1][1].headers["If-Match"]).toBe('"version-1"');
    expect(fetch.mock.calls[1][1].method).toBe("PUT");
  });
  it("fails closed when Drive does not supply a strong ETag", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({headRevisionId: "revision-1"})));
    await expect(updateDriveDocument("test-token", "drive-file", "{}", "revision-1")).rejects.toMatchObject({code: "drive_precondition_unavailable"});
  });
  it("applies the same precondition to deleting a drawing", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({etag: '"version-1"', headRevisionId: "revision-1"}))
      .mockResolvedValueOnce(new Response(null, {status: 204}));
    vi.stubGlobal("fetch", fetch);
    await deleteDriveFile("test-token", "drive-file", "revision-1");
    expect(fetch.mock.calls[1][1].headers["If-Match"]).toBe('"version-1"');
  });
});

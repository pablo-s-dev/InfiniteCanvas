import { sha256 } from "js-sha256";
import type { CanvasDocument } from "../canvas/document";

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
};

// Only editable content belongs to the common base. Camera and transport
// timestamps are local bookkeeping, not concurrent edits.
export function syncContentHash(document: CanvasDocument): string {
  return sha256(JSON.stringify(canonical({
    version: document.version, items: document.items, historyCursor: document.historyCursor,
    title: document.metadata.title, tags: document.metadata.tags,
    deletedAt: document.metadata.deletedAt,
  })));
}

export type SyncDecision = "equal" | "upload" | "download" | "conflict" | "unbased";
export function compareSyncVersions(local: string, remote: string, base?: string): SyncDecision {
  if (local === remote) return "equal";
  if (!base) return "unbased";
  if (remote === base) return "upload";
  if (local === base) return "download";
  return "conflict";
}

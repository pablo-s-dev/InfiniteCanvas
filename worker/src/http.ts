export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export async function readBoundedText(
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel("request body exceeded the allowed size");
        throw new HttpError(413, "payload_too_large", "The document exceeds the allowed size.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}

export async function readJsonBody(
  request: Request,
  maximumBytes: number,
): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new HttpError(413, "payload_too_large", "The request exceeds the allowed size.");
  }
  const text = await readBoundedText(request.body, maximumBytes);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "The request body is not valid JSON.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "invalid_body", "The request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function allowedOrigins(request: Request, env: Env): Set<string> {
  const origins = new Set(
    (env.ALLOWED_WEB_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean),
  );
  const requestUrl = new URL(request.url);
  if (
    (env.LOCAL_DEV_MODE as string) === "true" &&
    ["localhost", "127.0.0.1", "::1"].includes(requestUrl.hostname)
  ) {
    origins.add("http://localhost:8081");
    origins.add("http://127.0.0.1:8081");
  }
  return origins;
}

export function withCors(request: Request, response: Response, env: Env): Response {
  const origin = request.headers.get("origin");
  if (!origin) return response;
  const allowed = allowedOrigins(request, env);
  const headers = new Headers(response.headers);
  headers.set("Vary", "Origin");
  if (allowed.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Requested-With, X-Client-Platform, X-Play-Integrity-Token",
    );
    headers.set("Access-Control-Max-Age", "600");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function assertBrowserOrigin(request: Request, env: Env): void {
  let origin = request.headers.get("origin");
  if (!origin && ["GET", "HEAD"].includes(request.method)) {
    try { origin = new URL(request.headers.get("referer") ?? "").origin; } catch { /* Missing or invalid referer is rejected. */ }
  }
  if (!origin || !allowedOrigins(request, env).has(origin)) {
    throw new HttpError(403, "origin_not_allowed", "This app origin is not authorized.");
  }
}

export function expectString(
  value: unknown,
  field: string,
  maximum = 4096,
): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new HttpError(400, "invalid_field", `The ${field} field is invalid.`);
  }
  return value;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    console.error("[HTTP Error]", error.status, error.code, error.message);
    return jsonResponse({ error: { code: error.code, message: error.message } }, error.status);
  }
  console.error(JSON.stringify({ event: "request_failed", error: error instanceof Error ? error.message : "unknown" }));
  return jsonResponse(
    { error: { code: "internal_error", message: "The request could not be completed." } },
    500,
  );
}

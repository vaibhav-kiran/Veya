import { appConfig } from "@/lib/config";

/**
 * The one place that talks HTTP to the Veya FastAPI backend: base URL,
 * timeouts, the user header and consistent error types. Endpoint modules
 * (conversation.ts, projects.ts) build on `apiRequest`.
 */

/** No `EXPO_PUBLIC_VEYA_API_URL` configured for this build. */
export class BackendNotConfiguredError extends Error {
  constructor() {
    super("EXPO_PUBLIC_VEYA_API_URL is not set.");
    this.name = "BackendNotConfiguredError";
  }
}

/** The server answered with a non-2xx status. `detail` is FastAPI's user-safe message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

/** The request never got an answer (offline, wrong URL, server down). */
export class NetworkError extends Error {
  constructor() {
    super("Network request failed.");
    this.name = "NetworkError";
  }
}

export class TimeoutError extends Error {
  constructor() {
    super("The request timed out.");
    this.name = "TimeoutError";
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

let currentUserId: string | null = null;

/**
 * The signed-in Clerk user id, sent as `X-Veya-User` so the backend keeps
 * each account's projects apart. This is NOT authentication — the backend
 * does not verify it. Called from the app layout when the user changes.
 */
export function setApiUser(userId: string | null): void {
  currentUserId = userId;
}

export function isBackendConfigured(): boolean {
  return baseUrl() !== "";
}

function baseUrl(): string {
  return appConfig.veyaApiUrl.trim().replace(/\/+$/, "");
}

/** Absolute URL for a backend path such as `/generated_images/x.png`. */
export function apiUrl(path: string): string {
  const base = baseUrl();
  if (!base) throw new BackendNotConfiguredError();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Headers for requests the app can't route through `apiRequest` (e.g. audio players). */
export function apiHeaders(): Record<string, string> {
  return currentUserId ? { "X-Veya-User": currentUserId } : {};
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  json?: unknown;
  form?: FormData;
  timeoutMs?: number;
  signal?: AbortSignal;
};

/** FastAPI errors are `{detail: string}` or, for validation, `{detail: [{msg}]}`. */
async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === "string") return detail;
      if (Array.isArray(detail)) {
        const messages = detail
          .map((item) => (item && typeof item === "object" && "msg" in item ? String((item as { msg: unknown }).msg) : ""))
          .filter(Boolean);
        if (messages.length) return messages.join(" ");
      }
    }
  } catch {
    // Not JSON (e.g. a proxy error page) — fall through.
  }
  return `Request failed (${response.status}).`;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = apiUrl(path);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener("abort", forwardAbort);

  const headers: Record<string, string> = { Accept: "application/json", ...apiHeaders() };
  let body: string | FormData | undefined;
  if (options.form) {
    // Never set Content-Type for FormData: the runtime adds the multipart boundary.
    body = options.form;
  } else if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  let response: Response;
  try {
    response = await fetch(url, { method: options.method ?? "GET", headers, body, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new TimeoutError();
    if (options.signal?.aborted) throw error;
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", forwardAbort);
  }

  if (!response.ok) throw new ApiError(response.status, await readErrorDetail(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiRequestText(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { headers: apiHeaders(), signal: controller.signal });
  } catch {
    throw controller.signal.aborted ? new TimeoutError() : new NetworkError();
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new ApiError(response.status, await readErrorDetail(response));
  return response.text();
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

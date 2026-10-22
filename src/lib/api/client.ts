import type { ApiErrorCode } from "./types";

export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: ApiErrorCode | "NETWORK";
      message: string;
      status: number;
      retryAfter?: number;
    };

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  tableToken?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
}

/**
 * Universal typed HTTP client for DinePulse REST API v1.
 * - Same-origin only (`credentials: "same-origin"`)
 * - JSON in/out
 * - Injects `x-table-token` and `Idempotency-Key` headers
 * - Parses `{ success, data, error }` envelopes
 * - Never throws on HTTP errors
 * - Default 15s timeout
 */
export async function apiFetch<T>(
  path: string,
  opts?: ApiFetchOptions
): Promise<ApiResult<T>> {
  // Construct URL with optional query parameters
  let url = path;
  if (opts?.query) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes("?") ? "&" : "?") + queryString;
    }
  }

  // Setup abort controller with default 15s timeout
  const controller = new AbortController();
  let timeoutTriggered = false;
  const timeoutId = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort(new Error("Request timed out after 15s"));
  }, 15000);

  let onCallerAbort: (() => void) | undefined;
  if (opts?.signal) {
    if (opts.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(opts.signal.reason);
    } else {
      onCallerAbort = () => {
        clearTimeout(timeoutId);
        controller.abort(opts.signal?.reason);
      };
      opts.signal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  // Assemble headers
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (opts?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (opts?.tableToken) {
    headers["x-table-token"] = opts.tableToken;
  }
  if (opts?.idempotencyKey) {
    headers["Idempotency-Key"] = opts.idempotencyKey;
  }

  try {
    const method = (opts?.method || "GET").toUpperCase();
    const res = await fetch(url, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    if (res.status === 204) {
      return { ok: true, data: undefined as unknown as T };
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return {
        ok: false,
        code: "NETWORK",
        message: `Invalid JSON response from server (${res.status})`,
        status: res.status || 0,
      };
    }

    const envelope = json as {
      success?: boolean;
      data?: unknown;
      error?: { code?: string; message?: string };
    } | null;

    // Success envelope: { success: true, data: ... }
    if (envelope && typeof envelope === "object" && envelope.success === true) {
      return {
        ok: true,
        data: envelope.data as T,
      };
    }

    // Parse Retry-After if present
    const retryAfterHeader = res.headers.get("Retry-After");
    const parsedRetryAfter = retryAfterHeader
      ? parseInt(retryAfterHeader, 10)
      : undefined;
    const retryAfter =
      parsedRetryAfter !== undefined && !isNaN(parsedRetryAfter)
        ? parsedRetryAfter
        : undefined;

    // Error envelope: { success: false, error: { code, message } }
    if (
      envelope &&
      typeof envelope === "object" &&
      envelope.success === false &&
      envelope.error
    ) {
      return {
        ok: false,
        code: (envelope.error.code as ApiErrorCode) || "INTERNAL",
        message: envelope.error.message || "An unexpected error occurred.",
        status: res.status,
        ...(retryAfter !== undefined ? { retryAfter } : {}),
      };
    }

    return {
      ok: false,
      code: "NETWORK",
      message: `Unexpected response format from server (${res.status})`,
      status: res.status,
      ...(retryAfter !== undefined ? { retryAfter } : {}),
    };
  } catch (err: unknown) {
    const isTimeout = timeoutTriggered;
    const message = isTimeout
      ? "Request timed out after 15s"
      : (err as Error)?.message || "Network request failed.";
    return {
      ok: false,
      code: "NETWORK",
      message,
      status: 0,
    };
  } finally {
    clearTimeout(timeoutId);
    if (opts?.signal && onCallerAbort) {
      opts.signal.removeEventListener("abort", onCallerAbort);
    }
  }
}

export interface ApiUploadOptions {
  signal?: AbortSignal;
}

/**
 * Uploads FormData to the REST API.
 * - Same-origin only (`credentials: "same-origin"`)
 * - Multipart/form-data: does NOT set Content-Type header so browser sets boundary
 * - Injects Accept: "application/json" header
 * - 60s timeout via AbortController
 * - Parses `{ success, data, error }` envelopes
 * - Never throws on HTTP errors; network/JSON errors return code: "NETWORK"
 */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  opts?: ApiUploadOptions
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  let timeoutTriggered = false;
  const timeoutId = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort(new Error("Upload timed out after 60s"));
  }, 60000);

  let onCallerAbort: (() => void) | undefined;
  if (opts?.signal) {
    if (opts.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(opts.signal.reason);
    } else {
      onCallerAbort = () => {
        clearTimeout(timeoutId);
        controller.abort(opts.signal?.reason);
      };
      opts.signal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  try {
    const res = await fetch(path, {
      method: "POST",
      headers,
      credentials: "same-origin",
      body: formData,
      signal: controller.signal,
    });

    if (res.status === 204) {
      return { ok: true, data: undefined as unknown as T };
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return {
        ok: false,
        code: "NETWORK",
        message: `Invalid JSON response from server (${res.status})`,
        status: res.status || 0,
      };
    }

    const envelope = json as {
      success?: boolean;
      data?: unknown;
      error?: { code?: string; message?: string };
    } | null;

    if (envelope && typeof envelope === "object" && envelope.success === true) {
      return {
        ok: true,
        data: envelope.data as T,
      };
    }

    const retryAfterHeader = res.headers.get("Retry-After");
    const parsedRetryAfter = retryAfterHeader
      ? parseInt(retryAfterHeader, 10)
      : undefined;
    const retryAfter =
      parsedRetryAfter !== undefined && !isNaN(parsedRetryAfter)
        ? parsedRetryAfter
        : undefined;

    if (
      envelope &&
      typeof envelope === "object" &&
      envelope.success === false &&
      envelope.error
    ) {
      return {
        ok: false,
        code: (envelope.error.code as ApiErrorCode) || "INTERNAL",
        message: envelope.error.message || "An unexpected error occurred.",
        status: res.status,
        ...(retryAfter !== undefined ? { retryAfter } : {}),
      };
    }

    return {
      ok: false,
      code: "NETWORK",
      message: `Unexpected response format from server (${res.status})`,
      status: res.status,
      ...(retryAfter !== undefined ? { retryAfter } : {}),
    };
  } catch (err: unknown) {
    const isTimeout = timeoutTriggered;
    const message = isTimeout
      ? "Upload timed out after 60s"
      : (err as Error)?.message || "Network request failed.";
    return {
      ok: false,
      code: "NETWORK",
      message,
      status: 0,
    };
  } finally {
    clearTimeout(timeoutId);
    if (opts?.signal && onCallerAbort) {
      opts.signal.removeEventListener("abort", onCallerAbort);
    }
  }
}


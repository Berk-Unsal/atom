import { rfRecoveryMessage } from "./rfRecoveryMessage.js";
import { apiOrigin, apiUnreachableMessage, invalidResponseMessage, serverFailureMessage, timeoutFailureMessage } from "./apiRecovery.js";
import { platform } from "../platform/index.js";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
export const MAX_JSON_RESPONSE_BYTES = 32 * 1024 * 1024;
export const MAX_BLOB_RESPONSE_BYTES = 64 * 1024 * 1024;
const INVALID_JSON = Symbol("invalid-json");
const MAX_ERROR_TEXT_BYTES = 4096;

async function withRuntime(signal, operation) {
  if (platform.kind !== "desktop") return operation(null);
  const runtime = await platform.beginRequest(signal);
  try { return await operation(runtime); }
  catch (error) { runtime.assertCurrent(); throw error; }
  finally { runtime.close(); }
}

export function requestJSON(path, options = {}) {
  return withRuntime(options.signal, (runtime) => requestJSONForRuntime(path, options, runtime));
}

async function requestJSONForRuntime(path, {
  fallbackMessage = "Request failed",
  method = "GET",
  payload,
  signal,
  headers,
  onResponse,
} = {}, runtime) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store",
      method,
      headers: headers || payload !== undefined || platform.kind === "desktop"
        ? { ...(runtime ? { "X-Atom-Client": "1", "X-Atom-Runtime-Generation": runtime.generation } : {}), ...(payload === undefined ? {} : { "Content-Type": "application/json" }), ...headers } : undefined,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: runtime?.signal || signal,
    });
  } catch (fetchError) {
    // Browsers reject fetch with TypeError for network failures; anything else (aborts included) passes through.
    if (!(fetchError instanceof TypeError)) throw fetchError;
    const unreachable = new Error(apiUnreachableMessage(apiOrigin(API_BASE_URL)));
    unreachable.code = "api_unreachable";
    unreachable.cause = fetchError;
    throw unreachable;
  }
  runtime?.validateResponse(response);
  if (response.ok && onResponse) {
    try { onResponse(response.headers); } catch (error) { await response.body?.cancel?.(); throw error; }
  }
  const responsePayload = await readResponsePayload(response);
  await runtime?.finish();
  if (responsePayload === INVALID_JSON) {
    const invalid = new Error(response.ok ? invalidResponseMessage(apiOrigin(API_BASE_URL)) : serverFailureMessage(fallbackMessage, response.status));
    invalid.code = response.ok ? "invalid_response" : "server_error";
    invalid.status = response.status;
    throw invalid;
  }
  if (!response.ok) {
    const message = typeof responsePayload === "object" && responsePayload?.error
      ? responsePayload.error
      : typeof responsePayload === "string" && responsePayload.trim()
        ? responsePayload.trim()
        : fallbackMessage;
    const retryAfter = response.headers.get("Retry-After");
    // A 504 is the documented RF deadline, not a backend fault, so it gets timeout guidance.
    const timedOut = response.status === 504;
    const serverError = response.status >= 500 && !timedOut;
    const recovered = timedOut
      ? timeoutFailureMessage(message)
      : serverError ? serverFailureMessage(message, response.status) : rfRecoveryMessage(message, { status: response.status, retryAfter });
    const error = new Error(recovered);
    if (timedOut) error.code = "timeout";
    if (serverError) error.code = "server_error";
    error.status = response.status;
    error.retryAfter = retryAfter;
    throw error;
  }
  return responsePayload;
}

export function postJSON(path, payload, fallbackMessage, signal, options = {}) {
  return requestJSON(path, { ...options, fallbackMessage, method: "POST", payload, signal });
}

export function getJSON(path, fallbackMessage, signal) {
  return requestJSON(path, { fallbackMessage, signal });
}

export async function postBlob(path, payload, fallbackMessage = "Export failed", signal) {
  return withRuntime(signal, (runtime) => postBlobForRuntime(path, payload, fallbackMessage, signal, runtime));
}

async function postBlobForRuntime(path, payload, fallbackMessage, signal, runtime) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    method: "POST",
    headers: { ...(runtime ? { "X-Atom-Client": "1", "X-Atom-Runtime-Generation": runtime.generation } : {}), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: runtime?.signal || signal,
  });
  runtime?.validateResponse(response);
  if (!response.ok) {
    const message = await readBoundedText(response, MAX_ERROR_TEXT_BYTES, true);
    await runtime?.finish();
    throw new Error(message || fallbackMessage);
  }
  const declaredLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BLOB_RESPONSE_BYTES) throw oversizedResponseError(MAX_BLOB_RESPONSE_BYTES);
  const blob = await response.blob();
  await runtime?.finish();
  if (blob.size > MAX_BLOB_RESPONSE_BYTES) throw oversizedResponseError(MAX_BLOB_RESPONSE_BYTES);
  return blob;
}

export function isAbortError(error) {
  return error?.name === "AbortError";
}

async function readResponsePayload(response) {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.toLowerCase().includes("json")) {
    const text = await readBoundedText(response, MAX_JSON_RESPONSE_BYTES);
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      return INVALID_JSON;
    }
  }
  return readBoundedText(response, MAX_ERROR_TEXT_BYTES, true);
}

async function readBoundedText(response, maxBytes, truncate = false) {
  const declaredLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes && !truncate) {
    throw oversizedResponseError(maxBytes);
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    const size = new TextEncoder().encode(text).byteLength;
    if (size > maxBytes && !truncate) throw oversizedResponseError(maxBytes);
    return truncate ? text.slice(0, maxBytes) : text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      if (!truncate) throw oversizedResponseError(maxBytes);
      const remaining = value.subarray(0, Math.max(0, value.byteLength - (total - maxBytes)));
      parts.push(decoder.decode(remaining, { stream: true }));
      break;
    }
    parts.push(decoder.decode(value, { stream: true }));
  }
  parts.push(decoder.decode());
  return parts.join("");
}

function oversizedResponseError(maxBytes) {
  const error = new Error(`API response exceeds the ${maxBytes / (1024 * 1024)} MiB client limit`);
  error.code = "response_too_large";
  return error;
}

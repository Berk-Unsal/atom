export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
export const MAX_JSON_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_ERROR_TEXT_BYTES = 4096;

export async function requestJSON(path, {
  fallbackMessage = "Request failed",
  method = "GET",
  payload,
  signal,
} = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    method,
    headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal,
  });
  const responsePayload = await readResponsePayload(response);
  if (!response.ok) {
    const message = typeof responsePayload === "object" && responsePayload?.error
      ? responsePayload.error
      : typeof responsePayload === "string" && responsePayload.trim()
        ? responsePayload.trim()
        : fallbackMessage;
    const error = new Error(message);
    error.status = response.status;
    error.retryAfter = response.headers.get("Retry-After");
    throw error;
  }
  return responsePayload;
}

export function postJSON(path, payload, fallbackMessage, signal) {
  return requestJSON(path, { fallbackMessage, method: "POST", payload, signal });
}

export function getJSON(path, fallbackMessage, signal) {
  return requestJSON(path, { fallbackMessage, signal });
}

export function isAbortError(error) {
  return error?.name === "AbortError";
}

async function readResponsePayload(response) {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.toLowerCase().includes("json")) {
    try {
      const text = await readBoundedText(response, MAX_JSON_RESPONSE_BYTES);
      return JSON.parse(text);
    } catch (error) {
      if (error?.code === "response_too_large") throw error;
      return null;
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

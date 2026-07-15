export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

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
      return await response.json();
    } catch {
      return null;
    }
  }
  const text = await response.text();
  return text.slice(0, 4096);
}

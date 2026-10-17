// Recovery copy for request failures. Each message states what happened, the likely cause and what to do;
// none of them schedules a retry.

export function apiOrigin(baseURL, location = globalThis.location) {
  if (baseURL) return baseURL;
  return location?.origin ?? "the configured API";
}

export function apiUnreachableMessage(origin) {
  return `A.T.O.M could not reach the planning API at ${origin}. The backend may not be running or may be unreachable from this browser; start it (for example with docker compose up atom) and choose Retry.`;
}

export function serverFailureMessage(detail, status) {
  const reason = String(detail ?? "").trim();
  return `The planning API returned a server error (${status})${reason ? `: ${reason}` : ""}. Try again; if it keeps failing, check the backend logs.`;
}

export function invalidResponseMessage(origin) {
  return `The planning API at ${origin} returned a response A.T.O.M could not read (invalid JSON). Check that the API address points to an A.T.O.M backend, then choose Retry.`;
}

export function timeoutFailureMessage(detail) {
  const reason = String(detail ?? "").trim().replace(/\.+$/, "") || "The request exceeded its deadline";
  return `${reason}. Try again; if it keeps timing out, reduce the plan (fewer Cells or rays).`;
}

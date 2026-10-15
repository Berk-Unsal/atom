// Recovery guidance describes the response just received. It never schedules work.
export function rfRecoveryMessage(message, { status, retryAfter } = {}) {
  if (status !== 429 || typeof retryAfter !== "string" || !/^\d+$/.test(retryAfter.trim())) return message;
  const seconds = Number(retryAfter.trim());
  if (!Number.isSafeInteger(seconds)) return message;
  const budgetReached = /request budget exceeded/i.test(message);
  const capacityBusy = /capacity is busy|already running for this client/i.test(message);
  if (!/\bRF\b/i.test(message) || (!budgetReached && !capacityBusy)) return message;
  const problem = budgetReached ? "RF request budget reached." : "RF computation capacity is busy.";
  const recovery = seconds === 0
    ? "Try again shortly."
    : `Try again in about ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;
  return `${problem} ${recovery}`;
}

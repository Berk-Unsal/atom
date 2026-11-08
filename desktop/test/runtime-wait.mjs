/** Poll the awaited IPC value. Playwright's waitForFunction treats a Promise
 * predicate as truthy before its resolved boolean is available. */
export async function waitForRuntime(page, predicate, timeout = 30_000, interval = 50) {
  const deadline = performance.now() + timeout;
  let status;
  do {
    status = await page.evaluate(() => window.atomDesktop.getRuntime());
    if (predicate(status)) return status;
    if (performance.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(interval, Math.max(0, deadline - performance.now()))));
  } while (performance.now() <= deadline);
  throw new Error(`Runtime condition timed out: ${JSON.stringify(status)}`);
}

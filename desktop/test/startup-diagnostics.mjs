// Failure-only observation. Never reveals/shows a window, retries navigation,
// changes a successful timing sample or invokes RF to get a green result.
async function attempt(operation, timeout) {
  let timer;
  try {
    return await Promise.race([operation(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Diagnostic timed out")), timeout); })]);
  } catch (error) { return { unavailable: String(error.message).slice(0, 1000) }; }
  finally { clearTimeout(timer); }
}
export async function startupDiagnostics(application, page, timeout = 5000) {
  const [windows, document] = await Promise.all([
    attempt(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => ({ id: window.id,
      visible: window.isVisible(), minimized: window.isMinimized(), focused: window.isFocused(), bounds: window.getBounds(),
      url: window.webContents.getURL(), loading: window.webContents.isLoading(), destroyed: window.webContents.isDestroyed() }))), timeout),
    attempt(() => page.evaluate(() => ({ url: location.href, title: document.title, ready_state: document.readyState,
      text: document.body?.innerText.slice(0, 2000), buttons: [...document.querySelectorAll("button")].slice(0, 40).map((button) => ({ text: button.textContent.trim().slice(0, 100), disabled: button.disabled })) })), timeout),
  ]);
  return { windows, document };
}

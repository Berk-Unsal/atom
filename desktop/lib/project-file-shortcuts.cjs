"use strict";
const { isTrustedDocument } = require("./policy.cjs");

function projectShortcut(input, platform = process.platform) {
  if (input.type !== "keyDown" || input.alt || input.isComposing) return null;
  const primary = platform === "darwin" ? input.meta && !input.control : platform === "linux" && input.control && !input.meta;
  if (!primary) return null;
  const key = String(input.key).toLowerCase();
  if (key === "o" && !input.shift) return "open";
  if (key === "s") return input.shift ? "saveAs" : "save";
  if (key === "e" && input.shift) return "export";
  return null;
}
function registerProjectShortcuts(contents, dispatch, platform = process.platform) {
  const listener = (event, input) => {
    const command = projectShortcut(input, platform);
    if (!command || !isTrustedDocument(contents.getURL())) return;
    // Prevent both browser defaults and duplicate menu accelerator handling.
    event.preventDefault();
    if (!input.isAutoRepeat) dispatch(command);
  };
  contents.on("before-input-event", listener);
  return () => contents.removeListener("before-input-event", listener);
}
module.exports = { projectShortcut, registerProjectShortcuts };

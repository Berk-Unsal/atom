/* JXA entry point for actual macOS Print widgets; pure selection is Node-tested. */
function containsFrame(outer, inner) {
  return outer && inner && outer.width > 0 && outer.height > 0 && inner.width > 0 && inner.height > 0 &&
    inner.x >= outer.x - 2 && inner.y >= outer.y - 2 && inner.x + inner.width <= outer.x + outer.width + 2 && inner.y + inner.height <= outer.y + outer.height + 2;
}
function choosePrintPanel(panels, queue) {
  if (queue !== "AtomQualification") throw new Error("Unexpected qualification printer");
  var accepted = panels.filter(function (panel) {
    if (!(panel.role === "AXSheet" || panel.role === "AXWindow" && (panel.name === "Print" || panel.subrole === "AXDialog"))) return false;
    var cancel = panel.controls.filter(function (item) { return item.role === "AXButton" && item.name === "Cancel" && item.enabled === true && containsFrame(panel.frame, item.frame); });
    var print = panel.controls.filter(function (item) { return item.role === "AXButton" && item.name === "Print" && item.enabled === true && containsFrame(panel.frame, item.frame); });
    var selected = panel.controls.filter(function (item) {
      return ["AXPopUpButton", "AXComboBox"].indexOf(item.role) >= 0 && item.enabled === true && item.expanded !== true && containsFrame(panel.frame, item.frame) &&
        [item.name, item.value].some(function (text) { return typeof text === "string" && text.trim() === queue; });
    });
    if (cancel.length !== 1 || print.length !== 1 || selected.length !== 1) return false;
    panel.cancel = cancel[0]; panel.print = print[0]; panel.queue = selected[0]; return true;
  });
  if (accepted.length !== 1) throw new Error("Expected one native Print panel with unique enabled controls and selected queue");
  return accepted[0];
}
function run(argv) {
  ObjC.import("Foundation"); ObjC.import("stdlib");
  var environment = $.NSProcessInfo.processInfo.environment;
  if (ObjC.unwrap(environment.objectForKey("GITHUB_ACTIONS")) !== "true" || $.getuid() === 0) throw new Error("Actual Print driver is restricted to non-root disposable CI");
  if (argv.length !== 2 || !/^[1-9][0-9]{0,9}$/.test(argv[0]) || ["inspect", "cancel", "print"].indexOf(argv[1]) < 0) throw new Error("Usage: macos-print-driver.cjs owned-app-pid inspect|cancel|print");
  var pid = Number(argv[0]), action = argv[1], system = Application("System Events");
  var matches = system.applicationProcesses.whose({ unixId: pid })();
  if (matches.length !== 1 || matches[0].bundleIdentifier() !== "io.github.berk-unsal.atom") throw new Error("Expected the exact packaged Atom process");
  var process = matches[0]; process.frontmost = true;
  var deadline = Date.now() + 35000, last = [], lastError = "";
  function property(element, name, fallback) { try { return element[name](); } catch (_) { return fallback; } }
  function frame(element) { var p = property(element, "position", []), s = property(element, "size", []); return { x: p[0], y: p[1], width: s[0], height: s[1] }; }
  while (Date.now() < deadline) {
    var refs = {}, panels = [], visited = 0;
    function capture(element, depth, controls) {
      if (depth > 14 || ++visited > 1500) throw new Error("Native Print accessibility tree exceeds its bound");
      var id = String(visited), item = { id: id, role: property(element, "role", ""), name: property(element, "name", ""),
        value: property(element, "value", ""), enabled: property(element, "enabled", false), frame: frame(element) };
      try { item.expanded = element.attributes.byName("AXExpanded").value(); } catch (_) {}
      refs[id] = element; controls.push(item);
      property(element, "uiElements", []).forEach(function (child) { capture(child, depth + 1, controls); });
    }
    var windows = process.windows();
    windows.forEach(function (window) {
      var roots = property(window, "sheets", []);
      var name = property(window, "name", ""), subrole = property(window, "subrole", "");
      if (name === "Print" || subrole === "AXDialog") roots.push(window);
      roots.forEach(function (root) {
        var controls = []; capture(root, 0, controls);
        panels.push({ role: property(root, "role", ""), subrole: property(root, "subrole", ""), name: property(root, "name", ""), frame: frame(root), controls: controls });
      });
    });
    // Keep bounded native markers only, never the report document's AX text.
    last = panels.map(function (panel) { return { role: panel.role, subrole: panel.subrole, frame: panel.frame,
      markers: panel.controls.filter(function (item) { return ["Print", "Cancel", "Printer", "AtomQualification"].indexOf(item.name) >= 0 || item.value === "AtomQualification"; }).map(function (item) { return { role: item.role, name: item.name, value: typeof item.value === "string" ? item.value.slice(0, 100) : null, enabled: item.enabled, frame: item.frame }; }) }; });
    var panel;
    try { panel = choosePrintPanel(panels, "AtomQualification"); }
    catch (error) { lastError = String(error); delay(0.2); continue; }
    var receipt = { pid: pid, bundle_id: process.bundleIdentifier(), operation: action, method: "System Events actual native AXPress; no print method or response replacement",
      native_widgets_only: true, panel: { role: panel.role, subrole: panel.subrole, frame: panel.frame },
      widgets: { cancel: panel.cancel, print: panel.print, queue: panel.queue } };
    // Never retry an input operation, including an ambiguous AXPress failure.
    if (action !== "inspect") refs[panel[action].id].click();
    return JSON.stringify(receipt);
  }
  throw new Error(lastError + "; observed native markers: " + JSON.stringify(last));
}
if (typeof module !== "undefined") module.exports = { containsFrame, choosePrintPanel };

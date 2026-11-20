/* Actual macOS file panels on disposable CI. Selection is pure Node-tested. */
function inside(outer, inner) {
  return outer && inner && outer.width > 0 && outer.height > 0 && inner.width > 0 && inner.height > 0 &&
    inner.x >= outer.x - 2 && inner.y >= outer.y - 2 && inner.x + inner.width <= outer.x + outer.width + 2 && inner.y + inner.height <= outer.y + outer.height + 2;
}
function targetWithinRoot(root, target) {
  return typeof root === "string" && /^\/.+\/atom-macos-files-[A-Za-z0-9]+$/.test(root) && typeof target === "string" &&
    target.indexOf(root + "/") === 0 && !/[\x00-\x1f\x7f]/.test(target) && !target.slice(1).split("/").some(function (part) { return part === "." || part === ".." || part === ""; });
}
function chooseFilePanel(panels, kind, ready) {
  var label = { open: "Open", save: "Save", path: "Go" }[kind];
  if (!label) throw new Error("Unexpected file-panel kind");
  var accepted = panels.filter(function (panel) {
    if (!(panel.role === "AXSheet" || panel.role === "AXWindow" && panel.subrole === "AXDialog")) return false;
    var controls = panel.controls.filter(function (item) { return inside(panel.frame, item.frame); });
    var cancel = controls.filter(function (item) { return item.role === "AXButton" && item.name === "Cancel" && item.enabled === true; });
    var confirm = controls.filter(function (item) { return item.role === "AXButton" && item.name === label && (!ready || item.enabled === true); });
    if (cancel.length !== 1 || confirm.length !== 1) return false;
    var fields = controls.filter(function (item) { return item.role === "AXTextField" && item.enabled === true; });
    if (kind === "save") {
      var named = fields.filter(function (item) { return [item.name, item.description].some(function (text) { return /^Save As:?$/i.test(text || ""); }) || /saveasname/i.test(item.identifier || ""); });
      if (named.length) fields = named;
    }
    if (kind === "path" && !fields.length) fields = controls.filter(function (item) { return item.role === "AXComboBox" && item.enabled === true; });
    if (kind !== "open" && fields.length !== 1) return false;
    panel.cancel = cancel[0]; panel.confirm = confirm[0]; panel.field = fields[0]; return true;
  });
  if (accepted.length !== 1) throw new Error("Expected one unambiguous native " + kind + " panel");
  return accepted[0];
}
function hasAttributes(value) { return Boolean(value && typeof value.isNil === "function" && !value.isNil()); }
function run(argv) {
  ObjC.import("Foundation"); ObjC.import("stdlib"); ObjC.bindFunction("getuid", ["unsigned int", []]);
  var environment = $.NSProcessInfo.processInfo.environment;
  if (ObjC.unwrap(environment.objectForKey("GITHUB_ACTIONS")) !== "true" || $.getuid() === 0) throw new Error("Actual file driver is restricted to non-root disposable CI");
  if (argv.length !== 5 || !/^[1-9][0-9]{0,9}$/.test(argv[0]) || ["open", "save", "cancel-open", "cancel-save"].indexOf(argv[1]) < 0 || !targetWithinRoot(argv[4], argv[3])) throw new Error("Invalid owned file-panel operation");
  var pid = Number(argv[0]), action = argv[1], title = argv[2], target = argv[3], root = argv[4];
  if (["Export project copy", "Open A.T.O.M project", "Save A.T.O.M project", "Save A.T.O.M report"].indexOf(title) < 0) throw new Error("Unexpected file-panel title");
  var canonicalRoot = ObjC.unwrap($(root).stringByResolvingSymlinksInPath);
  var parent = target.slice(0, target.lastIndexOf("/")), basename = target.slice(target.lastIndexOf("/") + 1);
  var canonicalParent = ObjC.unwrap($(parent).stringByResolvingSymlinksInPath);
  if (!targetWithinRoot(canonicalRoot, canonicalParent + "/" + basename)) throw new Error("File-panel target escapes the owned tree");
  var leaf = $.NSFileManager.defaultManager.attributesOfItemAtPathError(target, null);
  if (hasAttributes(leaf) && ObjC.unwrap(leaf.objectForKey("NSFileType")) === "NSFileTypeSymbolicLink") throw new Error("A native file target must not be a symlink");
  var attributes = $.NSFileManager.defaultManager.attributesOfItemAtPathError(root, null);
  if (!hasAttributes(attributes) || Number(ObjC.unwrap(attributes.objectForKey("NSFileOwnerAccountID"))) !== $.getuid() ||
      Number(ObjC.unwrap(attributes.objectForKey("NSFilePosixPermissions"))) !== 448 || ObjC.unwrap(attributes.objectForKey("NSFileType")) !== "NSFileTypeDirectory") throw new Error("Expected an owned private qualification directory");
  var system = Application("System Events"), matches = system.applicationProcesses.whose({ unixId: pid })();
  if (matches.length !== 1 || matches[0].bundleIdentifier() !== "io.github.berk-unsal.atom") throw new Error("Expected the exact packaged Atom process");
  var process = matches[0]; process.frontmost = true;
  function property(element, name, fallback) { try { return element[name](); } catch (_) { return fallback; } }
  function frame(element) { var p = property(element, "position", []), s = property(element, "size", []); return { x: p[0], y: p[1], width: s[0], height: s[1] }; }
  var refs = {}, last = [];
  function observe() {
    refs = {}; var panels = [], visited = 0;
    function capture(element, depth, controls) {
      if (depth > 16 || ++visited > 2000) throw new Error("Native file accessibility tree exceeds its bound");
      var role = property(element, "role", "");
      if (role === "AXSheet" && depth > 0) { panel(element); return; }
      var id = String(visited), item = { id: id, role: role, name: property(element, "name", ""), description: property(element, "description", ""),
        enabled: property(element, "enabled", false), frame: frame(element) };
      try { item.identifier = element.attributes.byName("AXIdentifier").value(); } catch (_) {}
      refs[id] = element; controls.push(item);
      property(element, "uiElements", []).forEach(function (child) { capture(child, depth + 1, controls); });
    }
    function panel(element) { var controls = []; capture(element, 0, controls); panels.push({ role: property(element, "role", ""), subrole: property(element, "subrole", ""), frame: frame(element), controls: controls }); }
    process.windows().forEach(function (window) {
      if (property(window, "subrole", "") === "AXDialog") panel(window);
      else property(window, "sheets", []).forEach(panel);
    });
    last = panels.map(function (panel) { return { role: panel.role, subrole: panel.subrole, frame: panel.frame, controls: panel.controls.filter(function (item) {
      return ["Cancel", "Save", "Open", "Go"].indexOf(item.name) >= 0 || ["AXTextField", "AXComboBox"].indexOf(item.role) >= 0;
    }).map(function (item) { return { role: item.role, marker: ["Cancel", "Save", "Open", "Go"].indexOf(item.name) >= 0 ? item.name : "native-path-or-filename-field", enabled: item.enabled, frame: item.frame,
      save_as_label: [item.name, item.description].some(function (text) { return /^Save As:?$/i.test(text || ""); }) }; }) }; });
    return panels;
  }
  function wait(kind, ready) {
    var end = Date.now() + 30000, failure = "";
    while (Date.now() < end) { try { var panels = observe();
      if (kind !== "path" && panels.some(function (panel) { return panel.controls.some(function (item) { return item.role === "AXButton" && item.name === "Go"; }); })) throw new Error("Native path navigation is still open");
      return chooseFilePanel(panels, kind, ready); } catch (error) { failure = String(error); delay(0.15); } }
    throw new Error(failure + "; bounded native markers: " + JSON.stringify(last));
  }
  function marker(panel) { return { role: panel.role, frame: panel.frame, confirm: { role: panel.confirm.role, frame: panel.confirm.frame, enabled: panel.confirm.enabled }, field_role: panel.field && panel.field.role }; }
  var kind = /open$/.test(action) || action === "open" ? "open" : "save", initial = wait(kind, false);
  var receipt = { pid: pid, operation: action, bundle_id: process.bundleIdentifier(), title: title, native_widgets_only: true,
    method: "System Events actual native path/filename controls and AXPress; no dialog response replacement", initial_panel: marker(initial) };
  // No input operation is retried after an uncertain delivery failure.
  if (action.indexOf("cancel-") === 0) { refs[initial.cancel.id].click(); return JSON.stringify(receipt); }
  system.keystroke("g", { using: ["command down", "shift down"] });
  var navigation = wait("path", false), destination = action === "open" ? target : target.slice(0, target.lastIndexOf("/"));
  refs[navigation.field.id].value = destination;
  if (property(refs[navigation.field.id], "value", "") !== destination) throw new Error("Native path field did not retain the exact owned destination");
  navigation = wait("path", true); receipt.path_panel = marker(navigation); refs[navigation.confirm.id].click();
  var final = wait(kind, false);
  if (action === "save") {
    var filename = target.slice(target.lastIndexOf("/") + 1); refs[final.field.id].value = filename;
    if (property(refs[final.field.id], "value", "") !== filename) throw new Error("Native filename field did not retain the exact Unicode filename");
  }
  final = wait(kind, true); receipt.final_panel = marker(final); refs[final.confirm.id].click();
  return JSON.stringify(receipt);
}
if (typeof module !== "undefined") module.exports = { inside, targetWithinRoot, chooseFilePanel, hasAttributes };

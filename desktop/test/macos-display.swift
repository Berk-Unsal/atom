// Test-only display preparation on disposable hosted macOS runners.
// Select an advertised mode; never changes a personal machine's display.
import AppKit
import CoreGraphics
import Foundation

let observeOnly = CommandLine.arguments.contains("--observe-only")
guard observeOnly || ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] == "true" else {
    fputs("Display preparation requires a disposable Actions runner\n", stderr)
    exit(1)
}

func dimensions(_ mode: CGDisplayMode) -> [String: Any] {
    return ["width": mode.width, "height": mode.height,
            "pixel_width": mode.pixelWidth, "pixel_height": mode.pixelHeight,
            "refresh_hz": mode.refreshRate]
}
func visibleFrame(_ display: CGDirectDisplayID) -> [String: CGFloat] {
    let screen = NSScreen.screens.first {
        ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == display
    }
    return ["width": screen?.visibleFrame.width ?? 0, "height": screen?.visibleFrame.height ?? 0]
}
func write(_ record: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: record, options: [.prettyPrinted, .sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

let display = CGMainDisplayID()
let modes = (CGDisplayCopyAllDisplayModes(display, nil) as? [CGDisplayMode]) ?? []
var record: [String: Any] = ["scope": "Advertised-mode configuration on disposable hosted macOS only",
                            "display_id": display, "available_modes": modes.map(dimensions),
                            "before_visible_frame": visibleFrame(display)]
if let current = CGDisplayCopyDisplayMode(display) { record["before_mode"] = dimensions(current) }
if observeOnly {
    record["result"] = "OBSERVE_ONLY"
    write(record)
    exit(0)
}
let before = visibleFrame(display)
if before["width", default: 0] >= 1440 && before["height", default: 0] >= 950 {
    record["result"] = "ALREADY_SUFFICIENT"
    write(record)
    exit(0)
}
let suitable = modes.filter { $0.width >= 1600 && $0.height >= 1080 }.sorted {
    if $0.width * $0.height != $1.width * $1.height {
        return $0.width * $0.height < $1.width * $1.height
    }
    return $0.pixelWidth * $0.pixelHeight < $1.pixelWidth * $1.pixelHeight
}
guard let selected = suitable.first else {
    record["result"] = "NO_ADVERTISED_MODE_FOR_REQUIRED_VIEWPORT"
    write(record)
    exit(1)
}
record["selected_mode"] = dimensions(selected)
var configuration: CGDisplayConfigRef?
var changed = CGBeginDisplayConfiguration(&configuration)
if changed == .success, let configuration = configuration {
    changed = CGConfigureDisplayWithDisplayMode(configuration, display, selected, nil)
    if changed == .success {
        // Keep the advertised mode for subsequent test steps in this login
        // session, without saving permanent display preferences.
        changed = CGCompleteDisplayConfiguration(configuration, .forSession)
    } else {
        CGCancelDisplayConfiguration(configuration)
    }
}
record["configuration_result"] = changed.rawValue
RunLoop.current.run(until: Date().addingTimeInterval(1.0))
let after = visibleFrame(display)
record["appkit_cached_visible_frame_after"] = after
if let current = CGDisplayCopyDisplayMode(display) { record["after_mode"] = dimensions(current) }
// NSScreen can retain the pre-change geometry in this short-lived CLI. Query
// WindowServer's live display bounds; Electron separately asserts its actual
// 1440x900 content viewport during qualification.
let bounds = CGDisplayBounds(display)
record["after_display_bounds"] = ["width": bounds.width, "height": bounds.height]
let sufficient = changed == .success && bounds.width >= 1600 && bounds.height >= 1080
record["result"] = sufficient ? "PASS" : "DISPLAY_CONFIGURATION_INSUFFICIENT"
write(record)
exit(sufficient ? 0 : 1)

#!/usr/bin/env python3
"""Capture one owned disposable compositor frame for Print failure diagnosis."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import time


def main():
    import gi
    gi.require_version("Gst", "1.0")
    from gi.repository import Gio, GLib, Gst
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.getuid() == 0:
        raise RuntimeError("Compositor capture requires an ordinary disposable Actions user")
    compositor = int(os.environ["ATOM_NATIVE_COMPOSITOR_PID"])
    if Path(f"/proc/{compositor}/exe").resolve(strict=True).name != "mutter" or Path(f"/proc/{compositor}").stat().st_uid != os.getuid():
        raise RuntimeError("Only the explicitly owned Mutter compositor may be captured")
    output = Path(args.output)
    expected = Path(os.environ["GITHUB_WORKSPACE"]).resolve() / "desktop/test-results"
    if output.parent.resolve(strict=True) != expected or output.name not in ("native-print-cancel.png", "native-print-print.png") or output.is_symlink():
        raise RuntimeError("Unexpected Print diagnostic destination")
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    service = "org.gnome.Mutter.ScreenCast"
    def proxy(location, interface):
        return Gio.DBusProxy.new_sync(bus, Gio.DBusProxyFlags.NONE, None, service, location, interface, None)
    def call(target, method, parameters=None):
        return target.call_sync(method, parameters, Gio.DBusCallFlags.NONE, 10000, None)
    root = proxy("/org/gnome/Mutter/ScreenCast", service)
    session_path = call(root, "CreateSession", GLib.Variant("(a{sv})", ({},))).unpack()[0]
    session = proxy(session_path, service + ".Session")
    pipeline = None
    try:
        stream_path = call(session, "RecordMonitor", GLib.Variant("(sa{sv})", ("", {"cursor-mode": GLib.Variant("u", 0)}))).unpack()[0]
        stream = proxy(stream_path, service + ".Stream")
        nodes = []
        stream.connect("g-signal", lambda _proxy, _sender, name, parameters: nodes.append(parameters.unpack()[0]) if name == "PipeWireStreamAdded" else None)
        call(session, "Start")
        context = GLib.MainContext.default()
        deadline = time.monotonic() + 20
        while not nodes and time.monotonic() < deadline:
            while context.pending(): context.iteration(False)
            time.sleep(0.02)
        if not nodes:
            raise RuntimeError("Owned compositor did not expose a PipeWire stream")
        Gst.init(None)
        pipeline = Gst.Pipeline.new("atom-print-diagnostic")
        source = Gst.ElementFactory.make("pipewiresrc")
        convert = Gst.ElementFactory.make("videoconvert")
        encode = Gst.ElementFactory.make("pngenc")
        sink = Gst.ElementFactory.make("filesink")
        if any(element is None for element in (source, convert, encode, sink)):
            raise RuntimeError("Required compositor capture elements are unavailable")
        source.set_property("path", str(nodes[0]))
        source.set_property("num-buffers", 1)
        encode.set_property("snapshot", True)
        sink.set_property("location", str(output))
        for element in (source, convert, encode, sink): pipeline.add(element)
        if not (source.link(convert) and convert.link(encode) and encode.link(sink)):
            raise RuntimeError("Compositor capture pipeline could not link")
        if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
            raise RuntimeError("Compositor capture pipeline could not start")
        finished = False
        while time.monotonic() < deadline:
            while context.pending(): context.iteration(False)
            message = pipeline.get_bus().timed_pop_filtered(100 * Gst.MSECOND, Gst.MessageType.ERROR | Gst.MessageType.EOS)
            if message and message.type == Gst.MessageType.ERROR:
                error, debug = message.parse_error()
                raise RuntimeError(f"Compositor capture failed: {error}; {debug}")
            if message and message.type == Gst.MessageType.EOS:
                finished = True
                break
        if not finished:
            raise RuntimeError("Compositor capture did not finish within its deadline")
        pipeline.set_state(Gst.State.NULL)
        image = output.read_bytes()
        if not image.startswith(b"\x89PNG\r\n\x1a\n") or len(image) > 10 * 1024 * 1024:
            raise RuntimeError("Compositor did not produce a bounded PNG")
        width, height = struct.unpack(">II", image[16:24])
        print(json.dumps({"method": "Mutter ScreenCast/PipeWire compositor pixels", "width": width, "height": height,
                          "bytes": len(image), "sha256": hashlib.sha256(image).hexdigest(), "file": output.name}))
    finally:
        if pipeline is not None: pipeline.set_state(Gst.State.NULL)
        call(session, "Stop")


if __name__ == "__main__":
    main()

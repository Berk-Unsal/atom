#!/usr/bin/env python3
"""D01 (#148): send keyboard input into a Mutter Wayland session.

Uses Mutter's org.gnome.Mutter.RemoteDesktop D-Bus API (the interface GNOME
Remote Desktop uses), which works without X and in headless Mutter. Input
goes to the focused surface, i.e. the modal file dialog.

Usage: mutter-keys.py <step>...   where a step is "key:Return",
"combo:Control_L+l" or "text:/some/path".
"""
import sys
import time

from gi.repository import Gio, GLib

KEYSYMS = {"Return": 0xFF0D, "Control_L": 0xFFE3, "l": 0x006C, "a": 0x0061}
BUS_NAME = "org.gnome.Mutter.RemoteDesktop"


def keysym_for(char):
    code = ord(char)
    return code if code < 0x100 else 0x01000000 + code


def main():
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    root = Gio.DBusProxy.new_sync(bus, Gio.DBusProxyFlags.NONE, None, BUS_NAME, "/org/gnome/Mutter/RemoteDesktop", BUS_NAME, None)
    session_path = root.call_sync("CreateSession", None, Gio.DBusCallFlags.NONE, -1, None).unpack()[0]
    session = Gio.DBusProxy.new_sync(bus, Gio.DBusProxyFlags.NONE, None, BUS_NAME, session_path, BUS_NAME + ".Session", None)
    session.call_sync("Start", None, Gio.DBusCallFlags.NONE, -1, None)

    def press(keysym, state):
        session.call_sync("NotifyKeyboardKeysym", GLib.Variant("(ub)", (keysym, state)), Gio.DBusCallFlags.NONE, -1, None)

    def tap(keysym):
        press(keysym, True)
        press(keysym, False)
        time.sleep(0.03)

    for step in sys.argv[1:]:
        kind, _, value = step.partition(":")
        if kind == "key":
            tap(KEYSYMS[value])
        elif kind == "combo":
            keys = [KEYSYMS[k] for k in value.split("+")]
            for keysym in keys:
                press(keysym, True)
            for keysym in reversed(keys):
                press(keysym, False)
        elif kind == "text":
            for char in value:
                tap(keysym_for(char))
        time.sleep(0.4)
    session.call_sync("Stop", None, Gio.DBusCallFlags.NONE, -1, None)
    print(f"sent {len(sys.argv) - 1} steps via {session_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

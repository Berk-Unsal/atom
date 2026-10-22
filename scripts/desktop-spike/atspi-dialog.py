#!/usr/bin/env python3
"""D01 (#148): press a native GTK file dialog's own button through AT-SPI.

Works under Wayland, where synthetic X input is unavailable, because AT-SPI
talks to the toolkit over D-Bus. Usage: atspi-dialog.py <dialog title> <button>...
Prints what it found; exits non-zero if the button could not be pressed.
"""
import sys
import time

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi  # noqa: E402


def walk(node, depth=0, limit=14):
    if node is None or depth > limit:
        return
    yield node
    for index in range(node.get_child_count()):
        try:
            yield from walk(node.get_child_at_index(index), depth + 1, limit)
        except Exception:  # noqa: BLE001 - stale accessibles are expected
            continue


def find_dialog(title):
    desktop = Atspi.get_desktop(0)
    for app_index in range(desktop.get_child_count()):
        app = desktop.get_child_at_index(app_index)
        if app is None:
            continue
        for window_index in range(app.get_child_count()):
            window = app.get_child_at_index(window_index)
            if window is not None and (window.get_name() or "") == title:
                return app, window
    return None, None


def main():
    title, buttons = sys.argv[1], sys.argv[2:]
    deadline = time.time() + 25
    while time.time() < deadline:
        app, dialog = find_dialog(title)
        if dialog is not None:
            break
        time.sleep(0.5)
    else:
        apps = [Atspi.get_desktop(0).get_child_at_index(i) for i in range(Atspi.get_desktop(0).get_child_count())]
        print("dialog not found; applications:", [a.get_name() for a in apps if a is not None])
        return 1
    time.sleep(1)
    labels = []
    for node in walk(dialog):
        if node.get_role() == Atspi.Role.PUSH_BUTTON:
            name = (node.get_name() or "").replace("_", "")
            labels.append(name)
            if name in buttons and node.get_state_set().contains(Atspi.StateType.SENSITIVE):
                action = node.get_action_iface()
                if action is not None:
                    action.do_action(0)
                    print(f"pressed {name!r} in {title!r} (app {app.get_name()!r})")
                    return 0
    print(f"no sensitive {buttons} button in {title!r}; buttons: {labels}")
    return 2


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Activate the installed app's real GTK Print/Cancel widget on a disposable VM."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import time

spec = importlib.util.spec_from_file_location("dialogs", Path(__file__).with_name("native-dialog-driver.py"))
dialogs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dialogs)


def main():
    import pyatspi
    from gi.repository import GLib
    dialogs.READ_ERRORS = (*dialogs.READ_ERRORS, GLib.Error)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--action", choices=("cancel", "print"), required=True)
    args = parser.parse_args()
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.getuid() == 0:
        raise RuntimeError("Print automation requires an ordinary user on a disposable Actions VM")
    executable = Path(f"/proc/{args.pid}/exe").resolve(strict=True)
    if executable != Path("/opt/atom-planner/atom-desktop") or executable.stat().st_uid != 0:
        raise RuntimeError("Only the installed qualification app may be operated")
    context = GLib.MainContext.default()
    deadline = time.monotonic() + 30
    last_tree = []
    apps = []
    while time.monotonic() < deadline:
        os.kill(args.pid, 0)
        while context.pending():
            context.iteration(False)
        desktop = pyatspi.Registry.getDesktop(0)
        apps = []
        for app in desktop:
            try:
                apps.append({"pid": app.get_process_id(), "name": app.name})
            except dialogs.READ_ERRORS:
                continue
        dialog = dialogs.find_dialog(desktop, args.pid, "Print", pyatspi)
        if dialog is not None:
            last_tree = dialogs.snapshot(dialog)
            label = args.action
            for button in dialogs.matching(dialog, lambda node: node.getRole() == pyatspi.ROLE_PUSH_BUTTON
                                           and node.name.replace("_", "").casefold() == label
                                           and dialogs.ready(node, pyatspi)):
                name = button.name
                if dialogs.activate(button):
                    print(json.dumps({"pid": args.pid, "title": "Print", "operation": args.action,
                                      "button": name, "native_widgets_only": True, "tree": last_tree[-80:]}))
                    return
        time.sleep(0.2)
    raise RuntimeError(f"Real GTK Print widget unavailable: apps={json.dumps(apps)} tree={json.dumps(last_tree[-80:])}")


if __name__ == "__main__":
    main()

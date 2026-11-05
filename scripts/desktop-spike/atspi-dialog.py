#!/usr/bin/env python3
"""Operate a real GTK file chooser through AT-SPI, including on Wayland.

Only an enabled button in the requested process and named dialog is eligible.
No file chooser response, Electron API, or filesystem operation is mocked.
"""
import argparse
import json
from pathlib import Path
import time

import pyatspi
from gi.repository import GLib


def descendants(root, limit=512):
    queue = [root]
    while queue and limit:
        node = queue.pop(0)
        limit -= 1
        if node is None:
            continue
        yield node
        try:
            queue.extend(node)
        except (RuntimeError, AttributeError):
            continue


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--action", choices=["save", "open", "cancel"], required=True)
    parser.add_argument("--target", required=True)
    args = parser.parse_args()
    deadline = time.monotonic() + 25
    last_tree = []
    applications = []
    context = GLib.MainContext.default()
    file_selected = False
    while time.monotonic() < deadline:
        while context.pending():
            context.iteration(False)
        applications = []
        for app in pyatspi.Registry.getDesktop(0):
            try:
                pid = app.get_process_id()
                applications.append({"pid": pid, "name": app.name})
                if pid != args.pid:
                    continue
                app.clear_cache()
                last_tree = []
                for node in descendants(app):
                    last_tree.append({"role": node.getRoleName(), "name": node.name})
                    if node.name != args.title:
                        continue
                    if args.action == "open" and not file_selected:
                        for files in descendants(node):
                            if files.name != "Files" or files.getRole() not in [pyatspi.ROLE_TABLE, pyatspi.ROLE_TREE_TABLE]:
                                continue
                            table = files.queryTable()
                            for row in range(min(table.nRows, 1000)):
                                cell = table.getAccessibleAt(row, 0)
                                if not any(child.name == Path(args.target).name for child in descendants(cell)):
                                    continue
                                if not table.isRowSelected(row):
                                    table.addRowSelection(row)
                                if not table.isRowSelected(row):
                                    raise RuntimeError("native chooser refused file selection")
                                file_selected = True
                                print(json.dumps({"selected_file": Path(args.target).name, "row": row}))
                                break
                        if not file_selected:
                            continue
                    for button in descendants(node):
                        if button.getRole() != pyatspi.ROLE_PUSH_BUTTON:
                            continue
                        if button.name.replace("_", "").casefold() != args.action:
                            continue
                        state = button.getState()
                        if not all(state.contains(s) for s in [pyatspi.STATE_SHOWING, pyatspi.STATE_ENABLED, pyatspi.STATE_SENSITIVE]):
                            continue
                        action = button.queryAction()
                        for index in range(action.nActions):
                            name = action.getName(index)
                            if name not in ["click", "press", "activate"]:
                                continue
                            label = button.name
                            if not action.doAction(index):
                                raise RuntimeError("native button refused its action")
                            print(json.dumps({"pid": args.pid, "dialog": args.title, "button": label, "action": name}))
                            return
            except (RuntimeError, AttributeError) as error:
                last_tree.append({"error": str(error)})
        time.sleep(0.2)
    raise RuntimeError(f"native {args.action} button unavailable: apps={json.dumps(applications)} tree={json.dumps(last_tree[-80:])}")


if __name__ == "__main__":
    main()

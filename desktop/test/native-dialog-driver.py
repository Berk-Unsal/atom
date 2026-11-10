#!/usr/bin/env python3
"""Drive only the owned GTK portal's real, visible file chooser via AT-SPI."""
import argparse
import json
import os
from pathlib import Path
import time

READ_ERRORS = (RuntimeError, AttributeError)

def descendants(root, limit=768):
    queue = [root]
    while queue and limit:
        node = queue.pop(0)
        limit -= 1
        if node is None:
            continue
        yield node
        try:
            queue.extend(node)
        except READ_ERRORS:
            continue


def matching(root, predicate):
    for node in descendants(root):
        try:
            if predicate(node):
                yield node
        except READ_ERRORS:
            # GTK recreates accessible file-list children during validation.
            # A stale observation is not permission to replay an action.
            continue


def snapshot(root):
    rows = []
    for node in descendants(root):
        try:
            rows.append({"name": node.name, "role": node.getRoleName()})
        except READ_ERRORS:
            continue
    return rows


def ready(node, api):
    state = node.getState()
    return all(state.contains(flag) for flag in (api.STATE_SHOWING, api.STATE_ENABLED, api.STATE_SENSITIVE))


def find_dialog(applications, pid, title, api):
    for application in applications:
        try:
            owned = application.get_process_id() == pid
        except READ_ERRORS:
            continue
        if not owned:
            continue
        application.clear_cache()
        for node in matching(application, lambda node: node.name == title and ready(node, api)):
            return node
    return None


def activate(node):
    action = node.queryAction()
    for index in range(action.nActions):
        if action.getName(index) in ("click", "press", "activate"):
            if not action.doAction(index):
                raise RuntimeError("Native widget refused activation")
            return True
    return False


def set_save_path(dialog, target, api):
    entries = list(matching(dialog, lambda node: node.getRole() == api.ROLE_TEXT
                            and ready(node, api) and node.getState().contains(api.STATE_EDITABLE)))
    named = [node for node in entries if node.name.replace("_", "").strip(" :").casefold() in ("name", "file name", "filename", "save as")]
    candidates = named or (entries if len(entries) == 1 else [])
    if len(candidates) != 1:
        return False
    entry = candidates[0]
    if not entry.queryEditableText().setTextContents(str(target)):
        raise RuntimeError("Native filename entry refused text")
    if entry.queryText().getText(0, -1) != str(target):
        raise RuntimeError("Native filename entry did not retain the requested path")
    return True


def select_open_path(dialog, target, api):
    for node in matching(dialog, lambda node: node.name == "Files" and node.getRole() in (api.ROLE_TABLE, api.ROLE_TREE_TABLE)):
        try:
            table = node.queryTable()
            count = min(table.nRows, 1000)
        except READ_ERRORS:
            continue
        for row in range(count):
            try:
                cell = table.getAccessibleAt(row, 0)
                if any(child.name == target.name for child in descendants(cell)):
                    if not table.isRowSelected(row):
                        table.addRowSelection(row)
                    # A refresh/sort may replace a row while selection settles.
                    # Never accept a different file at the old row position.
                    current = table.getAccessibleAt(row, 0)
                    return table.isRowSelected(row) and any(child.name == target.name for child in descendants(current))
            except READ_ERRORS:
                continue
    # GTK's location entry is a real chooser widget, not a supplied response.
    for node in matching(dialog, lambda node: node.getRole() == api.ROLE_TEXT and ready(node, api) and node.name.strip(" :").casefold() in ("location", "file name", "name")):
        if not node.queryEditableText().setTextContents(str(target)):
            raise RuntimeError("Native location entry refused text")
        return node.queryText().getText(0, -1) == str(target)
    for node in matching(dialog, lambda node: ready(node, api) and node.name.replace("_", "").casefold() in ("type a file name", "enter location")):
        activate(node)
        break
    return False


def accept(dialog, operation, api):
    names = {"save": {"save"}, "open": {"open", "select"}, "cancel": {"cancel"}}[operation]
    for node in matching(dialog, lambda node: node.getRole() == api.ROLE_PUSH_BUTTON and node.name.replace("_", "").casefold() in names and ready(node, api)):
        # The native action can immediately destroy this accessible object.
        label = node.name
        if activate(node):
            return label
    return None


def main():
    global READ_ERRORS
    import pyatspi
    from gi.repository import GLib
    READ_ERRORS = (*READ_ERRORS, GLib.Error)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--action", choices=["save", "open", "cancel"], required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--root", required=True)
    args = parser.parse_args()
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.getuid() == 0:
        raise RuntimeError("Native surface automation requires an ordinary user on a disposable Actions VM")
    root = Path(args.root).resolve(strict=True)
    if root.parent != Path("/tmp") or not root.name.startswith("atom-native-surfaces-") or root.stat().st_uid != os.getuid() or root.stat().st_mode & 0o777 != 0o700:
        raise RuntimeError("Unexpected owned qualification root")
    target = Path(args.target)
    if not target.is_absolute() or not target.parent.resolve(strict=True).is_relative_to(root):
        raise RuntimeError("Chooser target escaped the qualification root")
    if Path(f"/proc/{args.pid}/exe").resolve().name != "xdg-desktop-portal-gtk":
        raise RuntimeError("Only the explicitly owned GTK portal may be operated")
    deadline = time.monotonic() + 25
    context = GLib.MainContext.default()
    selected = args.action == "cancel"
    last_tree = []
    while time.monotonic() < deadline:
        os.kill(args.pid, 0)
        while context.pending():
            context.iteration(False)
        dialog = find_dialog(pyatspi.Registry.getDesktop(0), args.pid, args.title, pyatspi)
        if dialog is not None:
            last_tree = snapshot(dialog)
            if not selected:
                selected = set_save_path(dialog, target, pyatspi) if args.action == "save" else select_open_path(dialog, target, pyatspi)
                # Let GTK's filename validation and directory traversal settle.
                time.sleep(0.2)
                continue
            button = accept(dialog, args.action, pyatspi)
            if button:
                print(json.dumps({"pid": args.pid, "title": args.title, "operation": args.action, "button": button,
                                  "target": str(target), "native_widgets_only": True, "tree": last_tree[-80:]}, ensure_ascii=False))
                return
        time.sleep(0.2)
    raise RuntimeError(f"Native chooser did not complete: {json.dumps(last_tree[-80:], ensure_ascii=False)}")


if __name__ == "__main__":
    main()

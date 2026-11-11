#!/usr/bin/env python3
"""Identify real Print controls in compositor pixels and click through Mutter."""
import argparse
import csv
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time


def normalized(text):
    return "".join(char for char in text.casefold() if char.isalpha())


def parse_words(tsv, offset=(0, 0), scale=1, blue_region=None):
    words = []
    for row in csv.DictReader(io.StringIO(tsv), delimiter="\t"):
        if row.get("level") != "5" or not row.get("text", "").strip() or float(row["conf"]) < 60:
            continue
        words.append({"text": row["text"].strip(), "left": offset[0] + int(row["left"]) / scale,
                      "top": offset[1] + int(row["top"]) / scale, "width": int(row["width"]) / scale,
                      "height": int(row["height"]) / scale, "blue_region": blue_region})
    return words


def center(word):
    return word["left"] + word["width"] / 2, word["top"] + word["height"] / 2


def blue_regions(image):
    width, _height = image.size
    blue = {index for index, (red, green, value) in enumerate(image.getdata())
            if value >= 160 and red <= 120 and value - green >= 40 and value - red >= 60}
    regions = []
    while blue:
        seed = blue.pop()
        stack = [seed]
        min_x = max_x = seed % width
        min_y = max_y = seed // width
        count = 0
        while stack:
            pixel = stack.pop()
            x, y = pixel % width, pixel // width
            count += 1
            min_x, max_x = min(min_x, x), max(max_x, x)
            min_y, max_y = min(min_y, y), max(max_y, y)
            adjacent = [pixel - width, pixel + width]
            if x: adjacent.append(pixel - 1)
            if x + 1 < width: adjacent.append(pixel + 1)
            for candidate in adjacent:
                if candidate in blue:
                    blue.remove(candidate)
                    stack.append(candidate)
        if max_x - min_x >= 39 and max_y - min_y >= 15 and count >= (max_x - min_x + 1) * (max_y - min_y + 1) * 0.35:
            regions.append((min_x, min_y, max_x + 1, max_y + 1))
    if len(regions) > 8:
        raise RuntimeError("Too many highlighted surfaces for unambiguous Print identification")
    return regions


def identify_print_widgets(words):
    def matching(label): return [word for word in words if normalized(word["text"]) == label]
    cancel = matching("cancel")
    queue = [word for word in matching("atomqualification") if word.get("blue_region") is not None]
    if len(cancel) != 1 or len(queue) != 1:
        raise RuntimeError("Print requires one Cancel control and one visibly selected local queue")
    cancel, queue = cancel[0], queue[0]
    general = [word for word in matching("general") if word["top"] < queue["top"]]
    printer = [word for word in matching("printer") if word["top"] < queue["top"]]
    if not general or not printer or not any(word["top"] < min(row["top"] for row in general) for word in matching("print")):
        raise RuntimeError("Native Print title, General tab and Printer table were not identified")
    cancel_x, cancel_y = center(cancel)
    buttons = [word for word in matching("print") if center(word)[0] > cancel_x + 50
               and abs(center(word)[1] - cancel_y) <= max(12, cancel["height"])]
    if not buttons:
        raise RuntimeError("Print accept control does not share the native Cancel row")
    # Wayland's header contains the dialog title between Cancel and Print;
    # X11 puts the two controls together at the bottom. The rightmost match
    # on the Cancel row is the accept button in both observed GTK layouts.
    return {"cancel": cancel, "print": max(buttons, key=lambda word: center(word)[0]), "queue": queue}


def inspect_pixels(file, scratch):
    from PIL import Image, ImageOps
    def ocr(image_file, mode):
        completed = subprocess.run(["tesseract", str(image_file), "stdout", "--psm", str(mode), "tsv"],
                                   capture_output=True, text=True, timeout=10, check=True)
        return completed.stdout
    image = Image.open(file).convert("RGB")
    if image.size != (1440, 900):
        raise RuntimeError("Print pointer coordinates require the owned single 1440x900 compositor")
    words = parse_words(ocr(file, 11))
    # Tesseract misses white text on GTK's blue selection/accept background.
    # Analyze those connected pixel regions separately; retain their original
    # bounds so only a visibly selected queue can satisfy identification.
    with tempfile.TemporaryDirectory(prefix="print-ocr-", dir=scratch) as temporary:
        for index, region in enumerate(blue_regions(image)):
            crop = ImageOps.invert(ImageOps.grayscale(image.crop(region))).point(lambda value: 0 if value < 70 else 255)
            crop = crop.resize((crop.width * 2, crop.height * 2))
            cropped_file = Path(temporary) / f"highlight-{index}.png"
            crop.save(cropped_file)
            words.extend(parse_words(ocr(cropped_file, 7), region[:2], 2, region))
    return identify_print_widgets(words)


def click_compositor(point):
    from gi.repository import Gio, GLib
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    service = "org.gnome.Mutter.RemoteDesktop"
    root = Gio.DBusProxy.new_sync(bus, Gio.DBusProxyFlags.NONE, None, service, "/org/gnome/Mutter/RemoteDesktop", service, None)
    location = root.call_sync("CreateSession", None, Gio.DBusCallFlags.NONE, 10000, None).unpack()[0]
    session = Gio.DBusProxy.new_sync(bus, Gio.DBusProxyFlags.NONE, None, service, location, service + ".Session", None)
    def call(method, parameters=None):
        return session.call_sync(method, parameters, Gio.DBusCallFlags.NONE, 10000, None)
    try:
        call("Start")
        call("NotifyPointerMotionRelative", GLib.Variant("(dd)", (-20000.0, -20000.0)))
        time.sleep(0.1)
        call("NotifyPointerMotionRelative", GLib.Variant("(dd)", tuple(float(value) for value in point)))
        time.sleep(0.1)
        call("NotifyPointerButton", GLib.Variant("(ib)", (0x110, True)))
        call("NotifyPointerButton", GLib.Variant("(ib)", (0x110, False)))
    finally:
        call("Stop")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--action", choices=("cancel", "print"), required=True)
    args = parser.parse_args()
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.getuid() == 0:
        raise RuntimeError("Print automation requires an ordinary user on a disposable Actions VM")
    executable = Path(f"/proc/{args.pid}/exe").resolve(strict=True)
    if executable != Path("/opt/atom-planner/atom-desktop") or executable.stat().st_uid != 0:
        raise RuntimeError("Only the installed qualification app may be operated")
    scratch = Path(os.environ["ATOM_NATIVE_SURFACE_ROOT"]).resolve(strict=True)
    if scratch.parent != Path("/tmp") or not scratch.name.startswith("atom-native-surfaces-") or scratch.stat().st_uid != os.getuid() or scratch.stat().st_mode & 0o777 != 0o700:
        raise RuntimeError("Unexpected owned Print qualification directory")
    output = Path(os.environ["GITHUB_WORKSPACE"]).resolve() / "desktop/test-results" / f"native-print-{args.action}.png"
    deadline = time.monotonic() + 35
    widgets = None
    last_error = "Native Print has not appeared"
    while time.monotonic() < deadline:
        captured = subprocess.run(["/usr/bin/python3", str(Path(__file__).with_name("mutter-capture.py")), "--output", str(output)],
                                  capture_output=True, text=True, timeout=35)
        if captured.returncode:
            raise RuntimeError(f"Print compositor observation failed: {captured.stderr}")
        capture = json.loads(captured.stdout)
        try:
            widgets = inspect_pixels(output, scratch)
            break
        except RuntimeError as error:
            # Observation can precede GTK's asynchronously mapped dialog.
            # Wait for an unambiguous surface; input is never replayed.
            last_error = str(error)
            time.sleep(0.2)
    if widgets is None:
        raise RuntimeError(f"Native Print pixels did not become unambiguous: {last_error}")
    target = widgets[args.action]
    os.kill(args.pid, 0)
    click_compositor(center(target))
    print(json.dumps({"pid": args.pid, "title": "Print", "operation": args.action, "button": target["text"],
                      "method": "Observed compositor pixels, OCR bounds and real Mutter pointer click", "native_widgets_only": True,
                      "capture": capture, "widgets": widgets}))


if __name__ == "__main__":
    main()

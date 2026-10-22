#!/usr/bin/env python3
"""Render ATOM's Figma-exported SVGs and synchronize their web copies.

Requires librsvg's rsvg-convert; macOS ICNS generation also uses iconutil.
The validation-only --check path uses Python's standard library.
"""

import argparse
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "icon"
SIZES = (16, 20, 24, 32, 48, 64, 128, 192, 256, 512, 1024)
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)
VECTORS = (
    "icon.svg", "favicon.svg", "atom-mark.svg", "atom-mark-white.svg",
    "atom-mark-mono.svg", "atom-square.svg", "atom-macos.svg",
)
WEB_ASSETS = {
    "icon.svg": "icon.svg",
    "favicon.svg": "favicon.svg",
    "atom.ico": "favicon.ico",
    "png/apple-touch-icon.png": "apple-touch-icon.png",
}
WEB_DIRS = (ROOT / "frontend-react/public/icon", ROOT / "docs/icon")
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def png_size(data):
    require(data[:8] == PNG_MAGIC and data[12:16] == b"IHDR", "Invalid PNG")
    return struct.unpack(">II", data[16:24])


def validate_vectors():
    for name in VECTORS:
        root = ET.parse(ASSETS / name).getroot()
        require(root.tag == "{http://www.w3.org/2000/svg}svg", f"{name}: SVG root")
        view_box = [float(v) for v in root.attrib["viewBox"].split()]
        require(len(view_box) == 4 and view_box[2] == view_box[3] > 0,
                f"{name}: square scalable viewBox required")
        require(root.attrib.get("aria-label") == "ATOM", f"{name}: accessible name")
        require(root.attrib.get("role") == "img", f"{name}: image semantics")
        for element in root.iter():
            tag = element.tag.rsplit("}", 1)[-1]
            require(tag in {"svg", "g", "path", "rect", "circle", "title", "desc"},
                    f"{name}: unexpected element {tag}")
            for key, value in element.attrib.items():
                require(not key.lower().startswith("on") and "href" not in key.lower(),
                        f"{name}: external content or event handler")
                require("url(" not in value and "data:" not in value,
                        f"{name}: production vectors must be self-contained")


def render(source, size, output):
    subprocess.run([
        "rsvg-convert", "--width", str(size), "--height", str(size),
        str(ASSETS / source), "--output", str(output),
    ], check=True)
    require(png_size(output.read_bytes()) == (size, size), f"{output}: wrong dimensions")


def write_ico():
    images = [(size, (ASSETS / f"png/atom-{size}.png").read_bytes()) for size in ICO_SIZES]
    offset = 6 + 16 * len(images)
    directory, payloads = [], []
    for size, data in images:
        # A zero dimension in an ICO directory represents 256 pixels.
        directory.append(struct.pack("<BBBBHHII", size % 256, size % 256,
                                     0, 0, 1, 32, len(data), offset))
        payloads.append(data)
        offset += len(data)
    (ASSETS / "atom.ico").write_bytes(
        struct.pack("<HHH", 0, 1, len(images)) + b"".join(directory + payloads)
    )


def write_icns():
    if not shutil.which("iconutil"):
        print("ICNS preserved; rebuild it on macOS with iconutil after changing artwork.")
        return
    with tempfile.TemporaryDirectory(prefix="atom-icons-") as folder:
        iconset = Path(folder) / "atom.iconset"
        iconset.mkdir()
        for logical in (16, 32, 128, 256, 512):
            for scale in (1, 2):
                suffix = "@2x" if scale == 2 else ""
                render("atom-macos.svg", logical * scale,
                       iconset / f"icon_{logical}x{logical}{suffix}.png")
        subprocess.run(["iconutil", "--convert", "icns", "--output",
                        str(ASSETS / "atom.icns"), str(iconset)], check=True)


def validate_exports():
    for size in SIZES:
        require(png_size((ASSETS / f"png/atom-{size}.png").read_bytes()) == (size, size),
                f"Incorrect {size}px export")
    require(png_size((ASSETS / "png/apple-touch-icon.png").read_bytes()) == (180, 180),
            "Incorrect Apple touch icon dimensions")
    data = (ASSETS / "atom.ico").read_bytes()
    require(struct.unpack_from("<HHH", data) == (0, 1, len(ICO_SIZES)), "ICO header")
    end = 6 + 16 * len(ICO_SIZES)
    for i, size in enumerate(ICO_SIZES):
        w, h, _, _, planes, depth, length, offset = struct.unpack_from("<BBBBHHII", data, 6 + 16 * i)
        payload = data[offset:offset + length]
        require((w or 256, h or 256, planes, depth) == (size, size, 1, 32), "ICO directory")
        require(offset == end and png_size(payload) == (size, size), "ICO payload")
        require(payload == (ASSETS / f"png/atom-{size}.png").read_bytes(), "Stale ICO payload")
        end = offset + length
    require(end == len(data), "Trailing ICO data")
    icns = (ASSETS / "atom.icns").read_bytes()
    require(icns[:4] == b"icns" and struct.unpack(">I", icns[4:8])[0] == len(icns), "ICNS header")
    chunks, offset = set(), 8
    while offset < len(icns):
        kind, length = struct.unpack_from(">4sI", icns, offset)
        require(length >= 8 and offset + length <= len(icns), "ICNS chunk")
        chunks.add(kind)
        offset += length
    require(offset == len(icns) and b"ic10" in chunks, "ICNS must include 1024px artwork")
    for target in WEB_DIRS:
        for source, dest in WEB_ASSETS.items():
            require((ASSETS / source).read_bytes() == (target / dest).read_bytes(),
                    f"Stale web asset: {target / dest}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate committed assets without rendering")
    args = parser.parse_args()
    validate_vectors()
    if not args.check:
        require(shutil.which("rsvg-convert"), "Install librsvg to provide rsvg-convert")
        (ASSETS / "png").mkdir(exist_ok=True)
        for size in SIZES:
            render("favicon.svg" if size <= 24 else "icon.svg", size,
                   ASSETS / f"png/atom-{size}.png")
        render("atom-square.svg", 180, ASSETS / "png/apple-touch-icon.png")
        write_ico()
        write_icns()
        for target in WEB_DIRS:
            target.mkdir(parents=True, exist_ok=True)
            for source, dest in WEB_ASSETS.items():
                shutil.copyfile(ASSETS / source, target / dest)
    validate_exports()
    print(f"Verified {len(VECTORS)} SVG masters, {len(SIZES) + 1} PNGs, ICO, ICNS and both web copies.")


if __name__ == "__main__":
    main()

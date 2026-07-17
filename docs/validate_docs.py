#!/usr/bin/env python3
"""Validate static documentation links, anchors, assets, and OpenAPI syntax."""

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

import yaml


DOCS = Path(__file__).resolve().parent
ATTRIBUTES = {"a": "href", "img": "src", "link": "href", "script": "src", "source": "src"}


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []
        self.anchors = set()

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get("id"):
            self.anchors.add(values["id"])
        attribute = ATTRIBUTES.get(tag)
        if attribute and values.get(attribute):
            self.references.append(values[attribute])


def parse_page(path):
    parser = PageParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def main():
    pages = {
        path.resolve(): parse_page(path)
        for path in DOCS.rglob("*.html")
        if path.name != "reference-template.html"
    }
    errors = []
    for page, parser in pages.items():
        for reference in parser.references:
            parsed = urlsplit(reference)
            if parsed.scheme or parsed.netloc or reference.startswith(("mailto:", "data:")):
                continue
            target = page if not parsed.path else (page.parent / unquote(parsed.path)).resolve()
            if not target.exists():
                errors.append(f"{page.relative_to(DOCS)}: missing {reference}")
                continue
            if parsed.fragment and target.suffix.lower() == ".html":
                target_parser = pages.get(target)
                if target_parser is None or unquote(parsed.fragment) not in target_parser.anchors:
                    errors.append(f"{page.relative_to(DOCS)}: missing anchor {reference}")

    specification = yaml.safe_load((DOCS / "openapi.yaml").read_text(encoding="utf-8"))
    if specification.get("openapi") != "3.1.0" or not specification.get("paths"):
        errors.append("openapi.yaml: expected OpenAPI 3.1.0 with documented paths")

    if errors:
        raise SystemExit("\n".join(errors))
    print(f"documentation valid: {len(pages)} HTML pages and {len(specification['paths'])} API paths")


if __name__ == "__main__":
    main()

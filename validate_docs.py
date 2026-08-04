#!/usr/bin/env python3
"""Validate static documentation links, anchors, assets, and OpenAPI syntax."""

import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

import yaml


DOCS = Path(__file__).resolve().parent
ROOT = DOCS.parent
ATTRIBUTES = {"a": "href", "img": "src", "link": "href", "script": "src", "source": "src"}


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []
        self.anchors = set()
        self.search_indexes = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get("id"):
            self.anchors.add(values["id"])
        if "data-docs-search" in values:
            self.search_indexes.append(values.get("data-search-index"))
        attribute = ATTRIBUTES.get(tag)
        if attribute and values.get(attribute):
            self.references.append(values[attribute])


def parse_page(path):
    parser = PageParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def duplicate_asset_errors():
    hashes = {}
    errors = []
    for directory in (ROOT / "assets", DOCS / "assets"):
        if not directory.exists():
            continue
        for path in sorted(item for item in directory.rglob("*") if item.is_file()):
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            previous = hashes.get(digest)
            if previous is not None:
                errors.append(
                    f"duplicate asset content: {previous.relative_to(ROOT)} and {path.relative_to(ROOT)}"
                )
            else:
                hashes[digest] = path
    return errors


def main():
    pages = {
        path.resolve(): parse_page(path)
        for path in DOCS.rglob("*.html")
        if path.name != "reference-template.html"
    }
    errors = duplicate_asset_errors()
    for page, parser in pages.items():
        if parser.search_indexes != ["./search-index.json"]:
            errors.append(f"{page.relative_to(DOCS)}: expected one documentation search control")
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

    search_index = json.loads((DOCS / "search-index.json").read_text(encoding="utf-8"))
    search_documents = search_index.get("documents", [])
    indexed_pages = {
        urlsplit(item.get("url", "")).path.removeprefix("./")
        for item in search_documents
    }
    expected_pages = {path.name for path in pages}
    if search_index.get("version") != 1 or not search_documents:
        errors.append("search-index.json: expected a non-empty version 1 index")
    if missing_pages := sorted(expected_pages - indexed_pages):
        errors.append(f"search-index.json: missing pages {', '.join(missing_pages)}")
    for item in search_documents:
        if not all(isinstance(item.get(field), str) and item[field] for field in ("page", "title", "url")):
            errors.append("search-index.json: every document requires non-empty page, title, and url strings")
            break
        parsed = urlsplit(item["url"])
        target = (DOCS / parsed.path.removeprefix("./")).resolve()
        target_parser = pages.get(target)
        if target_parser is None:
            errors.append(f"search-index.json: missing target {item['url']}")
        elif parsed.fragment and unquote(parsed.fragment) not in target_parser.anchors:
            errors.append(f"search-index.json: missing anchor {item['url']}")

    if errors:
        raise SystemExit("\n".join(errors))
    print(f"documentation valid: {len(pages)} HTML pages and {len(specification['paths'])} API paths")


if __name__ == "__main__":
    main()

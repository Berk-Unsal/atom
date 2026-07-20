#!/usr/bin/env python3
"""Build a deterministic client-side search index from rendered documentation."""

import json
import re
from html.parser import HTMLParser
from pathlib import Path


DOCS = Path(__file__).resolve().parent
OUTPUT = DOCS / "search-index.json"
EXCLUDED_CONTAINERS = {"aside", "footer", "nav", "noscript", "script", "style", "svg"}
HEADING_TAGS = {"h1", "h2", "h3"}
WHITESPACE = re.compile(r"\s+")


def normalize(value):
    return WHITESPACE.sub(" ", value).strip()


class SearchPageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_main = False
        self.ignored_depth = 0
        self.in_title = False
        self.document_title = []
        self.page_title = ""
        self.heading_tag = ""
        self.heading_anchor = ""
        self.heading_text = []
        self.anchors_by_level = {}
        self.current_section = None
        self.sections = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "title":
            self.in_title = True
        if tag == "main":
            self.in_main = True
        if tag in EXCLUDED_CONTAINERS:
            self.ignored_depth += 1
            return
        if self.in_main and self.ignored_depth == 0 and tag in HEADING_TAGS:
            self._finish_section()
            self.heading_tag = tag
            self.heading_anchor = values.get("id", "")
            self.heading_text = []

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag in EXCLUDED_CONTAINERS:
            self.ignored_depth = max(0, self.ignored_depth - 1)
            return
        if tag == self.heading_tag:
            title = normalize(" ".join(self.heading_text))
            if title:
                if tag == "h1" and not self.page_title:
                    self.page_title = title
                level = int(tag[1])
                self.anchors_by_level = {
                    known_level: known_anchor
                    for known_level, known_anchor in self.anchors_by_level.items()
                    if known_level < level
                }
                if self.heading_anchor:
                    anchor = self.heading_anchor
                    self.anchors_by_level[level] = anchor
                else:
                    anchor = next(
                        (
                            self.anchors_by_level[known_level]
                            for known_level in range(level - 1, 0, -1)
                            if known_level in self.anchors_by_level
                        ),
                        "",
                    )
                self.current_section = {
                    "title": title,
                    "anchor": anchor,
                    "level": level,
                    "text": [],
                }
            self.heading_tag = ""
            self.heading_anchor = ""
            self.heading_text = []
        if tag == "main":
            self._finish_section()
            self.in_main = False

    def handle_data(self, data):
        if self.in_title:
            self.document_title.append(data)
        if not self.in_main or self.ignored_depth > 0:
            return
        if self.heading_tag:
            self.heading_text.append(data)
        elif self.current_section is not None:
            self.current_section["text"].append(data)

    def close(self):
        super().close()
        self._finish_section()

    def _finish_section(self):
        if self.current_section is None:
            return
        self.current_section["text"] = normalize(" ".join(self.current_section["text"]))[:2400]
        self.sections.append(self.current_section)
        self.current_section = None

    def resolved_page_title(self):
        title = normalize(" ".join(self.document_title)).removesuffix(" | A.T.O.M Documentation")
        if title == "A.T.O.M Documentation":
            return "Overview"
        return title or self.page_title


def build_index():
    documents = []
    for page in sorted(DOCS.glob("*.html")):
        parser = SearchPageParser()
        parser.feed(page.read_text(encoding="utf-8"))
        parser.close()
        page_title = parser.resolved_page_title()
        for section in parser.sections:
            anchor = f"#{section['anchor']}" if section["anchor"] else ""
            documents.append(
                {
                    "page": page_title,
                    "title": section["title"],
                    "url": f"./{page.name}{anchor}",
                    "text": section["text"],
                }
            )
    return {"version": 1, "documents": documents}


def main():
    OUTPUT.write_text(json.dumps(build_index(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

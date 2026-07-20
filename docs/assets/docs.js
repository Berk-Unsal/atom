(() => {
  const body = document.body;
  const navToggle = document.querySelector("[data-nav-toggle]");
  const siteNav = document.querySelector("[data-site-nav]");

  const closeNavigation = () => {
    body.classList.remove("nav-open");
    navToggle?.setAttribute("aria-expanded", "false");
  };

  navToggle?.addEventListener("click", () => {
    const willOpen = !body.classList.contains("nav-open");
    body.classList.toggle("nav-open", willOpen);
    navToggle.setAttribute("aria-expanded", String(willOpen));
  });

  siteNav?.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      closeNavigation();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && body.classList.contains("nav-open")) {
      closeNavigation();
      navToggle?.focus();
    }
  });

  const searchRoot = document.querySelector("[data-docs-search]");
  const searchInput = searchRoot?.querySelector("[data-search-input]");
  const searchPanel = searchRoot?.querySelector("[data-search-panel]");
  const searchStatus = searchRoot?.querySelector("[data-search-status]");
  const searchResults = searchRoot?.querySelector("[data-search-results]");
  const searchHints = searchRoot?.querySelector("[data-search-hints]");
  const searchShortcut = searchRoot?.querySelector("[data-search-shortcut]");

  if (searchRoot && searchInput && searchPanel && searchStatus && searchResults && searchHints) {
    const maximumResults = 8;
    let documents = null;
    let indexPromise = null;
    let indexFailed = false;
    let resultLinks = [];
    let activeResult = -1;

    const platform = navigator.userAgentData?.platform || navigator.platform || "";
    if (searchShortcut) {
      searchShortcut.textContent = /mac/i.test(platform) ? "⌘K" : "Ctrl K";
    }

    const normalizeSearchValue = (value) =>
      value
        .toLocaleLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const queryTokens = (query) =>
      normalizeSearchValue(query)
        .split(" ")
        .filter((token) => token.length > 0);

    const countOccurrences = (value, token) => {
      let count = 0;
      let offset = 0;
      while (count < 6) {
        const index = value.indexOf(token, offset);
        if (index < 0) {
          break;
        }
        count += 1;
        offset = index + Math.max(token.length, 1);
      }
      return count;
    };

    const rankDocuments = (query) => {
      const phrase = normalizeSearchValue(query);
      const tokens = queryTokens(query);
      if (!phrase || tokens.length === 0 || !documents) {
        return [];
      }

      return documents
        .map((document) => {
          const title = normalizeSearchValue(document.title || "");
          const page = normalizeSearchValue(document.page || "");
          const text = normalizeSearchValue(document.text || "");
          const searchable = `${title} ${page} ${text}`;
          if (!tokens.every((token) => searchable.includes(token))) {
            return null;
          }

          let score = 0;
          if (title === phrase) score += 500;
          if (title.startsWith(phrase)) score += 260;
          if (title.includes(phrase)) score += 180;
          if (page === phrase) score += 160;
          if (page.startsWith(phrase)) score += 100;
          if (page.includes(phrase)) score += 70;
          if (text.includes(phrase)) score += 35;
          tokens.forEach((token) => {
            score += countOccurrences(title, token) * 35;
            score += countOccurrences(page, token) * 16;
            score += countOccurrences(text, token) * 3;
          });
          return { document, score };
        })
        .filter(Boolean)
        .sort((left, right) =>
          right.score - left.score ||
          left.document.page.localeCompare(right.document.page) ||
          left.document.title.localeCompare(right.document.title),
        );
    };

    const snippetFor = (document, tokens) => {
      const source = (document.text || "").replace(/\s+/g, " ").trim();
      if (!source) {
        return `Open ${document.page} to read this section.`;
      }
      const normalized = source.toLocaleLowerCase();
      const indexes = tokens.map((token) => normalized.indexOf(token)).filter((index) => index >= 0);
      const firstMatch = indexes.length > 0 ? Math.min(...indexes) : 0;
      let start = Math.max(0, firstMatch - 62);
      let end = Math.min(source.length, start + 168);
      if (start > 0) {
        const nextSpace = source.indexOf(" ", start);
        start = nextSpace >= 0 && nextSpace < firstMatch ? nextSpace + 1 : start;
      }
      if (end < source.length) {
        const previousSpace = source.lastIndexOf(" ", end);
        end = previousSpace > start ? previousSpace : end;
      }
      return `${start > 0 ? "…" : ""}${source.slice(start, end)}${end < source.length ? "…" : ""}`;
    };

    const appendHighlightedText = (element, text, tokens) => {
      const lowerText = text.toLocaleLowerCase();
      let cursor = 0;
      while (cursor < text.length) {
        let nextIndex = -1;
        let nextToken = "";
        tokens.forEach((token) => {
          const index = lowerText.indexOf(token, cursor);
          if (index >= 0 && (nextIndex < 0 || index < nextIndex)) {
            nextIndex = index;
            nextToken = token;
          }
        });
        if (nextIndex < 0) {
          element.append(document.createTextNode(text.slice(cursor)));
          break;
        }
        if (nextIndex > cursor) {
          element.append(document.createTextNode(text.slice(cursor, nextIndex)));
        }
        const mark = document.createElement("mark");
        mark.textContent = text.slice(nextIndex, nextIndex + nextToken.length);
        element.append(mark);
        cursor = nextIndex + nextToken.length;
      }
    };

    const setPanelOpen = (open) => {
      searchPanel.hidden = !open;
      searchInput.setAttribute("aria-expanded", String(open));
      if (!open) {
        searchInput.removeAttribute("aria-activedescendant");
        activeResult = -1;
      }
    };

    const setActiveResult = (index, scroll = true) => {
      if (resultLinks.length === 0) {
        activeResult = -1;
        searchInput.removeAttribute("aria-activedescendant");
        return;
      }
      activeResult = (index + resultLinks.length) % resultLinks.length;
      resultLinks.forEach((link, linkIndex) => {
        const selected = linkIndex === activeResult;
        link.setAttribute("aria-selected", String(selected));
        if (selected) {
          searchInput.setAttribute("aria-activedescendant", link.id);
          if (scroll) {
            link.scrollIntoView({ block: "nearest" });
          }
        }
      });
    };

    const clearResults = () => {
      searchResults.replaceChildren();
      resultLinks = [];
      activeResult = -1;
      searchInput.removeAttribute("aria-activedescendant");
      searchHints.hidden = true;
    };

    const renderLoading = () => {
      clearResults();
      searchStatus.textContent = "Loading documentation index…";
      for (let index = 0; index < 3; index += 1) {
        const item = document.createElement("li");
        item.className = "docs-search-skeleton";
        item.setAttribute("aria-hidden", "true");
        item.append(document.createElement("span"), document.createElement("span"));
        searchResults.append(item);
      }
    };

    const renderSearch = () => {
      clearResults();
      const query = searchInput.value.trim();
      if (indexFailed) {
        searchStatus.textContent = "Search is unavailable. Browse with the navigation or refresh the page.";
        return;
      }
      if (!documents) {
        renderLoading();
        return;
      }
      if (query.length < 2) {
        searchStatus.textContent = "Type at least two characters to search titles, sections, and API terms.";
        return;
      }

      const ranked = rankDocuments(query);
      if (ranked.length === 0) {
        searchStatus.textContent = `No results for “${query}”. Try a page name, endpoint, or RF term.`;
        return;
      }

      const visibleResults = ranked.slice(0, maximumResults);
      searchStatus.textContent =
        ranked.length > maximumResults
          ? `Top ${maximumResults} of ${ranked.length} results for “${query}”`
          : `${ranked.length} ${ranked.length === 1 ? "result" : "results"} for “${query}”`;
      const tokens = queryTokens(query);
      visibleResults.forEach(({ document: record }, index) => {
        const item = document.createElement("li");
        item.setAttribute("role", "presentation");
        const link = document.createElement("a");
        link.className = "docs-search-result";
        link.href = record.url;
        link.id = `docs-search-result-${index}`;
        link.setAttribute("role", "option");
        link.setAttribute("aria-selected", "false");

        const heading = document.createElement("div");
        heading.className = "docs-search-result-heading";
        const title = document.createElement("strong");
        appendHighlightedText(title, record.title, tokens);
        const page = document.createElement("span");
        page.textContent = record.page;
        heading.append(title, page);

        const snippet = document.createElement("p");
        appendHighlightedText(snippet, snippetFor(record, tokens), tokens);
        link.append(heading, snippet);
        link.addEventListener("pointerenter", () => setActiveResult(index, false));
        link.addEventListener("click", () => setPanelOpen(false));
        item.append(link);
        searchResults.append(item);
      });
      resultLinks = [...searchResults.querySelectorAll(".docs-search-result")];
      searchHints.hidden = false;
      setActiveResult(0, false);
    };

    const loadIndex = () => {
      if (indexPromise) {
        return indexPromise;
      }
      const indexURL = searchRoot.dataset.searchIndex || "./search-index.json";
      indexPromise = fetch(indexURL, { cache: "force-cache" })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Search index returned ${response.status}`);
          }
          return response.json();
        })
        .then((payload) => {
          if (!Array.isArray(payload.documents)) {
            throw new Error("Search index has an invalid shape");
          }
          documents = payload.documents;
          indexFailed = false;
        })
        .catch(() => {
          documents = [];
          indexFailed = true;
        });
      return indexPromise;
    };

    const openSearch = () => {
      closeNavigation();
      setPanelOpen(true);
      if (!documents && !indexFailed) {
        renderLoading();
        loadIndex().then(renderSearch);
      } else {
        renderSearch();
      }
    };

    searchInput.addEventListener("focus", openSearch);
    searchInput.addEventListener("input", () => {
      setPanelOpen(true);
      renderSearch();
    });
    searchInput.addEventListener("search", renderSearch);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setPanelOpen(true);
        setActiveResult(activeResult + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setPanelOpen(true);
        setActiveResult(activeResult - 1);
      } else if (event.key === "Enter" && activeResult >= 0) {
        event.preventDefault();
        resultLinks[activeResult]?.click();
      } else if (event.key === "Escape" && !searchPanel.hidden) {
        event.preventDefault();
        setPanelOpen(false);
      }
    });

    document.addEventListener("pointerdown", (event) => {
      if (!searchRoot.contains(event.target)) {
        setPanelOpen(false);
      }
    });

    window.addEventListener("keydown", (event) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      const shortcut = (event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k";
      const slash = event.key === "/" && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (shortcut || slash) {
        event.preventDefault();
        searchInput.focus();
        openSearch();
      }
    });
  }

  document.querySelectorAll(".prose pre").forEach((pre) => {
    if (pre.closest(".code-block")) {
      return;
    }

    let block = pre.parentElement;
    if (!block?.classList.contains("sourceCode")) {
      block = document.createElement("div");
      pre.before(block);
      block.append(pre);
    }
    block.classList.add("code-block", "generated-code");

    const button = document.createElement("button");
    button.className = "copy-button";
    button.type = "button";
    button.dataset.copy = "";
    button.setAttribute("aria-label", "Copy code block");
    button.textContent = "Copy";
    block.prepend(button);
  });

  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const block = button.closest(".code-block");
      const code = block?.querySelector("code")?.textContent?.trim();
      if (!code) {
        return;
      }

      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "Copied";
      } catch {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(block.querySelector("code"));
        selection.removeAllRanges();
        selection.addRange(range);
        button.textContent = "Selected";
      }

      window.setTimeout(() => {
        button.textContent = "Copy";
      }, 1600);
    });
  });

  const tocLinks = [...document.querySelectorAll(".page-toc a[href^='#']")];
  const sections = tocLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length > 0) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
        if (!visible) {
          return;
        }
        tocLinks.forEach((link) => {
          link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`);
        });
      },
      { rootMargin: "-22% 0px -66%", threshold: [0, 0.1] },
    );
    sections.forEach((section) => observer.observe(section));
  }

  const year = document.querySelector("[data-current-year]");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
})();

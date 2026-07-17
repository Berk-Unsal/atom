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

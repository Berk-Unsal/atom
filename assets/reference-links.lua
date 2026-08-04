local first_title_removed = false

local page_routes = {
  ["api.md"] = "api.html",
  ["algorithms.md"] = "algorithms.html",
  ["features.md"] = "features.html",
  ["visualization.md"] = "visualization.html",
  ["deployment.md"] = "deployment.html",
  ["faq.md"] = "faq.html",
  ["contributing.md"] = "contributing.html",
  ["CONTRIBUTING.md"] = "contributing.html",
  ["modeling-limits.md"] = "modeling-limits.html",
  ["architecture.md"] = "architecture.html",
  ["getting-started.md"] = "download.html",
  ["index.md"] = "index.html",
}

function Header(element)
  if not first_title_removed and element.level == 1 then
    first_title_removed = true
    return {}
  end
end

function Link(element)
  local path, suffix = element.target:match("^([^#?]+)(.*)$")
  if not path then
    return element
  end

  local bare_path = path:gsub("^%./", "")
  local route = page_routes[bare_path]
  if route then
    element.target = "./" .. route .. suffix
    return element
  end

  if path:match("%.md$") and not path:match("^https?://") then
    return element.content
  end

  return element
end

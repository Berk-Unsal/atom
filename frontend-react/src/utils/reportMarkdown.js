import { reportMarkdownText as text } from "./reportFormatting.js";

function table(headers, rows) {
  if (!rows.length) return "";
  return `| ${headers.map(text).join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${rows.map((row) => `| ${row.map(text).join(" | ")} |`).join("\n")}`;
}

function assetLink(label, filename) {
  // Review packages contain local sibling assets; standalone exports never invent links.
  return typeof filename === "string" && /^[a-z0-9][a-z0-9._-]*$/i.test(filename) ? `[${label}](${encodeURIComponent(filename)})` : "";
}

function renderBlock(block, options) {
  switch (block.type) {
    case "paragraph": return text(block.text);
    case "heading": return `### ${text(block.text)}`;
    case "list": return block.items.map((item) => `- ${text(item)}`).join("\n");
    case "completeness": return block.entries.map((entry) => `**${text(entry.label)}:** ${text(entry.status)}${entry.reason && entry.state === "unavailable" ? ` (${text(entry.reason)})` : ""}`).join(" · ");
    case "kpis": return table(["Metric", "Result"], block.metrics.map((metric) => [metric.label, `${metric.display}${metric.qualifier ? ` ${metric.qualifier}` : ""}`]));
    case "table": return `${table(block.headers, block.rows)}${block.caption ? `\n\n${text(block.caption)}` : ""}`;
    case "profileGroups": return block.groups.map((group) => `### ${text(group.title)}\n\n${table(block.showScope ? ["Parameter", "Value", "Applies to"] : ["Parameter", "Value"], group.rows.map((row) => block.showScope ? row : row.slice(0, 2)))}`).join("\n\n");
    case "figure": {
      const links = block.kind === "planning-map" ? [assetLink("HTML report", options.assetLinks?.html), assetLink("Map asset", options.assetLinks?.map)].filter(Boolean) : [];
      return [links.length ? `Companion files: ${links.join(" · ")}.` : block.markdownNote, text(block.caption)].filter(Boolean).join("\n\n");
    }
    default: throw new Error(`Unsupported report content: ${block.type}`);
  }
}

export function renderReportMarkdown(model, options = {}) {
  const identity = model.identity;
  return `# ${text(identity.title)}

${text(identity.scenarioName)} · ${text(model.isNetworkReport ? "Network planning" : "Single-cell RF planning")}

Project: ${text(identity.projectName)}

Source: ${text(identity.lineage)}

Context: ${text(identity.context)}

Generated: ${identity.generatedAt}

${model.sections.map((section) => `## ${text(section.title)}\n\n${section.blocks.map((block) => renderBlock(block, options)).filter(Boolean).join("\n\n")}`).join("\n\n")}
`;
}

import { escapeHtml as html } from "./reportFormatting.js";

function cssString(value) {
  return String(value).replace(/[\\"<>\r\n\f\0]/g, (character) => `\\${character.codePointAt(0).toString(16)} `);
}

function renderTable(block) {
  if (block.kind === "cells" && block.rows.some((row) => String(row[1]).length > 36)) {
    return `<div class="cell-records">${block.rows.map((row) => `<div class="cell-record"><h3>${html(`#${row[0]} · Cell ${row[1]}`)}</h3><dl>${block.headers.slice(2).map((header, index) => `<div><dt>${html(header)}</dt><dd>${html(row[index + 2])}</dd></div>`).join("")}</dl></div>`).join("")}${block.caption ? `<p class="table-note">${html(block.caption)}</p>` : ""}</div>`;
  }
  if (block.kind === "deviations") {
    const groups = new Map();
    for (const row of block.rows) {
      const key = String(row[1]);
      if (!groups.has(key)) groups.set(key, { number: row[0], rows: [] });
      groups.get(key).rows.push(row.slice(2));
    }
    return `<div class="deviations">${[...groups].map(([id, group], index) => `<div class="deviation-record${group.rows.length <= 16 ? " short-record" : ""}">${index === 0 && block.heading ? `<h3>${html(block.heading)}</h3>` : ""}<h4>${html(`#${group.number} · Cell ${id}`)}</h4>${renderTable({ headers: block.headers.slice(2), rows: group.rows })}</div>`).join("")}${block.caption ? `<p class="table-note">${html(block.caption)}</p>` : ""}</div>`;
  }
  const idColumns = block.headers.map((header, i) => /^(Cell|Serving Cell)$/i.test(header) ? i : -1);
  return `<div class="report-table-wrap${block.rows.length <= 16 ? " short-table" : ""}" tabindex="0" role="group" aria-label="${html(block.headers.join(" / "))}"><table class="${html(block.kind ?? "")}">${block.caption ? `<caption>${html(block.caption)}</caption>` : ""}<thead><tr>${block.headers.map((header) => `<th scope="col">${html(header)}</th>`).join("")}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((value, i) => `<td${idColumns.includes(i) ? ' class="cell-id"' : ""}>${html(value ?? "Not recorded")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderProfileGroups(block) {
  const groupHtml = (group) => `<div class="profile-group"><h3>${html(group.title)}</h3>${renderTable({ headers: block.showScope ? ["Parameter", "Value", "Applies to"] : ["Parameter", "Value"], rows: group.rows.map((row) => block.showScope ? row : row.slice(0, 2)) })}</div>`;
  // Keep related field groups together in two balanced columns on portrait paper.
  const columns = [block.groups.filter((_, i) => i === 0 || i === 2), block.groups.filter((_, i) => i !== 0 && i !== 2)];
  return `<div class="profile-groups">${columns.map((groups) => `<div class="profile-column">${groups.map(groupHtml).join("")}</div>`).join("")}</div>`;
}

function renderSection(section) {
  const heading = `<h2>${html(section.title)}</h2>`;
  const lead = section.blocks[0]?.type === "paragraph";
  return `<section data-report-section="${html(section.id)}" class="${section.pageStart ? "page-start " : ""}${section.appendix ? "appendix" : ""}">${lead ? `<div class="section-lead">${heading}${renderBlock(section.blocks[0])}</div>` : heading}${renderBlocks(section.blocks.slice(lead ? 1 : 0))}</section>`;
}

function renderBlocks(blocks) {
  const output = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type === "heading" && blocks[i + 1]?.type === "table" && blocks[i + 1].kind === "deviations") {
      output.push(renderTable({ ...blocks[i + 1], heading: blocks[i].text }));
      i++;
    } else output.push(renderBlock(blocks[i]));
  }
  return output.join("\n");
}

function renderBlock(block) {
  switch (block.type) {
    case "paragraph": return `<p${block.kind ? ` class="${html(block.kind)}"` : ""}>${html(block.text)}</p>`;
    case "heading": return `<h3>${html(block.text)}</h3>`;
    case "list": return `<ul>${block.items.map((item) => `<li>${html(item)}</li>`).join("")}</ul>`;
    case "completeness": return `<dl class="completeness" aria-label="Evaluation completeness">${block.entries.map((entry) => `<div data-evaluation="${html(entry.id)}" data-state="${html(entry.state)}"><dt>${html(entry.label)}</dt><dd>${html(entry.status)}${entry.reason && entry.state === "unavailable" ? ` · ${html(entry.reason)}` : ""}</dd></div>`).join("")}</dl>`;
    case "kpis": return `<dl class="kpis" aria-label="Primary results">${block.metrics.map((metric) => `<div data-metric="${html(metric.id)}"><dt>${html(metric.label)}</dt><dd>${html(metric.display)}${metric.qualifier ? `<small>${html(metric.qualifier)}</small>` : ""}</dd></div>`).join("")}</dl>`;
    case "table": return renderTable(block);
    case "profileGroups": return renderProfileGroups(block);
    case "figure": return block.svg ? `<figure class="report-figure ${html(block.kind)}"><div class="map-wrap">${block.svg}</div><figcaption>${html(block.caption)}</figcaption></figure>` : `<p class="figure-unavailable">${html(block.caption)}</p>`;
    default: throw new Error(`Unsupported report content: ${block.type}`);
  }
}

export function renderReportHtml(model, options = {}) {
  const identity = model.identity;
  const chrome = `${Array.from(identity.scenarioName).slice(0, 42).join("")}${identity.scenarioName.length > 42 ? "…" : ""} · ${identity.versionLabel}`;
  const filename = options.filename ?? identity.filename;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="${html(identity.generatorVersion)}" />
<title>${html(filename.replace(/\.[a-z]+$/i, ""))}</title>
<style>
  :root { color-scheme: light; color: #172b25; background: #edf1ef; font-family: Arial, Helvetica, sans-serif; font-synthesis: none; }
  * { box-sizing: border-box; }
  body { margin: 0; font-size: 11pt; line-height: 1.5; }
  ::selection { color: #fff; background: #205843; }
  main { max-width: 940px; margin: 28px auto; padding: 44px 52px; background: #fff; }
  .actions { max-width: 940px; margin: 20px auto 0; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 0 16px; }
  .actions p { color: #344b42; font-size: 10pt; margin: 0; }
  .actions button { padding: 10px 16px; font: inherit; font-weight: 700; color: #fff; background: #205843; border: 1px solid #205843; cursor: pointer; white-space: nowrap; }
  .actions button:hover { background: #153e2e; }
  .actions button:focus-visible { outline: 3px solid #426d97; outline-offset: 3px; }
  .report-header { border-top: 3px solid #205843; padding-top: 20px; padding-bottom: 22px; }
  h1 { font-size: 23pt; line-height: 1.15; letter-spacing: -0.02em; margin: 0 0 14px; font-weight: 700; }
  .scenario { font-size: 16pt; line-height: 1.3; color: #205843; margin: 0 0 10px; overflow-wrap: anywhere; }
  .identity { margin: 3px 0; font-size: 10pt; color: #344b42; overflow-wrap: anywhere; }
  section { padding: 24px 0 4px; border-top: 1px solid #bdcbc4; }
  h2 { font-size: 15pt; line-height: 1.2; margin: 0 0 18px; letter-spacing: -0.01em; }
  h3 { font-size: 11pt; line-height: 1.3; margin: 25px 0 10px; }
  h4 { font-size: 10pt; margin: 18px 0 8px; overflow-wrap: normal; }
  p { margin: 0 0 13px; }
  ul { margin: 8px 0 18px; padding-left: 20px; }
  li { margin: 0 0 6px; }
  .completeness { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; margin: 15px 0 22px; font-size: 9.5pt; }
  .completeness div { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 9px; }
  .completeness dt { color: #344b42; }
  .completeness dd { margin: 0; padding: 1px 5px; background: #f1f4f2; color: #172b25; font-weight: 700; }
  .kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 22px; margin: 0 0 24px; font-variant-numeric: tabular-nums; }
  .kpis div { border-top: 1px solid #8fa69a; padding: 12px 0 17px; }
  .kpis dt { font-size: 9.5pt; color: #344b42; min-height: 2.8em; max-width: 24ch; }
  .kpis dd { margin: 2px 0 0; font-size: 20pt; font-weight: 700; line-height: 1.2; }
  .kpis dd:last-child { overflow-wrap: normal; }
  .kpis small { display: block; font-size: 8.5pt; font-weight: 400; line-height: 1.45; color: #344b42; }
  .interpretation { font-size: 11.5pt; line-height: 1.55; max-width: 75ch; }
  .score-meaning, .planning-note, .evidence-note { font-size: 9.5pt; color: #344b42; }
  .constraint-failed { color: #8c2435; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10pt; margin: 0 0 18px; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; vertical-align: top; padding: 7px 8px; border-bottom: 1px solid #d8e1dc; overflow-wrap: anywhere; }
  th { font-size: 9pt; color: #263e33; font-weight: 700; border-top: 1px solid #8fa69a; border-bottom: 1px solid #8fa69a; background: #f4f6f4; }
  th:first-child, td:first-child { padding-left: 0; }
  th:last-child, td:last-child { padding-right: 0; }
  caption { caption-side: bottom; text-align: left; margin: 8px 0 4px; font-size: 9pt; color: #344b42; }
  .report-table-wrap:focus-visible { outline: 2px solid #426d97; outline-offset: 3px; }
  .table-note, figcaption { font-size: 9pt; color: #344b42; line-height: 1.45; margin: 8px 0 18px; }
  .cell-id { white-space: nowrap; overflow-wrap: normal; word-break: normal; }
  table.cells th:first-child { width: 7%; }
  table.cells th:nth-child(2) { width: 49%; }
  table.cells th:last-child { width: 24%; }
  .cell-record { margin-bottom: 15px; }
  .cell-record h3 { font-size: 10pt; margin: 18px 0 8px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .cell-record dl { margin: 0; font-size: 9.5pt; }
  .cell-record dl div { display: flex; gap: 10px; }
  .cell-record dd { margin: 0; }
  .report-figure { margin: 0 0 16px; }
  .map-wrap { border: 1px solid #bdcbc4; background: #f8faf9; }
  .map-wrap svg { display: block; width: 100%; height: auto; }
  .profile-scope { font-weight: 700; }
  .profile-groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; margin-bottom: 15px; }
  .profile-group { min-width: 0; break-inside: avoid; }
  .profile-group h3 { margin-top: 12px; }
  .profile-group table { font-size: 9.5pt; }
  .profile-group th, .profile-group td { padding-top: 5px; padding-bottom: 5px; }
  .profile-group th:first-child { width: 48%; }
  .appendix { font-size: 10pt; }
  .appendix table { font-size: 9pt; }
  .appendix th, .appendix td { padding-top: 5px; padding-bottom: 5px; }
  .appendix h3 { margin-top: 26px; }
  @page {
    size: A4 portrait;
    margin: 18mm 15mm;
    @top-left { content: "A.T.O.M · Planning report"; font-family: Arial, sans-serif; font-size: 8pt; color: #344b42; }
    @top-right { content: "${cssString(chrome)}"; font-family: Arial, sans-serif; font-size: 7.5pt; color: #344b42; }
    @bottom-left { content: "Generated ${cssString(identity.generatedAt)}"; font-family: Arial, sans-serif; font-size: 8pt; color: #344b42; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font-family: Arial, sans-serif; font-size: 8pt; color: #344b42; }
  }
  @media print {
    :root, body { background: #fff; }
    body { font-size: 10.5pt; }
    main { width: auto; max-width: none; margin: 0; padding: 0; }
    .actions { display: none; }
    .page-start { break-before: page; }
    section { padding-top: 18px; break-inside: auto; }
    h1, h2, h3, h4 { break-after: avoid; }
    .section-lead { break-inside: avoid; }
    .section-lead:not(:last-child) { break-after: avoid; }
    .profile-scope { break-after: avoid; }
    .profile-groups { break-inside: avoid; }
    section[data-report-section="limitations"] { break-inside: avoid; }
    p, li { orphans: 3; widows: 3; }
    p { margin-bottom: 10px; }
    table { margin-bottom: 14px; }
    th, td { padding-top: 5px; padding-bottom: 5px; }
    caption { caption-side: top; margin: 0 0 8px; break-after: avoid; break-inside: avoid; }
    thead { display: table-header-group; break-after: avoid; }
    tbody tr:first-child { break-before: avoid; }
    .short-table, .short-record { break-inside: avoid; }
    tr, .kpis div, .profile-group, .cell-record { break-inside: avoid; }
    .report-figure { break-inside: avoid; }
    .report-table-wrap { overflow: visible; }
    th { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .map-wrap { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }
  @media screen and (max-width: 720px) {
    main { margin: 0; padding: 26px 20px; }
    .actions { margin: 0; padding: 14px 20px; align-items: flex-start; }
    h1 { font-size: 20pt; }
    .scenario { font-size: 14pt; }
    .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }
    .kpis dd { font-size: 18pt; }
    .completeness { grid-template-columns: 1fr; }
    .profile-groups { grid-template-columns: 1fr; }
    .report-table-wrap { overflow-x: auto; }
    .cell-record h3 { white-space: normal; }
    table.cells { min-width: 480px; }
  }
</style>
</head>
<body>
<aside class="actions" aria-label="Print settings"><p>For a clean PDF, use A4 portrait and turn off browser headers and footers.</p><button type="button" onclick="window.print()">Save as PDF</button></aside>
<main>
<header class="report-header">
  <h1>${html(identity.title)}</h1>
  <p class="scenario">${html(identity.scenarioName)}</p>
  <p class="identity">Project: ${html(identity.projectName)}</p>
  <p class="identity">${html(identity.lineage)}</p>
  <p class="identity">${html(identity.context)} · Generated <time datetime="${html(identity.generatedInstant ?? "")}">${html(identity.generatedAt)}</time></p>
</header>
${model.sections.map(renderSection).join("\n")}
</main>
</body>
</html>`;
}

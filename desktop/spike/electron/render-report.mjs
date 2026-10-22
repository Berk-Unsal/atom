// Renders shared report HTML with the frontend's own report code and fixtures
// (the same inputs as frontend-react/e2e/report.spec.js), so the print check
// exercises real report output rather than a desktop-specific template.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildPlanningReport, renderHtmlReport } from "../../../frontend-react/src/utils/reportExport.js";
import { reportInputs } from "../../../frontend-react/src/test/fixtures/reportFixtures.js";

const out = resolve(process.argv[2] || "build/reports");
mkdirSync(out, { recursive: true });
const cases = {
  "eight-cells": {},
  "eight-cells-long-identities": { longIds: true, longScenario: true, extendedAppendix: true },
};
for (const [name, options] of Object.entries(cases)) {
  const inputs = reportInputs(options);
  // Turkish project naming is part of the D01 print matrix.
  inputs.project = { ...inputs.project, name: "Çankaya İş Ağı Şebeke Öğrenim Üssü" };
  inputs.sourceContext = { ...inputs.sourceContext, project_name: inputs.project.name };
  writeFileSync(resolve(out, `${name}.html`), renderHtmlReport(buildPlanningReport(inputs)));
}
console.log(out);

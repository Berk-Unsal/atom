const MAX_PART_LENGTH = 40;

function slug(value, maximum = MAX_PART_LENGTH) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maximum)
    .replace(/-+$/g, "");
}

function datePart(value) {
  const date = value instanceof Date ? value : new Date(value ?? Number.NaN);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * `<project>-<scenario>-v<N>-<yyyymmdd>[-<kind>].<extension>` with filesystem-safe slugs. Missing parts are
 * omitted; the date is UTC so a given artifact always gets the same name.
 */
export function downloadFilename({ project, scenario, version, date, kind, extension, mode, time = false } = {}) {
  const versionNumber = Number(version);
  const projectSlug = slug(project);
  const scenarioSlug = slug(scenario);
  const instant = date instanceof Date ? date : new Date(date ?? Number.NaN);
  const parts = [
    projectSlug,
    slug(scenario, Infinity) === slug(project, Infinity) ? "" : scenarioSlug,
    Number.isSafeInteger(versionNumber) && versionNumber > 0 ? `v${versionNumber}` : "",
    datePart(date),
    time && !Number.isNaN(instant.getTime()) ? `${instant.toISOString().slice(11, 19).replaceAll(":", "")}z` : "",
    slug(mode),
    slug(kind),
  ].filter(Boolean);
  return `${parts.join("-") || "atom"}.${extension}`;
}

/** One human-facing stem for new report formats and their review-package companions. */
export function reportFilename({ kind = "report", ...options } = {}) {
  const bounded = { ...options, project: options.project || (!options.scenario ? "atom" : null) };
  let filename = downloadFilename({ ...bounded, kind, time: true });
  // Reserve the UTC, mode and kind suffix; reduce only human-name parts if necessary.
  while (filename.length > 180 && (String(bounded.project ?? "").length || String(bounded.scenario ?? "").length)) {
    const key = slug(bounded.project).length >= slug(bounded.scenario).length ? "project" : "scenario";
    bounded[key] = slug(bounded[key]).slice(0, -1);
    filename = downloadFilename({ ...bounded, kind, time: true });
  }
  return filename;
}

/** Project, scenario and Version names for files derived from a project and an optional source Version. */
export function namingForSource(project, scenarioId, revisionId) {
  const scenario = (project?.scenarios ?? []).find((candidate) => (
    String(candidate.domain?.scenario_id ?? candidate.id) === String(scenarioId)
  )) ?? null;
  const revision = revisionId
    ? scenario?.domain?.revisions?.find((candidate) => String(candidate.scenario_revision_id) === String(revisionId))
    : null;
  return {
    project: project?.name ?? null,
    scenario: scenario?.name ?? null,
    version: revision?.revision ?? null,
  };
}

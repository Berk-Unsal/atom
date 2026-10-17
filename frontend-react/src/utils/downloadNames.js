const MAX_PART_LENGTH = 40;

function slug(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_PART_LENGTH)
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
export function downloadFilename({ project, scenario, version, date, kind, extension } = {}) {
  const versionNumber = Number(version);
  const parts = [
    slug(project),
    slug(scenario),
    Number.isInteger(versionNumber) && versionNumber > 0 ? `v${versionNumber}` : "",
    datePart(date),
    slug(kind),
  ].filter(Boolean);
  return `${parts.join("-") || "atom"}.${extension}`;
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

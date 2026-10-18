import { describe, expect, it } from "vitest";
import { candidatePrerequisites, candidatePrerequisitesMet } from "./candidatePrerequisites.js";

describe("candidate recommendation prerequisites", () => {
  it.each([
    [{ selectedCount: 1, hasSearchArea: true }, ["cells"], /Select at least 2 Cells/],
    [{ selectedCount: 7, hasSearchArea: true }, ["cells"], /Deselect 2 Cells; recommendations accept at most 5/],
    [{ selectedCount: 3, hasSearchArea: false }, ["area"], /your selected Cells stay as they are/],
    [{ selectedCount: 3, hasSearchArea: true, technologySupported: false }, ["technology"], /4G LTE or 5G mmWave/],
  ])("explains how to satisfy each unmet prerequisite for %j", (input, unmet, hint) => {
    const prerequisites = candidatePrerequisites({ maxCells: 5, technologySupported: true, ...input });
    expect(prerequisites.filter((prerequisite) => !prerequisite.met).map((prerequisite) => prerequisite.id)).toEqual(unmet);
    expect(prerequisites.find((prerequisite) => !prerequisite.met).hint).toMatch(hint);
    expect(candidatePrerequisitesMet(prerequisites)).toBe(false);
  });

  it("is ready with 2–5 Cells, a search area and a 4G/5G plan", () => {
    const prerequisites = candidatePrerequisites({ selectedCount: 5, maxCells: 5, hasSearchArea: true, technologySupported: true });
    expect(candidatePrerequisitesMet(prerequisites)).toBe(true);
    expect(prerequisites[0].label).toBe("2–5 selected Cells (5 selected)");
  });
});

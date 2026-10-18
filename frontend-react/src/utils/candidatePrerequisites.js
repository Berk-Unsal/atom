// Prerequisites for candidate Cell recommendation, shown before the action is attempted.

export function candidatePrerequisites({ selectedCount = 0, maxCells, hasSearchArea = false, technologySupported = true } = {}) {
  const tooMany = selectedCount > maxCells;
  return [
    {
      id: "cells",
      met: selectedCount >= 2 && !tooMany,
      label: `2–${maxCells} selected Cells (${selectedCount} selected)`,
      hint: tooMany
        ? `Deselect ${selectedCount - maxCells} Cell${selectedCount - maxCells === 1 ? "" : "s"}; recommendations accept at most ${maxCells}.`
        : "Select at least 2 Cells in Network mode.",
    },
    {
      id: "area",
      met: Boolean(hasSearchArea),
      label: "Search area drawn",
      hint: "Draw a search area on the map; your selected Cells stay as they are.",
    },
    {
      id: "technology",
      met: Boolean(technologySupported),
      label: "4G or 5G plan",
      hint: "Switch Network technology to 4G LTE or 5G mmWave.",
    },
  ];
}

export function candidatePrerequisitesMet(prerequisites) {
  return prerequisites.every((prerequisite) => prerequisite.met);
}

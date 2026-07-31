import { Scale, SlidersHorizontal } from "lucide-react";
import { OPTIMIZATION_OBJECTIVES } from "../utils/optimizationConfig.js";

const CONSTRAINTS = [
  { id: "min_coverage_score", label: "Minimum coverage score", step: 100, suffix: "score" },
  { id: "min_unique_demand_buildings", label: "Minimum demand buildings", step: 1, suffix: "buildings" },
  { id: "min_unique_residential_buildings", label: "Minimum residential buildings", step: 1, suffix: "buildings" },
  { id: "max_overlap_buildings", label: "Maximum overlap", step: 1, suffix: "buildings" },
];

export default function OptimizationGoalsPanel({ config, onChange }) {
  const activeObjectives = new Map((config?.objectives ?? []).map((objective) => [objective.id, objective]));
  const updateObjective = (id, enabled, weight) => {
    let objectives = [...(config?.objectives ?? [])];
    const currentIndex = objectives.findIndex((objective) => objective.id === id);
    if (!enabled && currentIndex >= 0 && objectives.length > 1) objectives.splice(currentIndex, 1);
    if (enabled && currentIndex < 0) objectives.push({ id, weight: 1 });
    if (enabled && currentIndex >= 0 && weight !== undefined) {
      objectives[currentIndex] = { ...objectives[currentIndex], weight: Number(weight) };
    }
    onChange({ ...config, objectives });
  };
  const updateConstraint = (id, rawValue) => {
    const constraints = { ...(config?.constraints ?? {}) };
    if (rawValue === "") delete constraints[id];
    else constraints[id] = Number(rawValue);
    onChange({ ...config, constraints });
  };

  return (
    <section className="optimization-goals" aria-label="Network optimization goals">
      <div className="panel-title"><Scale size={16} /><span>Optimization goals</span></div>
      <p className="data-note">Select trade-offs and hard feasibility limits. This release searches per-cell azimuths and returns the non-dominated evaluated sets.</p>
      <div className="optimization-objectives">
        {OPTIMIZATION_OBJECTIVES.map((objective) => {
          const active = activeObjectives.get(objective.id);
          return (
            <div className={`optimization-objective ${active ? "active" : ""}`} key={objective.id}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(active)}
                  disabled={Boolean(active) && activeObjectives.size === 1}
                  onChange={(event) => updateObjective(objective.id, event.target.checked)}
                />
                <span><strong>{objective.label}</strong><small>{objective.direction}</small></span>
              </label>
              <input
                aria-label={`${objective.label} weight`}
                type="number"
                min="0.01"
                max="100"
                step="0.25"
                value={active?.weight ?? 1}
                disabled={!active}
                onChange={(event) => updateObjective(objective.id, true, event.target.value)}
              />
              <p>{objective.description}</p>
            </div>
          );
        })}
      </div>
      <details className="advanced-settings optimization-constraints">
        <summary><SlidersHorizontal size={14} /> Feasibility constraints</summary>
        {CONSTRAINTS.map((constraint) => (
          <label className="input-row" key={constraint.id}>
            <span className="input-label">{constraint.label}</span>
            <span className="number-wrap">
              <input
                type="number"
                min="0"
                step={constraint.step}
                placeholder="Not set"
                value={config?.constraints?.[constraint.id] ?? ""}
                onChange={(event) => updateConstraint(constraint.id, event.target.value)}
              />
              <small>{constraint.suffix}</small>
            </span>
          </label>
        ))}
      </details>
    </section>
  );
}

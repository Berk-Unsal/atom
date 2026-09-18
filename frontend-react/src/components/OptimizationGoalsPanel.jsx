import { Scale, SlidersHorizontal } from "lucide-react";
import { OPTIMIZATION_OBJECTIVES, optimizationConfigValidationMessage } from "../utils/optimizationConfig.js";

const CONSTRAINTS = [
  { id: "min_coverage_score", label: "Minimum propagation reach", step: 100, suffix: "score" },
  { id: "min_unique_demand_buildings", label: "Minimum demand buildings", step: 1, suffix: "buildings" },
  { id: "min_unique_residential_buildings", label: "Minimum residential buildings", step: 1, suffix: "buildings" },
  { id: "max_overlap_buildings", label: "Maximum overlap", step: 1, suffix: "buildings" },
];

export default function OptimizationGoalsPanel({ config, onChange }) {
  const objectives = new Map((config?.objectives ?? []).map((objective) => [objective.id, objective]));
  const priorityError = optimizationConfigValidationMessage(config);
  const updateObjective = (id, value) => {
    const nextObjectives = OPTIMIZATION_OBJECTIVES.map((objective) => ({
      id: objective.id,
      weight: objective.id === id ? Number(value) : Number(objectives.get(objective.id)?.weight ?? 0),
    }));
    onChange({ ...config, objectives: nextObjectives });
  };
  const updateConstraint = (id, rawValue) => {
    const constraints = { ...(config?.constraints ?? {}) };
    if (rawValue === "") delete constraints[id];
    else constraints[id] = Number(rawValue);
    onChange({ ...config, constraints });
  };

  return (
    <section className="optimization-goals" aria-label="Network optimization goals">
      <div className="panel-title"><Scale size={16} /><span>Optimization priorities</span></div>
      <p className="data-note">Set relative importance; priorities are normalized for scoring. Radio quality is opt-in and starts at 0.</p>
      <div className="optimization-objectives">
        {OPTIMIZATION_OBJECTIVES.map((objective) => {
          const value = Number(objectives.get(objective.id)?.weight ?? 0);
          return (
            <div className="optimization-objective" key={objective.id}>
              <label htmlFor={`optimization-priority-${objective.id}`}>
                <span><strong>{objective.label}</strong><small>{objective.direction}</small></span>
                <output htmlFor={`optimization-priority-${objective.id}`}>{value}</output>
              </label>
              <input
                id={`optimization-priority-${objective.id}`}
                aria-label={`${objective.label} importance`}
                type="range"
                min="0"
                max="100"
                step="1"
                value={value}
                onChange={(event) => updateObjective(objective.id, event.target.value)}
              />
              <p>{objective.description}</p>
            </div>
          );
        })}
      </div>
      {priorityError ? (
        <p className="optimization-validation" role="alert">{priorityError}</p>
      ) : null}
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

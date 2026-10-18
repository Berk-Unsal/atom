import { CheckCircle2, Circle, LassoSelect, MapPin } from "lucide-react";
import { candidatePrerequisitesMet } from "../utils/candidatePrerequisites.js";

// "Find an additional Cell": one explicit network action with its prerequisites stated up front.

export default function CandidateCellAction({ isDrawingSearchArea = false, loading = false, onDrawSearchArea, onFind, prerequisites }) {
  const ready = candidatePrerequisitesMet(prerequisites);
  const hasArea = prerequisites.find((prerequisite) => prerequisite.id === "area")?.met;
  return (
    <section className="candidate-cell-action" aria-label="Find an additional Cell">
      <div className="panel-title"><MapPin size={16} aria-hidden="true" /><span>Find an additional Cell</span></div>
      <p className="data-note">Scores up to five dataset Cell records inside a search area as one addition to the selected network. Scoring excludes interference and is not a site-availability claim.</p>
      <ul className="candidate-prerequisites" aria-label="Prerequisites">
        {prerequisites.map((prerequisite) => (
          <li key={prerequisite.id} className={prerequisite.met ? "met" : "unmet"}>
            {prerequisite.met ? <CheckCircle2 size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
            <span>
              <strong>{prerequisite.label}</strong>
              <span className="visually-hidden">{prerequisite.met ? " · met" : " · needed"}</span>
              {prerequisite.met ? null : <small>{prerequisite.hint}</small>}
            </span>
          </li>
        ))}
      </ul>
      <div className="candidate-cell-actions">
        <button type="button" className="selection-map-action" onClick={onDrawSearchArea} disabled={isDrawingSearchArea || loading}>
          <LassoSelect size={15} aria-hidden="true" />
          <span>{isDrawingSearchArea ? "Drawing search area…" : hasArea ? "Redraw search area" : "Draw search area"}</span>
        </button>
        <button type="button" className="panel-primary-action" onClick={onFind} disabled={!ready || loading || isDrawingSearchArea}>
          {loading ? "Scoring candidates…" : "Find an additional Cell"}
        </button>
      </div>
    </section>
  );
}

import { lazy, Suspense, useState } from "react";
import { SubviewSwitcher, ToolEmptyState } from "../../components/ToolPrimitives.jsx";

const MeasurementValidationPanel = lazy(() => import("../../components/MeasurementValidationPanel.jsx"));
const MaterialReferencePanel = lazy(() => import("../../components/MaterialReferencePanel.jsx"));
const SpecularReflectionReferencePanel = lazy(() => import("../../components/SpecularReflectionReferencePanel.jsx"));

const views = [
  { id: "validation", label: "Validation", Component: MeasurementValidationPanel },
  { id: "materials", label: "Materials", Component: MaterialReferencePanel },
  { id: "reflection", label: "Reflection", Component: SpecularReflectionReferencePanel },
];

export default function RFDiagnosticsResearchFeature({
  isAnalyzingMaterial,
  isAnalyzingMeasurement,
  isAnalyzingReflection,
  materialReference,
  measurementValidation,
  onActivityChange,
  onRunMaterial,
  onRunMeasurement,
  onRunReflection,
  specularReflectionReference,
}) {
  const [activeView, setActiveView] = useState(null);
  const [visitedViews, setVisitedViews] = useState(() => new Set());
  const selectView = (viewID) => {
    setActiveView(viewID);
    setVisitedViews((current) => new Set(current).add(viewID));
  };

  return (
    <section className="rf-diagnostics-research" aria-label="Research and reference workflows">
      <p className="rf-research-boundary">These workflows retain separate evidence and do not change canonical network RF.</p>
      <SubviewSwitcher activeId={activeView} items={views} label="Research workflow" onChange={selectView} />
      <div className="rf-research-subviews">
        {!activeView ? <ToolEmptyState title="Choose an evidence workflow" description="Validation, materials, and reflected paths use separate reference inputs and results." /> : null}
        {views.map(({ id, Component, label }) => visitedViews.has(id) ? (
          <section className="rf-research-subview" hidden={activeView !== id} key={id} aria-label={`${views.find((view) => view.id === id)?.label} workflow`}>
            <Suspense fallback={<div className="rf-research-loading" role="status">Loading {label.toLowerCase()} workflow…</div>}>
              {id === "validation" ? <Component
                analysis={measurementValidation}
                isAnalyzing={isAnalyzingMeasurement}
                onRun={onRunMeasurement}
              /> : null}
              {id === "materials" ? <Component
                analysis={materialReference}
                isAnalyzing={isAnalyzingMaterial}
                onActivityChange={onActivityChange}
                onRun={onRunMaterial}
              /> : null}
              {id === "reflection" ? <Component
                analysis={specularReflectionReference}
                isAnalyzing={isAnalyzingReflection}
                onActivityChange={onActivityChange}
                onRun={onRunReflection}
              /> : null}
            </Suspense>
          </section>
        ) : null)}
      </div>
    </section>
  );
}

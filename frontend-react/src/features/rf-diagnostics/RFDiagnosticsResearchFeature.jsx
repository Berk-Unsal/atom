import MaterialReferencePanel from "../../components/MaterialReferencePanel.jsx";
import MeasurementValidationPanel from "../../components/MeasurementValidationPanel.jsx";
import SpecularReflectionReferencePanel from "../../components/SpecularReflectionReferencePanel.jsx";

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
  return (
    <>
      <MeasurementValidationPanel
        analysis={measurementValidation}
        isAnalyzing={isAnalyzingMeasurement}
        onRun={onRunMeasurement}
      />
      <MaterialReferencePanel
        analysis={materialReference}
        isAnalyzing={isAnalyzingMaterial}
        onActivityChange={onActivityChange}
        onRun={onRunMaterial}
      />
      <SpecularReflectionReferencePanel
        analysis={specularReflectionReference}
        isAnalyzing={isAnalyzingReflection}
        onActivityChange={onActivityChange}
        onRun={onRunReflection}
      />
    </>
  );
}

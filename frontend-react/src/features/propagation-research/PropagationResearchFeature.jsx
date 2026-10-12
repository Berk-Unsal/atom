import P1411CandidatePanel from "../../components/P1411CandidatePanel.jsx";
import SubTHZReferencePanel from "../../components/SubTHZReferencePanel.jsx";

export default function PropagationResearchFeature({
  endpoint,
  isAnalyzingP1411,
  isAnalyzingSubTHZ,
  onActivityChange,
  onAnalyzeP1411,
  onAnalyzeSubTHZ,
  p1411Reference,
  selectedTower,
  settings,
  subTHZReference,
}) {
  return (
    <>
      <SubTHZReferencePanel
        endpoint={endpoint}
        isAnalyzing={isAnalyzingSubTHZ}
        onAnalyze={onAnalyzeSubTHZ}
        onActivityChange={onActivityChange}
        reference={subTHZReference}
        selectedTower={selectedTower}
        settings={settings}
      />
      <P1411CandidatePanel
        endpoint={endpoint}
        isAnalyzing={isAnalyzingP1411}
        onAnalyze={onAnalyzeP1411}
        onActivityChange={onActivityChange}
        reference={p1411Reference}
        selectedTower={selectedTower}
        settings={settings}
      />
    </>
  );
}

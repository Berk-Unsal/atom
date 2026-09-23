import {
  Activity,
  BarChart3,
  Building2,
  Database,
  FileText,
  FlaskConical,
  History,
  Layers3,
  Radar,
  RadioTower,
  Server,
  SlidersHorizontal,
} from "lucide-react";

export const WORKSPACE_TOOLS = [
  { id: "setup", label: "Setup", description: "Plan mode, RF profile, and cell selection", icon: SlidersHorizontal, stage: "plan" },
	{ id: "inventory", label: "Inventory", description: "Edit cell profiles and placements", icon: RadioTower, stage: "plan" },
  { id: "propagation", label: "Propagation", description: "Run RF propagation analysis", icon: Radar, stage: "simulate" },
	{ id: "experiments", label: "Experiments", description: "Compare simulation experiments", icon: FlaskConical, stage: "simulate" },
	{ id: "surfaces", label: "Signal surface", description: "Generate received-power maps", icon: Layers3, stage: "simulate" },
  { id: "interference", label: "Interference", description: "Measure network overlap and radio quality", icon: Activity, stage: "analyze" },
  { id: "validation", label: "RF Diagnostics", description: "Inspect path and model evidence", icon: BarChart3, stage: "analyze" },
  { id: "building-entry", label: "Building entry", description: "Estimate representative facade entry", icon: Building2, stage: "analyze" },
  { id: "core", label: "5G Core", description: "Connect to the optional local Core Lab", icon: Server, stage: "analyze" },
  { id: "results", label: "Results", description: "RF, optimization, and network comparisons", icon: BarChart3, stage: "review" },
  { id: "history", label: "Run history", description: "Inspect prior simulation and optimization runs", icon: History, stage: "review" },
  { id: "data", label: "Data", description: "Datasets, measurements, and calibration", icon: Database, stage: "review" },
  { id: "report", label: "Report", description: "Create and inspect project reports", icon: FileText, stage: "review" },
];

export const WORKSPACE_STAGES = [
  { id: "plan", label: "Plan", icon: SlidersHorizontal },
  { id: "simulate", label: "Simulate", icon: Radar },
  { id: "analyze", label: "Analyze", icon: Activity },
  { id: "review", label: "Review", icon: BarChart3 },
];

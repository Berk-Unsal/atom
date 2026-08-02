import {
  Activity,
  BarChart3,
  Database,
  FileText,
  FlaskConical,
  Layers3,
  Radar,
  RadioTower,
  Server,
  SlidersHorizontal,
} from "lucide-react";

export const WORKSPACE_TOOLS = [
  { id: "setup", label: "Setup", icon: SlidersHorizontal, stage: "plan" },
	{ id: "inventory", label: "Inventory", icon: RadioTower, stage: "plan" },
  { id: "propagation", label: "Propagation", icon: Radar, stage: "simulate" },
	{ id: "experiments", label: "Experiments", icon: FlaskConical, stage: "simulate" },
	{ id: "surfaces", label: "Surfaces", icon: Layers3, stage: "simulate" },
  { id: "interference", label: "Interference", icon: Activity, stage: "analyze" },
  { id: "core", label: "5G Core", icon: Server, stage: "analyze" },
  { id: "results", label: "Results", icon: BarChart3, stage: "review" },
  { id: "data", label: "Data", icon: Database, stage: "review" },
  { id: "report", label: "Report", icon: FileText, stage: "review" },
];

export const WORKSPACE_STAGES = [
  { id: "plan", label: "Plan", icon: SlidersHorizontal },
  { id: "simulate", label: "Simulate", icon: Radar },
  { id: "analyze", label: "Analyze", icon: Activity },
  { id: "review", label: "Review", icon: BarChart3 },
];

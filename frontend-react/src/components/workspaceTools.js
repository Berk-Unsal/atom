import {
  Activity,
  BarChart3,
  Database,
  FileText,
  Radar,
  RadioTower,
  Server,
  SlidersHorizontal,
} from "lucide-react";

export const WORKSPACE_TOOLS = [
  { id: "setup", label: "Setup", icon: SlidersHorizontal, group: "plan" },
	{ id: "inventory", label: "Inventory", icon: RadioTower, group: "plan" },
  { id: "propagation", label: "Propagation", icon: Radar, group: "plan" },
  { id: "interference", label: "Interference", icon: Activity, group: "plan" },
  { id: "core", label: "5G Core", icon: Server, group: "plan" },
  { id: "results", label: "Results", icon: BarChart3, group: "output" },
  { id: "data", label: "Data", icon: Database, group: "output" },
  { id: "report", label: "Report", icon: FileText, group: "output" },
];

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createProject,
  createProjectWorkspace,
  createScenario,
  datasetReference,
  duplicateProjectData,
  exportProjectFile,
  importProjectFile,
  loadProjectWorkspace,
  queueProjectWorkspaceSave,
  updateProjectDraft,
} from "../utils/projectStore.js";

export default function useProjectWorkspace(meta) {
  const initialDatasetRef = useRef(datasetReference(meta));
  const [workspace, setWorkspace] = useState(() => createProjectWorkspace(datasetReference(meta)));
  const workspaceRef = useRef(workspace);
  const mountedRef = useRef(true);
  const pendingSaveCountRef = useRef(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [persistenceState, setPersistenceState] = useState("saved");

  useEffect(() => {
    mountedRef.current = true;
    let mounted = true;
    loadProjectWorkspace(initialDatasetRef.current)
      .then((stored) => {
        if (mounted) {
          workspaceRef.current = stored;
          setWorkspace(stored);
          setLoaded(true);
        }
      })
      .catch((loadError) => {
        if (mounted) {
          setError(loadError.message);
          setLoaded(true);
        }
      });
    return () => {
      mounted = false;
      mountedRef.current = false;
    };
  }, []);

  const commit = useCallback((recipe) => {
    const { workspace: next, saved } = queueProjectWorkspaceSave(recipe(workspaceRef.current));
    workspaceRef.current = next;
    setWorkspace(next);
    pendingSaveCountRef.current += 1;
    setPersistenceState("saving");
    saved.then(
      () => {
        pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1);
        if (mountedRef.current) {
          setError("");
          if (pendingSaveCountRef.current === 0) setPersistenceState("saved");
        }
      },
      (saveError) => {
        pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1);
        if (mountedRef.current) {
          setError(saveError.message);
          setPersistenceState("error");
        }
      },
    );
    return saved;
  }, []);

  const activeProject = useMemo(
    () => workspace.projects.find((project) => project.id === workspace.activeProjectId) ?? workspace.projects[0],
    [workspace],
  );
  const activeProjectID = activeProject?.id;

  const updateProject = useCallback((projectID, updater) => {
    return commit((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === projectID
        ? { ...updater(project), updatedAt: new Date().toISOString() }
        : project),
    }));
  }, [commit]);

  const selectProject = useCallback((projectID) => {
    commit((current) => ({ ...current, activeProjectId: projectID }));
  }, [commit]);

  const addProject = useCallback(() => {
    const project = createProject("Untitled Plan", datasetReference(meta));
    commit((current) => ({ ...current, activeProjectId: project.id, projects: [...current.projects, project] }));
  }, [commit, meta]);

  const renameProject = useCallback((name) => {
    if (!activeProject || !String(name).trim()) return;
    updateProject(activeProject.id, (project) => ({ ...project, name: String(name).trim() }));
  }, [activeProject, updateProject]);

  const duplicateProject = useCallback(() => {
    if (!activeProject) return;
    const duplicate = duplicateProjectData(activeProject);
    commit((current) => ({ ...current, activeProjectId: duplicate.id, projects: [...current.projects, duplicate] }));
  }, [activeProject, commit]);

  const deleteProject = useCallback(() => {
    if (!activeProject || workspace.projects.length === 1) return;
    commit((current) => {
      const projects = current.projects.filter((project) => project.id !== activeProject.id);
      return { ...current, projects, activeProjectId: projects[0].id };
    });
  }, [activeProject, commit, workspace.projects.length]);

  const saveDraft = useCallback((draft) => {
    if (!activeProjectID) return;
    updateProject(activeProjectID, (project) => updateProjectDraft({
      ...project,
      datasetRef: project.datasetRef ?? datasetReference(meta),
    }, draft));
  }, [activeProjectID, meta, updateProject]);

  const activateScenario = useCallback((scenarioID) => {
    if (!activeProject || !activeProject.scenarios.some((scenario) => scenario.id === scenarioID)) return;
    updateProject(activeProject.id, (project) => ({ ...project, activeScenarioId: scenarioID }));
  }, [activeProject, updateProject]);

  const saveScenario = useCallback((name, snapshot) => {
    if (!activeProjectID) return null;
    const scenario = createScenario(name, snapshot);
    const saved = updateProject(activeProjectID, (project) => ({
      ...project,
      activeScenarioId: scenario.id,
      datasetRef: project.datasetRef ?? datasetReference(meta),
      scenarios: [...project.scenarios, scenario],
    }));
    return saved.then(() => scenario);
  }, [activeProjectID, meta, updateProject]);

  const deleteScenario = useCallback((scenarioID) => {
    if (!activeProject) return;
    updateProject(activeProject.id, (project) => ({
      ...project,
      activeScenarioId: project.activeScenarioId === scenarioID ? null : project.activeScenarioId,
      scenarios: project.scenarios.filter((scenario) => scenario.id !== scenarioID),
    }));
  }, [activeProject, updateProject]);

  const restoreScenario = useCallback((scenario, index, activate = false) => {
    if (!activeProject || !scenario || activeProject.scenarios.some((candidate) => candidate.id === scenario.id)) return;
    updateProject(activeProject.id, (project) => {
      const scenarios = [...project.scenarios];
      scenarios.splice(Math.max(0, Math.min(Number(index) || 0, scenarios.length)), 0, scenario);
      return {
        ...project,
        activeScenarioId: activate ? scenario.id : project.activeScenarioId,
        scenarios,
      };
    });
  }, [activeProject, updateProject]);

  const importProject = useCallback((text) => {
    const project = importProjectFile(text);
    commit((current) => ({ ...current, activeProjectId: project.id, projects: [...current.projects, project] }));
    return project;
  }, [commit]);

  return {
    activeProject,
    activateScenario,
    addProject,
    clearError: () => setError(""),
    deleteProject,
    deleteScenario,
    duplicateProject,
    error,
    exportActiveProject: () => exportProjectFile(activeProject),
    importProject,
    loaded,
    persistenceState,
    renameProject,
    restoreScenario,
    saveDraft,
    saveScenario,
    selectProject,
    workspace,
  };
}

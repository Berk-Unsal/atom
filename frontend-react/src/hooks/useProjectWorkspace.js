import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createProject,
  createProjectWorkspace,
  createScenario,
  datasetReference,
  exportProjectFile,
  importProjectFile,
  loadProjectWorkspace,
  saveProjectWorkspace,
} from "../utils/projectStore.js";

export default function useProjectWorkspace(meta) {
  const initialDatasetRef = useRef(datasetReference(meta));
  const [workspace, setWorkspace] = useState(() => createProjectWorkspace(datasetReference(meta)));
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    loadProjectWorkspace(initialDatasetRef.current)
      .then((stored) => {
        if (mounted) {
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
    return () => { mounted = false; };
  }, []);

  const commit = useCallback((recipe) => {
    setWorkspace((current) => {
      const next = recipe(current);
      saveProjectWorkspace(next).catch((saveError) => setError(saveError.message));
      return next;
    });
  }, []);

  const activeProject = useMemo(
    () => workspace.projects.find((project) => project.id === workspace.activeProjectId) ?? workspace.projects[0],
    [workspace],
  );
  const activeProjectID = activeProject?.id;

  const updateProject = useCallback((projectID, updater) => {
    commit((current) => ({
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
    const duplicate = {
      ...structuredClone(activeProject),
      id: createProject().id,
      name: `${activeProject.name} Copy`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
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
    updateProject(activeProjectID, (project) => ({
      ...project,
      datasetRef: project.datasetRef ?? datasetReference(meta),
      draft,
    }));
  }, [activeProjectID, meta, updateProject]);

  const saveScenario = useCallback((name, snapshot) => {
    if (!activeProjectID) return null;
    const scenario = createScenario(name, snapshot);
    updateProject(activeProjectID, (project) => ({
      ...project,
      activeScenarioId: scenario.id,
      datasetRef: project.datasetRef ?? datasetReference(meta),
      scenarios: [...project.scenarios, scenario],
    }));
    return scenario;
  }, [activeProjectID, meta, updateProject]);

  const deleteScenario = useCallback((scenarioID) => {
    if (!activeProject) return;
    updateProject(activeProject.id, (project) => ({
      ...project,
      activeScenarioId: project.activeScenarioId === scenarioID ? null : project.activeScenarioId,
      scenarios: project.scenarios.filter((scenario) => scenario.id !== scenarioID),
    }));
  }, [activeProject, updateProject]);

  const importProject = useCallback((text) => {
    const project = importProjectFile(text);
    commit((current) => ({ ...current, activeProjectId: project.id, projects: [...current.projects, project] }));
    return project;
  }, [commit]);

  return {
    activeProject,
    addProject,
    clearError: () => setError(""),
    deleteProject,
    deleteScenario,
    duplicateProject,
    error,
    exportActiveProject: () => exportProjectFile(activeProject),
    importProject,
    loaded,
    renameProject,
    saveDraft,
    saveScenario,
    selectProject,
    workspace,
  };
}

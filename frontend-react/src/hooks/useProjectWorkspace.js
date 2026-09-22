import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LocalRepository from "../repository/localRepository.js";

export default function useProjectWorkspace(meta) {
  const repository = useMemo(() => new LocalRepository(), []);
  const [initialDatasetRef] = useState(() => repository.datasetReference(meta));
  const [workspace, setWorkspace] = useState(() => repository.createProjectWorkspace(initialDatasetRef));
  const workspaceRef = useRef(workspace);
  const mountedRef = useRef(true);
  const pendingSaveCountRef = useRef(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [persistenceState, setPersistenceState] = useState("saved");

  useEffect(() => {
    mountedRef.current = true;
    let mounted = true;
    repository.loadWorkspace(initialDatasetRef)
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
  }, [initialDatasetRef, repository]);

  const commit = useCallback((recipe) => {
    const { workspace: next, saved } = repository.queueWorkspaceSave(recipe(workspaceRef.current));
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
  }, [repository]);

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
    const project = repository.createProject("Untitled Plan", repository.datasetReference(meta));
    commit((current) => ({ ...current, activeProjectId: project.id, projects: [...current.projects, project] }));
  }, [commit, meta, repository]);

  const renameProject = useCallback((name) => {
    if (!activeProject || !String(name).trim()) return;
    updateProject(activeProject.id, (project) => ({ ...project, name: String(name).trim() }));
  }, [activeProject, updateProject]);

  const duplicateProject = useCallback(() => {
    if (!activeProject) return;
    const duplicate = repository.duplicateProjectData(activeProject);
    commit((current) => ({ ...current, activeProjectId: duplicate.id, projects: [...current.projects, duplicate] }));
  }, [activeProject, commit, repository]);

  const deleteProject = useCallback(() => {
    if (!activeProject || workspace.projects.length === 1) return;
    commit((current) => {
      const projects = current.projects.filter((project) => project.id !== activeProject.id);
      return { ...current, projects, activeProjectId: projects[0].id };
    });
  }, [activeProject, commit, workspace.projects.length]);

  const saveDraft = useCallback((draft) => {
    if (!activeProjectID) return;
    updateProject(activeProjectID, (project) => repository.updateProjectDraft({
      ...project,
      datasetRef: project.datasetRef ?? repository.datasetReference(meta),
    }, draft));
  }, [activeProjectID, meta, repository, updateProject]);

  const activateScenario = useCallback((scenarioID) => {
    if (!activeProject || !activeProject.scenarios.some((scenario) => scenario.id === scenarioID)) return;
    updateProject(activeProject.id, (project) => ({ ...project, activeScenarioId: scenarioID, draft: null }));
  }, [activeProject, updateProject]);

  const renameScenario = useCallback((scenarioID, name) => {
    if (!activeProject || !String(name ?? "").trim()) return;
    updateProject(activeProject.id, (project) => ({
      ...project,
      scenarios: project.scenarios.map((scenario) => scenario.id === scenarioID
        ? { ...scenario, name: String(name).trim(), updatedAt: new Date().toISOString() }
        : scenario),
    }));
  }, [activeProject, updateProject]);

  const saveScenario = useCallback((name, snapshot, options = {}) => {
    if (!activeProjectID) return null;
    const scenario = repository.createScenario(name, snapshot, options);
    const saved = updateProject(activeProjectID, (project) => ({
      ...project,
      activeScenarioId: scenario.id,
      draft: null,
      datasetRef: project.datasetRef ?? repository.datasetReference(meta),
      scenarios: [...project.scenarios, scenario],
    }));
    return saved.then(() => scenario);
  }, [activeProjectID, meta, repository, updateProject]);

  const saveScenarioVersion = useCallback(async (options = {}) => {
    const projectID = options.projectId ?? activeProject?.domain?.project_id ?? activeProject?.id;
    if (!projectID || !options.scenarioId) throw new Error("A saved Scenario is required before saving a Version");
    const saved = await repository.saveScenarioVersion({ ...options, projectId: projectID });
    if (mountedRef.current && saved.workspace) {
      workspaceRef.current = saved.workspace;
      setWorkspace(saved.workspace);
      setError("");
    }
    return saved;
  }, [activeProject, repository]);

  const branchScenario = useCallback(async (options = {}) => {
    const projectID = options.projectId ?? activeProject?.domain?.project_id ?? activeProject?.id;
    if (!projectID || !options.scenarioId) throw new Error("A saved Scenario is required before creating a branch");
    const saved = await repository.branchScenario({ ...options, projectId: projectID });
    if (mountedRef.current && saved.workspace) {
      workspaceRef.current = saved.workspace;
      setWorkspace(saved.workspace);
      setError("");
    }
    return saved;
  }, [activeProject, repository]);

  const duplicateScenario = useCallback(async (options = {}) => {
    const projectID = options.projectId ?? activeProject?.domain?.project_id ?? activeProject?.id;
    if (!projectID || !options.scenarioId) throw new Error("A saved Scenario is required before duplicating it");
    const saved = await repository.duplicateScenario({ ...options, projectId: projectID });
    if (mountedRef.current && saved.workspace) {
      workspaceRef.current = saved.workspace;
      setWorkspace(saved.workspace);
      setError("");
    }
    return saved;
  }, [activeProject, repository]);

  const continueFromScenarioRevision = useCallback(async (options = {}) => {
    const projectID = options.projectId ?? activeProject?.domain?.project_id ?? activeProject?.id;
    if (!projectID || !options.scenarioId || !options.revisionId) {
      throw new Error("A Scenario and Version are required to continue from history");
    }
    const saved = await repository.continueFromScenarioRevision({ ...options, projectId: projectID });
    if (mountedRef.current && saved.workspace) {
      workspaceRef.current = saved.workspace;
      setWorkspace(saved.workspace);
      setError("");
    }
    return saved;
  }, [activeProject, repository]);

  const saveReportDefinition = useCallback(async (report) => {
    try {
      const saved = await repository.saveReportDefinitionWithWorkspace(report);
      if (mountedRef.current && saved.workspace) {
        workspaceRef.current = saved.workspace;
        setWorkspace(saved.workspace);
        setError("");
      }
      return saved;
    } catch (saveError) {
      if (mountedRef.current) setError(saveError.message);
      throw saveError;
    }
  }, [repository]);

  const applyHistoricalOptimization = useCallback(async ({ run, solution, mode = "version", scenarioId = null, revisionId = null, branchName = "" } = {}) => {
    const projectID = activeProject?.domain?.project_id ?? activeProject?.id;
    const scenario = activeProject?.scenarios?.find((candidate) => (
      String(candidate.domain?.scenario_id ?? candidate.id) === String(scenarioId)
        || String(candidate.id) === String(scenarioId)
    )) ?? activeProject?.scenarios?.find((candidate) => candidate.id === activeProject.activeScenarioId);
    const scenarioID = scenarioId ?? scenario?.domain?.scenario_id ?? scenario?.id;
    if (!projectID || !scenarioID) throw new Error("Open a saved scenario before applying a historical solution");
    const saved = await repository.applyOptimizationSolution({
      projectId: projectID,
      scenarioId: scenarioID,
      revisionId: revisionId ?? run?.scenario_revision_id ?? null,
      run,
      solution,
      mode,
      branchName,
    });
    if (mountedRef.current && saved.workspace) {
      workspaceRef.current = saved.workspace;
      setWorkspace(saved.workspace);
    }
    return saved;
  }, [activeProject, repository]);

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
    const project = repository.importProjectFile(text);
    commit((current) => ({ ...current, activeProjectId: project.id, projects: [...current.projects, project] }));
    return project;
  }, [commit, repository]);

  return {
    activeProject,
    activateScenario,
    addProject,
    applyHistoricalOptimization,
    branchScenario,
    clearError: () => setError(""),
    continueFromScenarioRevision,
    deleteProject,
    deleteScenario,
    duplicateScenario,
    duplicateProject,
    error,
    exportActiveProject: () => repository.exportProjectFile(activeProject),
    importProject,
    loaded,
    persistenceState,
    renameProject,
    renameScenario,
    restoreScenario,
    saveDraft,
    saveReportDefinition,
    saveScenario,
    saveScenarioVersion,
    selectProject,
    workspace,
  };
}

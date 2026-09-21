import { useCallback, useEffect, useMemo, useState } from "react";
import LocalRunHistoryRepository from "../repository/runHistoryRepository.js";

export default function useRunHistory({ projectId = null, scenarioId = null } = {}) {
  const repository = useMemo(() => new LocalRunHistoryRepository(), []);
  const [runs, setRuns] = useState([]);
  const [issues, setIssues] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (overrides = {}) => {
    setLoading(true);
    try {
      const nextRuns = await repository.listRuns({
        ...(projectId ? { project_id: projectId } : {}),
        ...(scenarioId ? { scenario_id: scenarioId } : {}),
        ...overrides,
      });
      setRuns(nextRuns);
      setIssues(repository.getIssues());
      setError("");
      return nextRuns;
    } catch (loadError) {
      setIssues(repository.getIssues());
      setError(loadError.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [projectId, repository, scenarioId]);

  useEffect(() => {
    // Loading from IndexedDB is the hook's external-store subscription boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const saveRun = useCallback(async (run) => {
    try {
      const saved = await repository.saveRun(run);
      setError("");
      await refresh();
      return saved;
    } catch (saveError) {
      setError(saveError.message);
      return null;
    }
  }, [refresh, repository]);

  const updateRunLifecycle = useCallback(async (runId, changes) => {
    try {
      const updated = await repository.updateRunLifecycle(runId, changes);
      setError("");
      await refresh();
      return updated;
    } catch (updateError) {
      setError(updateError.message);
      return null;
    }
  }, [refresh, repository]);

  const deleteRun = useCallback(async (runId, references = []) => {
    try {
      await repository.deleteRun(runId, { references });
      await refresh();
      return true;
    } catch (deleteError) {
      setError(deleteError.message);
      return false;
    }
  }, [refresh, repository]);

  const clearUnreferenced = useCallback(async (referencedRunIds = []) => {
    try {
      const count = await repository.deleteUnreferencedRuns({ projectId, referencedRunIds });
      await refresh();
      return count;
    } catch (clearError) {
      setError(clearError.message);
      return 0;
    }
  }, [projectId, refresh, repository]);

  const clearAllUnreferenced = useCallback(async (referencedRunIds = []) => {
    try {
      const count = await repository.clearRuns({ confirm: true, referencedRunIds });
      await refresh();
      return count;
    } catch (clearError) {
      setError(clearError.message);
      return 0;
    }
  }, [refresh, repository]);

  return {
    clearAllUnreferenced,
    clearUnreferenced,
    deleteRun,
    error,
    issues,
    loading,
    refresh,
    repository,
    runs,
    saveRun,
    updateRunLifecycle,
  };
}

import { useCallback, useEffect, useMemo, useState } from "react";
import LocalArtifactStore from "../repository/artifactStore.js";

export default function useReportArtifacts({ projectId = null } = {}) {
  const repository = useMemo(() => new LocalArtifactStore(), []);
  const [artifacts, setArtifacts] = useState([]);
  const [issues, setIssues] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (overrides = {}) => {
    setLoading(true);
    if (!projectId && !overrides.project_id && !overrides.projectId) {
      setArtifacts([]);
      setIssues([]);
      setError("");
      setLoading(false);
      return [];
    }
    try {
      const next = await repository.listArtifacts({
        artifact_type: "report",
        ...(projectId ? { project_id: projectId } : {}),
        ...overrides,
      });
      setArtifacts(next);
      setIssues(repository.getIssues());
      setError("");
      return next;
    } catch (loadError) {
      setIssues(repository.getIssues());
      setError(loadError.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [projectId, repository]);

  useEffect(() => {
    // Loading from the additive artifact store is this hook's external-store boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const saveArtifact = useCallback(async (metadata, bytes) => {
    try {
      const saved = await repository.putArtifact(metadata, bytes);
      setError("");
      await refresh();
      return saved;
    } catch (saveError) {
      setError(saveError.message);
      return null;
    }
  }, [refresh, repository]);

  const getArtifact = useCallback(async (artifactId) => {
    try {
      const result = await repository.getArtifact(artifactId);
      setError("");
      await refresh();
      return result;
    } catch (loadError) {
      setError(loadError.message);
      await refresh();
      return null;
    }
  }, [refresh, repository]);

  const deleteArtifact = useCallback(async (artifactId) => {
    try {
      await repository.deleteArtifact(artifactId);
      await refresh();
      return true;
    } catch (deleteError) {
      setError(deleteError.message);
      return false;
    }
  }, [refresh, repository]);

  const deleteProjectArtifacts = useCallback(async (targetProjectId = projectId) => {
    try {
      const count = await repository.deleteProjectArtifacts(targetProjectId);
      if (targetProjectId === projectId) await refresh();
      return count;
    } catch (deleteError) {
      setError(deleteError.message);
      throw deleteError;
    }
  }, [projectId, refresh, repository]);

  return {
    artifacts,
    deleteArtifact,
    deleteProjectArtifacts,
    error,
    getArtifact,
    issues,
    loading,
    refresh,
    repository,
    saveArtifact,
  };
}

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { platform } from "../platform/index.js";
import { createProjectFileController } from "../platform/projectFiles.js";

export default function useNativeProjectFiles(context) {
  const { projects, fileRevision } = context;
  const activeProjectId = context.activeProject?.id;
  const [state, setState] = useState({ busy: false, message: "", error: false, recovery: null, statuses: [], notice: 0 });
  const files = platform.projectFiles;
  const controller = useMemo(() => files ? createProjectFileController({ files,
    onState: (change) => setState((previous) => ({ ...previous, ...change })) }) : null, [files]);
  useLayoutEffect(() => { controller?.setContext(context); }, [controller, context]);
  useEffect(() => {
    if (!controller) return undefined;
    controller.activate();
    const unsubscribe = files.onCommand((request) => { void controller.onCommand(request); });
    return () => { unsubscribe(); controller.deactivate(); };
  }, [controller, files]);
  useEffect(() => {
    if (controller) void controller.sync(projects, { activeProject: { id: activeProjectId }, fileRevision });
  }, [controller, projects, activeProjectId, fileRevision]);
  return { enabled: Boolean(controller), ...state, execute: controller?.execute };
}

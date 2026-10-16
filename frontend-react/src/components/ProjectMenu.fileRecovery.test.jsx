import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectMenu } from "./WorkspaceChrome.jsx";
import { createProject, createScenario, MAX_PROJECT_FILE_BYTES } from "../utils/projectStore.js";

const failures = [
  ["Project file must be no larger than 16 MiB", "encoded portable file exceeds the 16 MiB size limit"],
  ["Project file ray expansion exceeds the resource budget", "decoded size or node budget"],
  ["Project file contains too many nested values", "portable-file node budget"],
  ["Project file is nested too deeply", "nesting-depth limit"],
  ["Project file contains an oversized string value", "string limit"],
  ["Project file contains an oversized array", "array limit"],
  ["Project file contains an object with too many fields", "field limit"],
];

function setup(message) {
  const activeProject = createProject("Retained project");
  activeProject.scenarios = [createScenario("Baseline", {
    plan: { selectedNetworkTowerIds: ["101", "102"] },
    artifacts: { simulation: { stats: { avg_rx_dbm: -88 } } },
  })];
  activeProject.activeScenarioId = activeProject.scenarios[0].id;
  const before = structuredClone(activeProject);
  const callbacks = {
    exportContent: vi.fn(() => { throw new Error(message); }),
    onImportProject: vi.fn(async () => { throw new Error(message); }),
    onAddProject: vi.fn(), onDeleteProject: vi.fn(), onDeleteScenario: vi.fn(),
    onDuplicateProject: vi.fn(), onOpenScenario: vi.fn(), onRenameProject: vi.fn(),
    onSaveScenario: vi.fn(), onSelectProject: vi.fn(),
  };
  const createURL = vi.fn(() => "blob:project");
  vi.stubGlobal("URL", { createObjectURL: createURL, revokeObjectURL: vi.fn() });
  const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const { container } = render(<ProjectMenu activeProject={activeProject} compatible projects={[activeProject]} {...callbacks} />);
  fireEvent.click(screen.getByRole("button", { name: "Open project menu" }));
  const file = { size: 12, text: vi.fn(async () => '{"original":true}') };
  const fileInput = container.querySelector('input[type="file"]');
  const importFile = () => fireEvent.change(fileInput, { target: { files: [file] } });
  return { activeProject, before, callbacks, createURL, download, file, importFile };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each(["export", "import"])("ProjectMenu %s recovery", (operation) => {
  it.each(failures)("explains %s without changing evidence or downloading", async (message, reason) => {
    const state = setup(message);
    if (operation === "export") fireEvent.click(screen.getByRole("button", { name: "Export", exact: true }));
    else state.importFile();
    const status = await screen.findByRole("status");
    await waitFor(() => expect(status).toHaveTextContent(reason));
    expect(status).toHaveTextContent(message);
    expect(status).toHaveTextContent(operation === "export" ? "Export stopped." : "Import stopped.");
    expect(status).toHaveTextContent("Your current project and retained evidence remain in this browser");
    expect(status).toHaveTextContent("Keep this browser’s site data");
    expect(status).toHaveTextContent("Review → Report");
    expect(status).toHaveTextContent("Markdown, or use PDF / Print");
    expect(status).toHaveTextContent("A report is not a full editable project backup");
    expect(status).toHaveTextContent("use New to start a separate project");
    expect(status).toHaveTextContent("does not archive this project or shrink its retained evidence");
    expect(within(status).getByRole("link", { name: "Portable project format limits" })).toHaveAttribute(
      "href", "https://berk-unsal.github.io/atom/project-format.html#resource-and-error-contract",
    );
    if (operation === "import") {
      expect(status).toHaveTextContent("The original file is unchanged");
      expect(state.callbacks.onImportProject).toHaveBeenCalledExactlyOnceWith('{"original":true}');
      expect(await state.file.text()).toBe('{"original":true}');
    } else expect(state.callbacks.exportContent).toHaveBeenCalledOnce();
    expect(state.createURL).not.toHaveBeenCalled();
    expect(state.download).not.toHaveBeenCalled();
    expect(state.activeProject).toEqual(state.before);
    for (const [name, callback] of Object.entries(state.callbacks)) {
      if (!["exportContent", "onImportProject"].includes(name)) expect(callback).not.toHaveBeenCalled();
    }
  });

  it("keeps unknown errors unchanged and does not suggest budget recovery", async () => {
    const state = setup("Project file is not valid JSON");
    if (operation === "export") fireEvent.click(screen.getByRole("button", { name: "Export", exact: true }));
    else state.importFile();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Project file is not valid JSON"));
    expect(screen.getByRole("status").textContent).toBe("Project file is not valid JSON");
    expect(screen.queryByRole("link", { name: "Portable project format limits" })).not.toBeInTheDocument();
    expect(state.download).not.toHaveBeenCalled();
    expect(state.activeProject).toEqual(state.before);
  });
});

it("rejects oversized imports before reading and clears recovery after a later success", async () => {
  const state = setup("");
  state.file.size = MAX_PROJECT_FILE_BYTES + 1;
  state.importFile();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("16 MiB size limit"));
  expect(state.file.text).not.toHaveBeenCalled();
  expect(state.callbacks.onImportProject).not.toHaveBeenCalled();
  expect(state.activeProject).toEqual(state.before);
  expect(state.download).not.toHaveBeenCalled();
  state.callbacks.exportContent.mockReturnValueOnce("{}");
  fireEvent.click(screen.getByRole("button", { name: "Export", exact: true }));
  expect(screen.getByRole("status")).toHaveTextContent("Project exported");
  expect(screen.queryByRole("link", { name: "Portable project format limits" })).not.toBeInTheDocument();
  expect(state.download).toHaveBeenCalledOnce();
});

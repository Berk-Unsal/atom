import { describe, expect, it, vi } from "vitest";
import { createProjectWorkspace } from "../utils/projectStore.js";
import { createProjectFileController } from "./projectFiles.js";
import { sha256Hex } from "../utils/sha256.js";

function fixture() {
  const project = createProjectWorkspace(null).projects[0];
  let context = { projects: [project], activeProject: project, onImportProject: vi.fn() };
  const updates = [];
  const files = { open: vi.fn(async () => ({ canceled: true })), accept: vi.fn(async () => ({})), discard: vi.fn(async () => {}),
    save: vi.fn(async () => ({ saved: true, path: "/chosen/project.atom-project.json" })), status: vi.fn(async () => []), sync: vi.fn(async () => []), finishCommand: vi.fn(async () => true) };
  const controller = createProjectFileController({ files, getContext: () => context, onState: (change) => updates.push(change) });
  return { project, files, controller, updates, context: () => context, change: (next) => { context = next; } };
}

describe("native project-file action path", () => {
  it("cancels Open without import/association and rejects invalid input before activation", async () => {
    const f = fixture();
    expect((await f.controller.execute("open")).canceled).toBe(true);
    expect(f.context().onImportProject).not.toHaveBeenCalled(); expect(f.files.accept).not.toHaveBeenCalled();
    f.files.open.mockResolvedValue({ text: "invalid", ticket: "read-receipt", name: "invalid.json" });
    f.context().onImportProject.mockImplementation(() => { throw new Error("Project file must be no larger than 16 MiB"); });
    expect((await f.controller.execute("open")).failed).toBe(true);
    expect(f.files.accept).not.toHaveBeenCalled(); expect(f.files.discard).toHaveBeenCalledWith("read-receipt");
    expect(f.updates.some((change) => change.recovery?.operation === "import")).toBe(true);
  });
  it("saves the captured shared serialization even when the active project changes during its native dialog", async () => {
    const f = fixture(); let finish;
    f.files.save.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const saving = f.controller.execute("save");
    await vi.waitFor(() => expect(f.files.save).toHaveBeenCalledTimes(1));
    const next = { ...f.project, id: "another-project", name: "Another" };
    f.change({ ...f.context(), projects: [f.project, next], activeProject: next });
    finish({ saved: true, path: "/chosen/first.json" }); await saving;
    const payload = f.files.save.mock.calls[0][0];
    expect(payload.projectId).toBe(f.project.id);
    expect(JSON.parse(payload.text).project.id).toBe(f.project.id);
    expect(payload.revision).toBe(await sha256Hex(new TextEncoder().encode(payload.text)));
    expect(f.context().onImportProject).not.toHaveBeenCalled();
  });
  it("prepares pending input before serialization and creates no Scenario Version", async () => {
    const f = fixture();
    const captured = { ...f.project, updatedAt: "2026-11-09T10:00:00.000Z", draft: { plan: { settings: { power: 31 } }, requiresRerun: true, updatedAt: "2026-11-09T10:00:00.000Z" } };
    const prepare = vi.fn(async () => captured);
    f.change({ ...f.context(), prepareFileProject: prepare });
    await f.controller.execute("saveAs");
    expect(prepare).toHaveBeenCalledWith(f.project.id);
    const payload = f.files.save.mock.calls[0][0];
    expect(JSON.parse(payload.text).project.draft.plan.settings.power).toBe(31);
    expect(JSON.parse(payload.text).project.scenarios).toHaveLength(f.project.scenarios.length);
    expect(payload.revision).toBe(await sha256Hex(new TextEncoder().encode(payload.text)));
  });
  it("does not relabel a successful write as a failure if status refresh fails", async () => {
    const f = fixture(); f.files.status.mockRejectedValue(new Error("host status interrupted"));
    f.files.save.mockResolvedValue(Object.freeze({ saved: true, path: "/chosen/saved.json" }));
    const result = await f.controller.execute("save");
    expect(result.saved).toBe(true); expect(result.failed).toBeUndefined(); expect(result.warning).toMatch(/was saved/);
  });
  it("keeps a same-timestamp rename dirty when an older file save finishes", async () => {
    const f = fixture(); let finish; let savedHash = null; let rows = [];
    const statuses = () => rows.map((row) => ({ id: row.id, path: "/chosen/a.json", dirty: row.revision !== savedHash }));
    f.files.sync.mockImplementation(async (next) => { rows = next; return statuses(); });
    f.files.status.mockImplementation(async () => statuses());
    f.files.save.mockImplementation((payload) => new Promise((resolve) => { finish = () => { savedHash = payload.revision; resolve({ saved: true, path: "/chosen/a.json" }); }; }));
    const saving = f.controller.execute("save"); await vi.waitFor(() => expect(f.files.save).toHaveBeenCalledTimes(1));
    const renamed = { ...f.project, name: "New name with identical timestamp" };
    f.change({ ...f.context(), projects: [renamed], activeProject: renamed });
    await f.controller.sync([renamed], f.context()); finish(); await saving;
    expect(f.updates.filter((change) => change.statuses).at(-1).statuses[0].dirty).toBe(true);
    expect(rows[0].revision).not.toBe(f.files.save.mock.calls[0][0].revision);
  });
  it("discards an unactivated Open receipt after its UI controller unmounts", async () => {
    const f = fixture(); let finish;
    f.files.open.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const opening = f.controller.execute("open"); f.controller.deactivate();
    finish({ ticket: "receipt", text: "{}" }); expect((await opening).canceled).toBe(true);
    expect(f.context().onImportProject).not.toHaveBeenCalled(); expect(f.files.discard).toHaveBeenCalledWith("receipt");
  });
  it("does not let an older status response overwrite a newer project list", async () => {
    const f = fixture(); const replies = [];
    f.files.sync.mockImplementation(() => new Promise((resolve) => replies.push(resolve)));
    const first = f.controller.sync([f.project], f.context());
    const newer = { ...f.project, updatedAt: "newer-revision" };
    const second = f.controller.sync([newer], f.context());
    replies[1]([{ id: f.project.id, dirty: true }]);
    await vi.waitFor(() => expect(replies).toHaveLength(3));
    replies[2]([{ id: f.project.id, dirty: true }]); await second;
    replies[0]([{ id: f.project.id, dirty: false }]); await first;
    expect(f.updates.filter((change) => change.statuses).at(-1).statuses[0].dirty).toBe(true);
  });
  it("stops Save All on a retention warning and replies through the same native command receipt", async () => {
    const f = fixture(); f.files.save.mockResolvedValue({ saved: true, path: "/chosen/a.json", warning: "Association could not persist" });
    await f.controller.onCommand({ command: "saveAll", id: "opaque-quit-receipt", projectIds: [f.project.id, "second"] });
    expect(f.files.save).toHaveBeenCalledTimes(1);
    expect(f.files.finishCommand).toHaveBeenCalledWith({ id: "opaque-quit-receipt", success: false });
  });
});

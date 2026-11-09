import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NativeDatasetManager from "./NativeDatasetManager.jsx";
function fixture() {
  let command;
  const selection = { ticket: "opaque-selection", bytes: 4096, manifest_sha256: "a".repeat(64), location: "/chosen/Türkçe pack",
    manifest: { id: "pack", name: "Ankara fixture", version: "v1", sources: ["Source proof"], licenses: ["Test license"], files: { towers: "towers.geojson" }, sha256: { "towers.geojson": "b".repeat(64) } } };
  const adapter = { status: vi.fn(async () => ({ busy: false, phase: "idle", startup_id: "bundle", datasets: [{ id: "bundle", name: "Bundled pack", mode: "bundled", version: "v1", location: "/bundle", manifest_sha256: "c".repeat(64) }] })),
    onCommand: vi.fn((callback) => { command = callback; return () => { command = null; }; }), choose: vi.fn(async () => selection),
    install: vi.fn(async () => ({ registered: true, id: "pack" })), activate: vi.fn(), cancel: vi.fn(async () => ({ canceled: true })) };
  return { adapter, selection, send: (value) => act(() => command(value)) };
}
describe("native dataset task", () => {
  it("defaults to managed copy and shows source/license/size/hash before explicit registration", async () => {
    const { adapter, send } = fixture(); const onActivate = vi.fn(async () => ({ status: "active" }));
    render(<NativeDatasetManager adapter={adapter} onActivate={onActivate} />);
    send("directory");
    expect(await screen.findByRole("heading", { name: "Ankara fixture · v1" })).toBeInTheDocument();
    expect(screen.getByLabelText("Copy into A.T.O.M (recommended)")).toBeChecked();
    expect(screen.getByText("Source proof")).toBeInTheDocument(); expect(screen.getByText("Test license")).toBeInTheDocument();
    expect(screen.getByText(/4,096 bytes \(0.00 MiB\)/)).toBeInTheDocument(); expect(screen.getByText("a".repeat(64))).toBeInTheDocument();
    expect(adapter.install).not.toHaveBeenCalled(); expect(onActivate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Copy and register" }));
    await waitFor(() => expect(adapter.install).toHaveBeenCalledWith({ ticket: "opaque-selection", mode: "managed" }));
    expect(await screen.findByText(/Dataset registered/)).toBeInTheDocument();
    expect(onActivate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Activate", exact: true }));
    await waitFor(() => expect(onActivate).toHaveBeenCalledWith("bundle"));
    expect(await screen.findByText(/Dataset active/)).toBeInTheDocument();
  });
  it("keeps an advanced reference explicit and displays a bounded failure without claiming activation", async () => {
    const { adapter, send } = fixture(); const onActivate = vi.fn(async () => ({ error: "Reference moved; locate it explicitly." }));
    render(<NativeDatasetManager adapter={adapter} onActivate={onActivate} activeID="bundle" />);
    send("manifest"); await screen.findByRole("heading", { name: "Ankara fixture · v1" });
    fireEvent.click(screen.getByLabelText("Reference this folder (advanced)"));
    fireEvent.click(screen.getByRole("button", { name: "Register reference" }));
    await waitFor(() => expect(adapter.install).toHaveBeenCalledWith({ ticket: "opaque-selection", mode: "reference" }));
    await screen.findByText(/Dataset registered/);
    fireEvent.click(screen.getByRole("button", { name: "Revalidate active pack" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reference moved; locate it explicitly.");
    expect(screen.queryByText(/Dataset active\./)).not.toBeInTheDocument();
  });
  it("cancels an owned validation while blocking duplicate requests and native task dismissal", async () => {
    const { adapter, send } = fixture(); let reject;
    adapter.choose.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    adapter.cancel.mockImplementation(async () => { reject(new Error("Dataset operation canceled.")); return { canceled: true }; });
    const rendered = render(<NativeDatasetManager adapter={adapter} onActivate={vi.fn()} />);
    send("directory");
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose pack folder…" })).toBeDisabled();
    send("directory"); expect(adapter.choose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel operation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Dataset operation canceled.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).not.toBeDisabled());
    rendered.unmount(); expect(adapter.onCommand).toHaveBeenCalledTimes(1);
  });
});

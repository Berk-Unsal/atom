import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { createInventorySession } from "../utils/inventoryWorkingSet.js";
import InventoryPanel from "./InventoryPanel.jsx";

function InventoryHarness({ selectedNetworkCellIds = [], towers }) {
  const [inventorySession, setInventorySession] = useState(createInventorySession);
  return (
    <InventoryPanel
      activeTransmitterId={null}
      cellDetailId={null}
      currentMapBounds={{ west: 0, east: 49.99, south: 0, north: 1 }}
      inventorySession={inventorySession}
      isPlacingCell={false}
      onApplyBulkEdit={vi.fn()}
      onBackToInventory={vi.fn()}
      onCancelPlacement={vi.fn()}
      onDeleteCell={vi.fn()}
      onDuplicateCell={vi.fn()}
      onImportCells={vi.fn()}
      onInventorySessionChange={setInventorySession}
      onMoveCell={vi.fn()}
      onOpenCell={vi.fn()}
      onResetProfile={vi.fn()}
      onSelectCellsOnMap={vi.fn()}
      onStartPlacement={vi.fn()}
      onUpdateProfile={vi.fn()}
      planningMode="single"
      selectedNetworkCellIds={selectedNetworkCellIds}
      settings={{ frequencyGHz: 28, txPowerDbm: 30, radiusMeters: 400, beamWidthDeg: 120 }}
      towers={towers}
    />
  );
}

const largeInventory = Array.from({ length: 10_000 }, (_, index) => ({
  id: `record-${String(index).padStart(5, "0")}`,
  cellId: `cell-${String(index).padStart(5, "0")}`,
  coordinates: [index / 100, 0.5],
  rfProfile: { networkTech: index % 2 ? "5g" : "4g", frequencyGHz: index % 2 ? 28 : 2.6 },
  inventorySource: "dataset",
}));

describe("InventoryPanel working sets", () => {
  it("shows no inventory rows until Search has a criterion", () => {
    render(<InventoryHarness towers={largeInventory.slice(0, 10)} />);

    expect(screen.getByRole("heading", { name: "Search the inventory" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit Cell/ })).not.toBeInTheDocument();
  });

  it("renders a bounded page from a ten-thousand-Cell search and adds one page on demand", () => {
    render(<InventoryHarness towers={largeInventory} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search by Cell ID or record ID" }), { target: { value: "cell-" } });

    let results = screen.getByRole("list", { name: "Search result Cells" });
    expect(within(results).getAllByRole("button", { name: /^Edit Cell/ })).toHaveLength(50);
    expect(screen.getByRole("status")).toHaveTextContent("10,000 matches");

    fireEvent.click(screen.getByRole("button", { name: /Show next 50/ }));
    results = screen.getByRole("list", { name: "Search result Cells" });
    expect(within(results).getAllByRole("button", { name: /^Edit Cell/ })).toHaveLength(100);
  });

  it("captures a bounded Map area snapshot and does not expose off-map Cells", () => {
    render(<InventoryHarness towers={largeInventory} />);
    fireEvent.click(screen.getByRole("button", { name: /Map area/ }));

    const results = screen.getByRole("list", { name: "Map area Cells" });
    expect(within(results).getAllByRole("button", { name: /^Edit Cell/ })).toHaveLength(50);
    expect(screen.getByRole("status")).toHaveTextContent("5000 Cells in the captured map area");
  });

  it("renders only the current Network IDs in their supplied request order", () => {
    render(<InventoryHarness towers={largeInventory} selectedNetworkCellIds={["record-00003", "record-00001"]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Network/ }));

    const results = screen.getByRole("list", { name: "Network Cells" });
    const rows = within(results).getAllByRole("button", { name: /^Edit Cell/ });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAccessibleName("Edit Cell cell-00003");
    expect(rows[1]).toHaveAccessibleName("Edit Cell cell-00001");
  });
});

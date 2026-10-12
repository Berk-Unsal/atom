import { cloneElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, Crosshair, RadioTower, RotateCcw, Search, Trash2, Upload, X } from "lucide-react";
import { NETWORK_TECHNOLOGIES, RF_PROFILE_OPTIONS } from "../generated/policy.js";
import { MAX_INVENTORY_FILE_BYTES, parseInventoryFile } from "../utils/inventoryImport.js";
import { applyInventoryBatchPatch, captureViewportSnapshot, INVENTORY_PAGE_SIZE, resolveNetworkWorkingSet, resolveViewportSnapshot, SAFE_INVENTORY_BATCH_FIELDS, searchInventory, sliceInventoryPage, viewportBoundsEqual, createInventorySession } from "../utils/inventoryWorkingSet.js";
import { resolveRFProfile, technologyDefaults, validateRFProfile } from "../utils/rfProfile.js";
import DisclosureSection from "./DisclosureSection.jsx";

const NUMBER_FIELDS = [
  ["frequencyGHz", "Frequency", "GHz", "0.1"],
  ["bandwidthMHz", "Bandwidth", "MHz", "0.1"],
  ["txPowerDbm", "Conducted TX power", "dBm", "0.1"],
  ["antennaGainDbi", "TX boresight gain", "dBi", "0.1"],
  ["rxAntennaGainDbi", "RX antenna gain", "dBi", "0.1"],
  ["systemLossDb", "System loss", "dB", "0.1"],
  ["polarizationLossDb", "Polarization loss", "dB", "0.1"],
  ["radiusMeters", "Radius", "m", "1"],
  ["beamWidthDeg", "Beam width", "°", "1"],
  ["antennaHeightM", "Antenna height", "m", "0.1"],
  ["mechanicalDowntiltDeg", "Mechanical tilt", "°", "0.1"],
  ["electricalDowntiltDeg", "Electrical tilt", "°", "0.1"],
  ["orientationDeg", "Orientation", "°", "0.1"],
  ["loadFactor", "Cell load", "0–1", "0.01"],
  ["reuseFactor", "Reuse factor", "", "1"],
  ["pci", "PCI", "optional", "1"],
  ["receiverHeightM", "Receiver height", "m", "0.1"],
];
const RECEIVER_NUMBER_FIELDS = new Set(["receiverSensitivityDbm", "receiverNoiseBandwidthHz", "receiverNoiseFigureDb", "receiverRequiredSnrDb", "receiverMarginDb"]);
const PLANNING_PROFILE_FIELDS = new Set([
  "frequencyGHz", "bandwidthMHz", "txPowerDbm", "radiusMeters", "beamWidthDeg",
  "antennaHeightM", "orientationDeg", "receiverHeightM",
]);
const ADVANCED_PROFILE_FIELDS = new Set([
  "band", "channelId", "duplexMode", "antennaGainDbi", "rxAntennaGainDbi", "systemLossDb",
  "polarizationLossDb", "mechanicalDowntiltDeg", "electricalDowntiltDeg", "loadFactor",
  "reuseFactor", "pci", "horizontalPatternId", "verticalPatternId", "receiverNoiseBandwidthHz",
  "receiverNoiseFigureDb", "receiverRequiredSnrDb", "receiverMarginDb",
]);
export default function InventoryPanel({
  activeTransmitterId,
  cellDetailId,
  currentMapBounds,
  inventorySession,
  isPlacingCell,
  onApplyBulkEdit,
  onBackToInventory,
  onCancelPlacement,
  onDeleteCell,
  onDuplicateCell,
  onImportCells,
  onInventorySessionChange,
  onMoveCell,
  onOpenCell,
  onResetProfile,
  onSelectCellsOnMap,
  onStartPlacement,
  onUpdateProfile,
  planningMode,
  selectedNetworkCellIds = [],
  settings,
  towers,
}) {
  const [message, setMessage] = useState("");
  const fileRef = useRef(null);
  const listRef = useRef(null);
  const detailHeadingRef = useRef(null);
  const previousDetailIdRef = useRef(null);
  const focusAfterBackRef = useRef(null);
  const rowButtonRefs = useRef(new Map());
  const scopeButtonRefs = useRef(new Map());
  const session = inventorySession ?? createInventorySession();
  const scope = session.scope ?? (planningMode === "network" ? "network" : "search");
  const query = session.query ?? "";
  const technology = session.technology ?? "";
  const editSelection = session.selectedForEditing ?? [];
  const bulkStage = session.bulkStage ?? null;
  const viewportSnapshot = session.viewportSnapshot ?? null;

  const updateSession = useCallback((update) => {
    onInventorySessionChange?.((current) => {
      const currentSession = current ?? createInventorySession();
      return typeof update === "function" ? update(currentSession) : { ...currentSession, ...update };
    });
  }, [onInventorySessionChange]);

  const networkCells = useMemo(
    () => resolveNetworkWorkingSet(towers, selectedNetworkCellIds),
    [selectedNetworkCellIds, towers],
  );
  const mapAreaCells = useMemo(
    () => resolveViewportSnapshot(towers, viewportSnapshot),
    [towers, viewportSnapshot],
  );
  const searchHasCriteria = Boolean(query.trim() || technology);
  const searchCells = useMemo(
    () => searchInventory(towers, { query, technology }, settings),
    [query, settings, technology, towers],
  );
  const workingSetCells = scope === "network"
    ? networkCells
    : scope === "map-area"
      ? mapAreaCells
      : searchCells;
  const visibleCells = useMemo(
    () => sliceInventoryPage(workingSetCells, session.visibleLimit ?? INVENTORY_PAGE_SIZE),
    [session.visibleLimit, workingSetCells],
  );
  const availableWorkingSetIDs = useMemo(
    () => new Set(workingSetCells.map((tower) => String(tower.id))),
    [workingSetCells],
  );
  const availableWorkingSetKey = [...availableWorkingSetIDs].join("\u0000");
  const mapHasMoved = Boolean(
    scope === "map-area"
      && viewportSnapshot?.bounds
      && currentMapBounds
      && !viewportBoundsEqual(viewportSnapshot.bounds, currentMapBounds),
  );
  const selectedCell = cellDetailId
    ? towers.find((tower) => String(tower.id) === String(cellDetailId)) ?? null
    : null;
  const selectedCellIndex = selectedCell ? towers.findIndex((tower) => tower.id === selectedCell.id) : -1;
  const profile = selectedCell ? resolveRFProfile(selectedCell, settings, selectedCellIndex) : null;
  const errors = profile ? validateRFProfile(profile) : {};
  const advancedErrors = Object.fromEntries(Object.entries(errors).filter(([key]) => ADVANCED_PROFILE_FIELDS.has(key)));
  const editingCells = editSelection
    .map((id) => towers.find((tower) => String(tower.id) === String(id)))
    .filter(Boolean);
  const editingProfiles = editingCells.map((tower) => resolveRFProfile(tower, settings, towers.findIndex((cell) => cell.id === tower.id)));

  useEffect(() => {
    if (cellDetailId) {
      detailHeadingRef.current?.focus({ preventScroll: true });
    } else if (previousDetailIdRef.current) {
      const cellID = focusAfterBackRef.current ?? previousDetailIdRef.current;
      const scrollTop = Number(session.browseScrollTop) || 0;
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = scrollTop;
        const row = rowButtonRefs.current.get(String(cellID));
        if (row) row.focus({ preventScroll: true });
        else scopeButtonRefs.current.get(scope)?.focus({ preventScroll: true });
      });
      focusAfterBackRef.current = null;
    }
    previousDetailIdRef.current = cellDetailId ?? null;
  }, [cellDetailId, scope, session.browseScrollTop]);

  useEffect(() => {
    const currentIDs = session.selectedForEditing ?? [];
    const retained = currentIDs.filter((id) => availableWorkingSetIDs.has(String(id)));
    if (retained.length !== currentIDs.length) {
      updateSession((current) => ({ ...current, selectedForEditing: retained }));
    }
  }, [availableWorkingSetIDs, availableWorkingSetKey, session.selectedForEditing, updateSession]);

  const importFile = async (file) => {
    if (!file) return;
    try {
      if (file.size > MAX_INVENTORY_FILE_BYTES) throw new Error(`Inventory file must be no larger than ${MAX_INVENTORY_FILE_BYTES / (1024 * 1024)} MiB.`);
      const imported = parseInventoryFile(
        await file.text(),
        file.name,
        settings,
        towers.map((tower) => tower.id),
        towers.map((tower) => tower.cellId ?? tower.id),
      );
      onImportCells(imported);
      setMessage(`${imported.length.toLocaleString()} Cell${imported.length === 1 ? "" : "s"} imported.`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const updateProfile = (key, rawValue) => {
    if (!selectedCell || !profile) return;
    const numeric = NUMBER_FIELDS.some(([field]) => field === key) || RECEIVER_NUMBER_FIELDS.has(key);
    const value = key === "pci" && rawValue === "" ? null : numeric ? Number(rawValue) : rawValue;
    if (key === "networkTech") {
      onUpdateProfile(selectedCell.id, { ...profile, ...technologyDefaults(value) });
      return;
    }
    onUpdateProfile(selectedCell.id, { ...profile, [key]: value });
  };

  const selectScope = (nextScope) => {
    updateSession((current) => {
      const next = {
        ...current,
        scope: nextScope,
        visibleLimit: INVENTORY_PAGE_SIZE,
        selectedForEditing: [],
        bulkStage: null,
        batchFields: {},
        batchValues: {},
        browseScrollTop: 0,
      };
      if (nextScope === "map-area" && !current.viewportSnapshot && currentMapBounds) {
        next.viewportSnapshot = captureViewportSnapshot(towers, currentMapBounds);
      }
      return next;
    });
    setMessage("");
  };

  const refreshMapArea = () => {
    if (!currentMapBounds) return;
    const snapshot = captureViewportSnapshot(towers, currentMapBounds);
    updateSession((current) => ({
      ...current,
      viewportSnapshot: snapshot,
      visibleLimit: INVENTORY_PAGE_SIZE,
      selectedForEditing: [],
      bulkStage: null,
      batchFields: {},
      batchValues: {},
      browseScrollTop: 0,
    }));
    setMessage(`Map area refreshed. ${snapshot?.cellIds.length ?? 0} Cells captured.`);
  };

  const updateSearchQuery = (nextQuery) => {
    updateSession((current) => ({
      ...current,
      query: nextQuery,
      visibleLimit: INVENTORY_PAGE_SIZE,
      selectedForEditing: [],
      bulkStage: null,
      batchFields: {},
      batchValues: {},
      browseScrollTop: 0,
    }));
  };

  const updateTechnology = (nextTechnology) => {
    updateSession((current) => ({
      ...current,
      technology: nextTechnology,
      visibleLimit: INVENTORY_PAGE_SIZE,
      selectedForEditing: [],
      bulkStage: null,
      batchFields: {},
      batchValues: {},
      browseScrollTop: 0,
    }));
  };

  const openCell = (tower) => {
    if (listRef.current) {
      updateSession((current) => ({ ...current, browseScrollTop: listRef.current.scrollTop }));
    }
    focusAfterBackRef.current = String(tower.id);
    updateSession((current) => ({ ...current, selectedForEditing: [], bulkStage: null, batchFields: {}, batchValues: {} }));
    onOpenCell(tower.id);
  };

  const goBackToBrowse = () => {
    focusAfterBackRef.current = cellDetailId ? String(cellDetailId) : null;
    onBackToInventory();
  };

  const setBulkSelection = (towerID, checked) => {
    updateSession((current) => {
      const selected = new Set((current.selectedForEditing ?? []).map(String));
      if (checked) selected.add(String(towerID));
      else selected.delete(String(towerID));
      return { ...current, selectedForEditing: [...selected] };
    });
  };

  const startBulkSelection = () => {
    updateSession((current) => ({
      ...current,
      bulkStage: "select",
      selectedForEditing: [],
      batchFields: {},
      batchValues: {},
    }));
    setMessage("");
  };

  const leaveBulkSelection = () => {
    updateSession((current) => ({ ...current, bulkStage: null, selectedForEditing: [], batchFields: {}, batchValues: {} }));
    setMessage("");
  };

  const openBatchForm = () => {
    if (editSelection.length < 2) return;
    updateSession((current) => ({ ...current, bulkStage: "form", batchFields: {}, batchValues: {} }));
    setMessage("");
  };

  const batchChanges = () => Object.fromEntries(SAFE_INVENTORY_BATCH_FIELDS
    .filter(({ key }) => session.batchFields?.[key])
    .map(({ key }) => [key, Number(session.batchValues?.[key])]));
  const enabledBatchFields = SAFE_INVENTORY_BATCH_FIELDS.filter(({ key }) => session.batchFields?.[key]);
  const canReviewBatch = enabledBatchFields.length > 0
    && enabledBatchFields.every(({ key }) => String(session.batchValues?.[key] ?? "").trim() !== "" && Number.isFinite(Number(session.batchValues[key])));

  const reviewBatchChanges = () => {
    if (!canReviewBatch) return;
    const validation = applyInventoryBatchPatch(towers, settings, editSelection, batchChanges());
    if (!validation.ok) {
      setMessage(validation.error);
      return;
    }
    setMessage("");
    updateSession((current) => ({ ...current, bulkStage: "preview" }));
  };

  const applyBatchChanges = () => {
    const changes = batchChanges();
    const result = onApplyBulkEdit?.(editSelection, changes);
    if (!result?.ok) {
      setMessage(result?.error ?? "The selected Cells could not be updated.");
      return;
    }
    updateSession((current) => ({
      ...current,
      bulkStage: null,
      selectedForEditing: [],
      batchFields: {},
      batchValues: {},
    }));
    setMessage(`${editSelection.length} Cells updated. Run RF analysis again to refresh results.`);
  };

  const renderScopeButton = (id, label, count) => (
    <button
      key={id}
      ref={(node) => { if (node) scopeButtonRefs.current.set(id, node); else scopeButtonRefs.current.delete(id); }}
      type="button"
      className={scope === id ? "active" : ""}
      aria-pressed={scope === id}
      onClick={() => selectScope(id)}
    >
      <span>{label}</span>
      {count !== null && count !== undefined ? <small>{count}</small> : null}
    </button>
  );

  return (
    <section className="inventory-panel" aria-label="Cell inventory">
      <div className="inventory-panel-title"><RadioTower size={16} aria-hidden="true" /><h2>Cell Inventory</h2></div>

      {cellDetailId ? (
        selectedCell && profile ? (
          <section className="inventory-editor" aria-label={`Edit Cell ${selectedCell.cellId ?? selectedCell.id}`}>
            <header className="inventory-detail-header">
              <button type="button" className="inventory-back" onClick={goBackToBrowse}>
                <ArrowLeft size={15} aria-hidden="true" />Back to Inventory
              </button>
              <div className="inventory-editor-heading">
                <div className="inventory-cell-identity">
                  <h3 ref={detailHeadingRef} tabIndex={-1}>Cell {selectedCell.cellId ?? selectedCell.id}</h3>
                  <p>{profile.networkTech.toUpperCase()} · {formatFrequency(profile.frequencyGHz)} GHz</p>
                  <small>{inventorySourceLabel(selectedCell.inventorySource)}</small>
                </div>
                <div className="inventory-editor-actions" role="group" aria-label="Cell actions">
                  <button type="button" onClick={() => onDuplicateCell(selectedCell)} title="Duplicate Cell" aria-label={`Duplicate ${selectedCell.cellId ?? selectedCell.id}`}><Copy size={14} aria-hidden="true" /></button>
                  <button type="button" onClick={() => onResetProfile(selectedCell.id)} title="Clear only this Cell’s RF overrides; keep its identity and location" aria-label={`Clear RF overrides for ${selectedCell.cellId ?? selectedCell.id}`}><RotateCcw size={14} aria-hidden="true" /></button>
                  <button type="button" onClick={() => { onDeleteCell(selectedCell.id); goBackToBrowse(); }} title="Delete Cell" aria-label={`Delete ${selectedCell.cellId ?? selectedCell.id}`}><Trash2 size={14} aria-hidden="true" /></button>
                </div>
              </div>
            </header>
            <p className="inventory-reset-scope">Reset RF overrides clears this Cell’s per-Cell RF profile and keeps its identity and location.</p>
            <DisclosureSection title="Planning" description="Identity, location, carrier profile, and common transmitter/receiver assumptions." defaultOpen>
              <fieldset>
                <legend>Position</legend>
                <div className="inventory-field-grid">
                  <InventoryField label="Longitude"><input type="number" step="0.000001" value={selectedCell.coordinates[0]} onChange={(event) => onMoveCell(selectedCell.id, [Number(event.target.value), selectedCell.coordinates[1]])} /></InventoryField>
                  <InventoryField label="Latitude"><input type="number" step="0.000001" value={selectedCell.coordinates[1]} onChange={(event) => onMoveCell(selectedCell.id, [selectedCell.coordinates[0], Number(event.target.value)])} /></InventoryField>
                </div>
                {selectedCell.editable ? <p className="field-help">This Cell’s selected map marker is draggable.</p> : <p className="field-help">Editing coordinates creates a project-local position override.</p>}
              </fieldset>
              <fieldset>
                <legend>Carrier & common assumptions</legend>
                <div className="inventory-field-grid">
                  <InventoryField label="Technology"><select value={profile.networkTech} onChange={(event) => updateProfile("networkTech", event.target.value)}>{NETWORK_TECHNOLOGIES.map((networkTechnology) => <option key={networkTechnology.id} value={networkTechnology.id}>{networkTechnology.label}</option>)}</select></InventoryField>
                  {NUMBER_FIELDS.filter(([key]) => PLANNING_PROFILE_FIELDS.has(key)).map(([key, label, unit, step]) => (
                    <InventoryField key={key} label={label} unit={unit} error={errors[key]}>
                      <input type="number" step={step} value={profile[key] ?? ""} onChange={(event) => updateProfile(key, event.target.value)} />
                    </InventoryField>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Receiver threshold</legend>
                <div className="inventory-field-grid">
                  <InventoryField label="Threshold mode" error={errors.receiverSensitivityMode}>
                    <select value={profile.receiverSensitivityMode} onChange={(event) => updateProfile("receiverSensitivityMode", event.target.value)}>
                      {(RF_PROFILE_OPTIONS.receiverSensitivityModes ?? [{ id: "manual", label: "Manual" }, { id: "derived", label: "Derived" }]).map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
                    </select>
                  </InventoryField>
                  {profile.receiverSensitivityMode === "manual" ? (
                    <InventoryField label="RX sensitivity" unit="dBm" error={errors.receiverSensitivityDbm}>
                      <input type="number" step="0.1" value={profile.receiverSensitivityDbm ?? ""} onChange={(event) => updateProfile("receiverSensitivityDbm", event.target.value)} />
                    </InventoryField>
                  ) : <p className="field-help">Derived sensitivity inputs are in Advanced; the effective receiver threshold remains separate from building-service and radio-quality thresholds.</p>}
                </div>
              </fieldset>
            </DisclosureSection>
            <DisclosureSection
              title="Advanced"
              description="Additional antenna, channel, load, and derived receiver configuration."
              attention={Object.keys(advancedErrors).length > 0}
              attentionMessage="Advanced settings need attention"
              focusInvalid
            >
              <fieldset>
                <legend>Carrier detail</legend>
                <div className="inventory-field-grid">
                  <InventoryField label="Band" error={errors.band}><input value={profile.band} onChange={(event) => updateProfile("band", event.target.value)} /></InventoryField>
                  <InventoryField label="Channel" error={errors.channelId}><input value={profile.channelId} onChange={(event) => updateProfile("channelId", event.target.value)} /></InventoryField>
                  <InventoryField label="Duplex" error={errors.duplexMode}><select value={profile.duplexMode} onChange={(event) => updateProfile("duplexMode", event.target.value)}>{RF_PROFILE_OPTIONS.duplexModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}</select></InventoryField>
                </div>
              </fieldset>
              <fieldset>
                <legend>Antenna & radio-quality detail</legend>
                <p className="field-help inventory-model-note">TX power is conducted; TX gain is absolute boresight gain; pattern loss is relative. RX gain and polarization loss are explicit scalar link terms.</p>
                <div className="inventory-field-grid">
                  {NUMBER_FIELDS.filter(([key]) => ADVANCED_PROFILE_FIELDS.has(key) && !["receiverNoiseBandwidthHz", "receiverNoiseFigureDb", "receiverRequiredSnrDb", "receiverMarginDb"].includes(key)).map(([key, label, unit, step]) => (
                    <InventoryField key={key} label={label} unit={unit} error={errors[key]}>
                      <input type="number" step={step} value={profile[key] ?? ""} onChange={(event) => updateProfile(key, event.target.value)} />
                    </InventoryField>
                  ))}
                  <InventoryField label="Horizontal pattern" error={errors.horizontalPatternId}><select value={profile.horizontalPatternId} onChange={(event) => updateProfile("horizontalPatternId", event.target.value)}>{RF_PROFILE_OPTIONS.horizontalPatterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}</select></InventoryField>
                  <InventoryField label="Vertical pattern" error={errors.verticalPatternId}><select value={profile.verticalPatternId} onChange={(event) => updateProfile("verticalPatternId", event.target.value)}>{RF_PROFILE_OPTIONS.verticalPatterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}</select></InventoryField>
                </div>
              </fieldset>
              {profile.receiverSensitivityMode === "derived" ? (
                <fieldset className="receiver-sensitivity-editor">
                  <legend>Derived receiver threshold</legend>
                  <div className="inventory-field-grid">
                    <InventoryField label="Noise bandwidth" unit="MHz" error={errors.receiverNoiseBandwidthHz}>
                      <input type="number" min="0.000001" step="0.1" value={Number(profile.receiverNoiseBandwidthHz) / 1e6} onChange={(event) => updateProfile("receiverNoiseBandwidthHz", Number(event.target.value) * 1e6)} />
                    </InventoryField>
                    <InventoryField label="Noise figure" unit="dB" error={errors.receiverNoiseFigureDb}><input type="number" step="0.1" value={profile.receiverNoiseFigureDb ?? ""} onChange={(event) => updateProfile("receiverNoiseFigureDb", event.target.value)} /></InventoryField>
                    <InventoryField label="Required SNR" unit="dB" error={errors.receiverRequiredSnrDb}><input type="number" step="0.1" value={profile.receiverRequiredSnrDb ?? ""} onChange={(event) => updateProfile("receiverRequiredSnrDb", event.target.value)} /></InventoryField>
                    <InventoryField label="Receiver margin" unit="dB" error={errors.receiverMarginDb}><input type="number" step="0.1" value={profile.receiverMarginDb ?? ""} onChange={(event) => updateProfile("receiverMarginDb", event.target.value)} /></InventoryField>
                  </div>
                  <p className="field-help">Derived = −174 dBm/Hz + 10 log₁₀(noise bandwidth) + NF + required SNR + margin. Interference noise and SINR remain a separate model.</p>
                </fieldset>
              ) : null}
            </DisclosureSection>
            {Object.keys(errors).length ? <p className="inventory-validation" role="alert">Fix {Object.keys(errors).length} profile field{Object.keys(errors).length === 1 ? "" : "s"} before running RF analysis.</p> : <p className="inventory-valid">Profile valid · request-ready</p>}
          </section>
        ) : (
          <section className="inventory-detail-missing" aria-label="Cell editor">
            <button type="button" className="inventory-back" onClick={goBackToBrowse}><ArrowLeft size={15} aria-hidden="true" />Back to Inventory</button>
            <h3>Cell no longer available</h3>
            <p>This Cell is no longer part of the loaded inventory. Return to your working set.</p>
          </section>
        )
      ) : bulkStage === "form" || bulkStage === "preview" ? (
        <BatchEditor
          fields={SAFE_INVENTORY_BATCH_FIELDS}
          message={message}
          onApply={applyBatchChanges}
          onBack={() => updateSession((current) => ({ ...current, bulkStage: "select" }))}
          onCancel={leaveBulkSelection}
          onChangeEnabled={(key, enabled) => {
            updateSession((current) => ({ ...current, batchFields: { ...(current.batchFields ?? {}), [key]: enabled } }));
            setMessage("");
          }}
          onChangeValue={(key, value) => {
            updateSession((current) => ({ ...current, batchValues: { ...(current.batchValues ?? {}), [key]: value } }));
            setMessage("");
          }}
          onReview={reviewBatchChanges}
          onReturnToForm={() => updateSession((current) => ({ ...current, bulkStage: "form" }))}
          profiles={editingProfiles}
          selectedCount={editSelection.length}
          stage={bulkStage}
          values={session.batchValues ?? {}}
          enabled={session.batchFields ?? {}}
          canReview={canReviewBatch}
          changes={batchChanges()}
        />
      ) : (
        <>
          <div className="inventory-actions">
            <button type="button" className={isPlacingCell ? "active" : ""} onClick={isPlacingCell ? onCancelPlacement : onStartPlacement}>
              {isPlacingCell ? <X size={14} aria-hidden="true" /> : <Crosshair size={14} aria-hidden="true" />}{isPlacingCell ? "Cancel placement" : "Place new Cell"}
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}><Upload size={14} aria-hidden="true" />Import</button>
            <input ref={fileRef} hidden type="file" accept=".csv,.json,.geojson,text/csv,application/geo+json,application/json" onChange={(event) => { importFile(event.target.files?.[0]); event.target.value = ""; }} />
          </div>
          {isPlacingCell ? <p className="inventory-placement" role="status">Click the map to place the new Cell.</p> : null}
          {message ? <p className="inventory-message" role="status">{message}</p> : null}

          <div className="inventory-scope-switch" role="group" aria-label="Inventory scope">
            {renderScopeButton("network", "Network", networkCells.length)}
            {renderScopeButton("map-area", "Map area", viewportSnapshot ? mapAreaCells.length : "—")}
            {renderScopeButton("search", "Search / Filter", searchHasCriteria ? searchCells.length : null)}
          </div>

          {scope === "network" ? (
            <section className="inventory-working-set" aria-labelledby="inventory-working-set-title">
              <div className="inventory-working-set-heading">
                <div><h3 id="inventory-working-set-title">Network</h3><p>Cells currently in the Network selection, in request order.</p></div>
                <span>{networkCells.length} {pluralize(networkCells.length, "Cell")} in Network</span>
              </div>
              {networkCells.length === 0 ? (
                <div className="inventory-zero-state">
                  <h4>No Cells in the current Network.</h4>
                  <p>Select Cells on the map to build the Network.</p>
                  <button type="button" onClick={onSelectCellsOnMap}>Select cells on map</button>
                </div>
              ) : renderWorkingSetRows()}
            </section>
          ) : null}

          {scope === "map-area" ? (
            <section className="inventory-working-set" aria-labelledby="inventory-working-set-title">
              <div className="inventory-working-set-heading">
                <div><h3 id="inventory-working-set-title">Map area</h3><p>Cells whose marker coordinates were inside the captured map bounds.</p></div>
                <span>{viewportSnapshot ? `${mapAreaCells.length} ${pluralize(mapAreaCells.length, "Cell")}` : "Not captured"}</span>
              </div>
              <div className={`inventory-area-status${mapHasMoved ? " moved" : ""}`} role="status" aria-live="polite">
                {!viewportSnapshot ? <span>{currentMapBounds ? "Capture the current map area to list its Cells." : "Map area is available when the map is ready."}</span> : null}
                {viewportSnapshot && mapHasMoved ? <><span>{mapAreaCells.length} {pluralize(mapAreaCells.length, "Cell")} · captured from the previous map area</span><strong>Map moved</strong></> : null}
                {viewportSnapshot && !mapHasMoved ? <span>{mapAreaCells.length} {pluralize(mapAreaCells.length, "Cell")} in the captured map area</span> : null}
                <button type="button" onClick={refreshMapArea} disabled={!currentMapBounds}>Refresh area</button>
              </div>
              {viewportSnapshot && mapAreaCells.length === 0 ? (
                <div className="inventory-zero-state"><h4>No Cells in this map area.</h4><p>Pan or zoom to another area, then refresh.</p></div>
              ) : null}
              {viewportSnapshot && mapAreaCells.length > 0 ? renderWorkingSetRows() : null}
            </section>
          ) : null}

          {scope === "search" ? (
            <section className="inventory-working-set" aria-labelledby="inventory-working-set-title">
              <div className="inventory-working-set-heading">
                <div><h3 id="inventory-working-set-title">Search / Filter</h3><p>Search the loaded inventory by Cell ID or record ID; technology uses the resolved Cell profile.</p></div>
              </div>
              <div className="inventory-search-controls">
                <label className="inventory-search"><Search size={14} aria-hidden="true" /><input value={query} onChange={(event) => updateSearchQuery(event.target.value)} placeholder="Enter a Cell ID" aria-label="Search by Cell ID or record ID" /></label>
                <label className="inventory-technology-filter"><span>Technology</span><select value={technology} onChange={(event) => updateTechnology(event.target.value)} aria-label="Filter by technology"><option value="">All technologies</option>{NETWORK_TECHNOLOGIES.map((networkTechnology) => <option key={networkTechnology.id} value={networkTechnology.id}>{networkTechnology.label}</option>)}</select></label>
              </div>
              {!searchHasCriteria ? (
                <div className="inventory-zero-state inventory-search-empty"><h4>Search the inventory</h4><p>Enter a Cell ID or choose a filter.</p></div>
              ) : searchCells.length === 0 ? (
                <div className="inventory-zero-state"><h4>No Cells match these filters.</h4><button type="button" onClick={() => { updateSearchQuery(""); updateTechnology(""); }}>Clear filters</button></div>
              ) : (
                <>
                  <div className="inventory-search-results-heading">
                    <p className="inventory-results-count" role="status" aria-live="polite">{searchCells.length.toLocaleString()} {pluralize(searchCells.length, "match")}</p>
                    {searchCells.length > 1 ? <button type="button" onClick={startBulkSelection} disabled={bulkStage === "select"}>Edit multiple</button> : null}
                  </div>
                  {renderWorkingSetRows()}
                </>
              )}
            </section>
          ) : null}

          {scope !== "search" && workingSetCells.length > 0 ? (
            <div className="inventory-browse-actions">
              {bulkStage === "select" ? (
                <>
                  <p>{editSelection.length} selected for editing</p>
                  <button type="button" onClick={openBatchForm} disabled={editSelection.length < 2}>Edit {editSelection.length} Cells</button>
                  <button type="button" className="inventory-secondary-action" onClick={leaveBulkSelection}>Cancel</button>
                </>
              ) : <button type="button" onClick={startBulkSelection} disabled={workingSetCells.length < 2}>Edit multiple</button>}
            </div>
          ) : null}

          {scope === "search" && searchHasCriteria && searchCells.length > 0 && bulkStage === "select" ? (
            <div className="inventory-browse-actions">
              <p>{editSelection.length} selected for editing</p>
              <button type="button" onClick={openBatchForm} disabled={editSelection.length < 2}>Edit {editSelection.length} Cells</button>
              <button type="button" className="inventory-secondary-action" onClick={leaveBulkSelection}>Cancel</button>
            </div>
          ) : null}

        </>
      )}
    </section>
  );

  function renderWorkingSetRows() {
    return (
      <>
        <ul className="inventory-list" ref={listRef} aria-label={`${scopeLabel(scope)} Cells`}>
          {visibleCells.map((tower) => {
            const cellID = String(tower.id);
            const displayID = tower.cellId ?? tower.id;
            const cellProfile = resolveRFProfile(tower, settings, towers.findIndex((cell) => cell.id === tower.id));
            const isActiveTransmitter = String(activeTransmitterId ?? "") === cellID;
            return (
              <li key={cellID}>
                <div className="inventory-cell-row">
                  {bulkStage === "select" ? (
                    <label className="inventory-bulk-checkbox">
                      <input type="checkbox" checked={editSelection.some((id) => String(id) === cellID)} onChange={(event) => setBulkSelection(cellID, event.target.checked)} aria-label={`Select Cell ${displayID} for editing`} />
                    </label>
                  ) : null}
                  <button
                    ref={(node) => { if (node) rowButtonRefs.current.set(cellID, node); else rowButtonRefs.current.delete(cellID); }}
                    type="button"
                    className="inventory-cell-open"
                    aria-label={`Edit Cell ${displayID}`}
                    onClick={() => openCell(tower)}
                  >
                    <span className="inventory-cell-copy">
                      <strong>{displayID}</strong>
                      <small>{cellProfile.networkTech.toUpperCase()} · {formatFrequency(cellProfile.frequencyGHz)} GHz · {inventorySourceLabel(tower.inventorySource)}</small>
                    </span>
                    {isActiveTransmitter ? <span className="inventory-active-badge">Active transmitter</span> : null}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {workingSetCells.length > visibleCells.length ? (
          <button type="button" className="inventory-show-more" onClick={() => updateSession((current) => ({ ...current, visibleLimit: (current.visibleLimit ?? INVENTORY_PAGE_SIZE) + INVENTORY_PAGE_SIZE }))}>
            Show next {INVENTORY_PAGE_SIZE} <span>({visibleCells.length.toLocaleString()} of {workingSetCells.length.toLocaleString()})</span>
          </button>
        ) : null}
      </>
    );
  }
}

function BatchEditor({
  canReview,
  changes,
  enabled,
  fields,
  message,
  onApply,
  onBack,
  onCancel,
  onChangeEnabled,
  onChangeValue,
  onReview,
  onReturnToForm,
  profiles,
  selectedCount,
  stage,
  values,
}) {
  const isPreview = stage === "preview";
  return (
    <section className="inventory-batch-editor" aria-label={isPreview ? "Review batch changes" : "Edit multiple Cells"}>
      <button type="button" className="inventory-back" onClick={isPreview ? onReturnToForm : onBack}><ArrowLeft size={15} aria-hidden="true" />{isPreview ? "Back to edits" : "Back to Inventory"}</button>
      <header>
        <h3>{isPreview ? `Apply to ${selectedCount} Cells` : `Edit ${selectedCount} Cells`}</h3>
        <p>{isPreview ? "Review these changes before applying them." : "Only enabled fields will change. Each enabled field needs a value."}</p>
      </header>
      {isPreview ? (
        <ul className="inventory-batch-preview">
          {fields.filter(({ key }) => enabled[key]).map((field) => {
            const unchanged = profiles.length > 0 && profiles.every((profile) => Number(profile[field.key]) === Number(changes[field.key]));
            return <li key={field.key}><span>{field.label}</span><strong>{unchanged ? "Unchanged" : `→ ${formatBatchValue(changes[field.key], field.unit)}`}</strong></li>;
          })}
        </ul>
      ) : (
        <div className="inventory-batch-fields">
          {fields.map((field) => {
            const valuesForField = profiles.map((profile) => Number(profile[field.key]));
            const isMixed = valuesForField.length > 1 && valuesForField.some((value) => value !== valuesForField[0]);
            const currentValue = valuesForField.length && !isMixed ? formatBatchValue(valuesForField[0], field.unit) : "";
            return (
              <div key={field.key} className="inventory-batch-field">
                <label className="inventory-batch-enable"><input type="checkbox" checked={Boolean(enabled[field.key])} onChange={(event) => onChangeEnabled(field.key, event.target.checked)} /><span>{field.label}</span></label>
                <small>{isMixed ? "Mixed across selected Cells" : `Current value: ${currentValue}`}</small>
                <label className="inventory-batch-value"><span>{field.label}</span><input type="number" step={field.step} value={values[field.key] ?? ""} placeholder={isMixed ? "Mixed" : "Enter a value"} disabled={!enabled[field.key]} onChange={(event) => onChangeValue(field.key, event.target.value)} aria-label={`${field.label} batch value`} />{field.unit ? <em>{field.unit}</em> : null}</label>
              </div>
            );
          })}
        </div>
      )}
      {message ? <p className="inventory-validation" role="alert">{message}</p> : null}
      <div className="inventory-batch-actions">
        {isPreview ? <><button type="button" className="inventory-secondary-action" onClick={onReturnToForm}>Cancel</button><button type="button" onClick={onApply}>Apply changes</button></> : <><button type="button" className="inventory-secondary-action" onClick={onCancel}>Cancel</button><button type="button" onClick={onReview} disabled={!canReview}>Review changes</button></>}
      </div>
    </section>
  );
}

function InventoryField({ children, error, label, unit }) {
  const control = error ? cloneElement(children, { "aria-invalid": "true" }) : children;
  return <label className={error ? "invalid" : ""}><span>{label}{unit ? <small>{unit}</small> : null}</span>{control}{error ? <em>{error}</em> : null}</label>;
}

function formatFrequency(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en", { maximumFractionDigits: 3 }) : "—";
}

function formatBatchValue(value, unit) {
  const formatted = Number(value).toLocaleString("en", { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function inventorySourceLabel(source) {
  const labels = {
    dataset: "Dataset",
    "project override": "Project override",
    import: "Imported",
    manual: "Manual",
    duplicate: "Duplicate",
  };
  return labels[source] ?? "Source unavailable";
}

function scopeLabel(scope) {
  return scope === "map-area" ? "Map area" : scope === "network" ? "Network" : "Search result";
}

function pluralize(count, noun) {
  if (count === 1) return noun;
  return noun === "match" ? "matches" : `${noun}s`;
}

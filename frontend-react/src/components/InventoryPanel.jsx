import { useMemo, useRef, useState } from "react";
import { Copy, Crosshair, RadioTower, RotateCcw, Search, Trash2, Upload, X } from "lucide-react";
import { NETWORK_TECHNOLOGIES, RF_PROFILE_OPTIONS } from "../generated/policy.js";
import { MAX_INVENTORY_FILE_BYTES, parseInventoryFile } from "../utils/inventoryImport.js";
import { resolveRFProfile, technologyDefaults, validateRFProfile } from "../utils/rfProfile.js";

const NUMBER_FIELDS = [
  ["frequencyGHz", "Frequency", "GHz", "0.1"],
  ["bandwidthMHz", "Bandwidth", "MHz", "0.1"],
  ["txPowerDbm", "TX power", "dBm", "0.1"],
  ["antennaGainDbi", "Antenna gain", "dBi", "0.1"],
  ["systemLossDb", "System loss", "dB", "0.1"],
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
  ["receiverSensitivityDbm", "RX sensitivity", "dBm", "0.1"],
];

export default function InventoryPanel({
  isPlacingCell,
  onCancelPlacement,
  onDeleteCell,
  onDuplicateCell,
  onImportCells,
  onMoveCell,
  onResetProfile,
  onSelectCell,
  onStartPlacement,
  onUpdateProfile,
  selectedTower,
  settings,
  towers,
}) {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const fileRef = useRef(null);
  const profile = selectedTower ? resolveRFProfile(selectedTower, settings, towers.findIndex((tower) => tower.id === selectedTower.id)) : null;
  const errors = profile ? validateRFProfile(profile) : {};
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return towers.filter((tower) => !normalized
      || String(tower.id).toLowerCase().includes(normalized)
      || String(tower.cellId ?? "").toLowerCase().includes(normalized)).slice(0, 250);
  }, [query, towers]);

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
      setMessage(`${imported.length.toLocaleString()} cell${imported.length === 1 ? "" : "s"} imported.`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const update = (key, rawValue) => {
    if (!selectedTower || !profile) return;
    const numeric = NUMBER_FIELDS.some(([field]) => field === key);
    const value = key === "pci" && rawValue === "" ? null : numeric ? Number(rawValue) : rawValue;
    if (key === "networkTech") {
      onUpdateProfile(selectedTower.id, { ...profile, ...technologyDefaults(value) });
      return;
    }
    onUpdateProfile(selectedTower.id, { ...profile, [key]: value });
  };

  return (
    <section className="inventory-panel" aria-label="Cell inventory editor">
      <div className="panel-title"><RadioTower size={16} /><span>Cell Inventory</span></div>
      <p className="data-note">Create, place, drag, duplicate, or import local planning cells. Per-cell profiles override plan defaults in every RF request.</p>
      <div className="inventory-actions">
        <button type="button" className={isPlacingCell ? "active" : ""} onClick={isPlacingCell ? onCancelPlacement : onStartPlacement}>
          {isPlacingCell ? <X size={14} /> : <Crosshair size={14} />}{isPlacingCell ? "Cancel placement" : "Place new cell"}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import</button>
        <input ref={fileRef} hidden type="file" accept=".csv,.json,.geojson,text/csv,application/geo+json,application/json" onChange={(event) => { importFile(event.target.files?.[0]); event.target.value = ""; }} />
      </div>
      {isPlacingCell ? <p className="inventory-placement" role="status">Click the map to place the new cell.</p> : null}
      {message ? <p className="inventory-message" role="status">{message}</p> : null}
      <label className="inventory-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cells" aria-label="Search cells" /></label>
      <div className="inventory-list" role="listbox" aria-label="Available cells">
        {filtered.map((tower) => (
          <button key={tower.id} type="button" role="option" aria-selected={selectedTower?.id === tower.id} onClick={() => onSelectCell(tower)}>
            <span><strong>{tower.cellId ?? tower.id}</strong><small>{tower.id}</small></span>
            <em>{resolveRFProfile(tower, settings).networkTech.toUpperCase()}</em>
          </button>
        ))}
        {towers.length > filtered.length ? <p>Showing the first 250 matching cells.</p> : null}
      </div>

      {selectedTower && profile ? (
        <section className="inventory-editor" aria-label={`Edit ${selectedTower.id}`}>
          <div className="inventory-editor-heading">
            <span><strong>{selectedTower.cellId ?? selectedTower.id}</strong><small>{selectedTower.inventorySource ?? "dataset"}</small></span>
            <div>
              <button type="button" onClick={() => onDuplicateCell(selectedTower)} title="Duplicate cell" aria-label={`Duplicate ${selectedTower.cellId ?? selectedTower.id}`}><Copy size={14} /></button>
              <button type="button" onClick={() => onResetProfile(selectedTower.id)} title="Use plan defaults" aria-label={`Reset ${selectedTower.cellId ?? selectedTower.id} to plan defaults`}><RotateCcw size={14} /></button>
              <button type="button" onClick={() => onDeleteCell(selectedTower.id)} title="Delete cell" aria-label={`Delete ${selectedTower.cellId ?? selectedTower.id}`}><Trash2 size={14} /></button>
            </div>
          </div>
          <fieldset>
            <legend>Position</legend>
            <div className="inventory-field-grid">
              <InventoryField label="Longitude"><input type="number" step="0.000001" value={selectedTower.coordinates[0]} onChange={(event) => onMoveCell(selectedTower.id, [Number(event.target.value), selectedTower.coordinates[1]])} /></InventoryField>
              <InventoryField label="Latitude"><input type="number" step="0.000001" value={selectedTower.coordinates[1]} onChange={(event) => onMoveCell(selectedTower.id, [selectedTower.coordinates[0], Number(event.target.value)])} /></InventoryField>
            </div>
            {selectedTower.editable ? <p className="field-help">The selected map marker is draggable.</p> : <p className="field-help">Editing coordinates creates a project-local position override.</p>}
          </fieldset>
          <fieldset>
            <legend>Carrier & channel</legend>
            <div className="inventory-field-grid">
              <InventoryField label="Technology"><select value={profile.networkTech} onChange={(event) => update("networkTech", event.target.value)}>{NETWORK_TECHNOLOGIES.map((technology) => <option key={technology.id} value={technology.id}>{technology.label}</option>)}</select></InventoryField>
              <InventoryField label="Band" error={errors.band}><input value={profile.band} onChange={(event) => update("band", event.target.value)} /></InventoryField>
              <InventoryField label="Channel" error={errors.channelId}><input value={profile.channelId} onChange={(event) => update("channelId", event.target.value)} /></InventoryField>
              <InventoryField label="Duplex" error={errors.duplexMode}><select value={profile.duplexMode} onChange={(event) => update("duplexMode", event.target.value)}>{RF_PROFILE_OPTIONS.duplexModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}</select></InventoryField>
            </div>
          </fieldset>
          <fieldset>
            <legend>Antenna & receiver</legend>
            <div className="inventory-field-grid">
              {NUMBER_FIELDS.map(([key, label, unit, step]) => (
                <InventoryField key={key} label={label} unit={unit} error={errors[key]}>
                  <input type="number" step={step} value={profile[key] ?? ""} onChange={(event) => update(key, event.target.value)} />
                </InventoryField>
              ))}
              <InventoryField label="Horizontal pattern" error={errors.horizontalPatternId}><select value={profile.horizontalPatternId} onChange={(event) => update("horizontalPatternId", event.target.value)}>{RF_PROFILE_OPTIONS.horizontalPatterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}</select></InventoryField>
              <InventoryField label="Vertical pattern" error={errors.verticalPatternId}><select value={profile.verticalPatternId} onChange={(event) => update("verticalPatternId", event.target.value)}>{RF_PROFILE_OPTIONS.verticalPatterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}</select></InventoryField>
            </div>
          </fieldset>
          {Object.keys(errors).length ? <p className="inventory-validation" role="alert">Fix {Object.keys(errors).length} profile field{Object.keys(errors).length === 1 ? "" : "s"} before running RF analysis.</p> : <p className="inventory-valid">Profile valid · request-ready</p>}
        </section>
      ) : <p className="inventory-empty">Select a cell to edit its RF profile.</p>}
    </section>
  );
}

function InventoryField({ children, error, label, unit }) {
  return <label className={error ? "invalid" : ""}><span>{label}{unit ? <small>{unit}</small> : null}</span>{children}{error ? <em>{error}</em> : null}</label>;
}

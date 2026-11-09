import { useCallback, useEffect, useRef, useState } from "react";
import { platform } from "../platform/index.js";

// This focused native task inherits the existing dialog, form and disclosure
// styles. It remains mounted even while dataset/API readiness is unavailable.
export default function NativeDatasetManager({ onActivate, activeID, adapter = platform.datasets }) {
  const [open, setOpen] = useState(false);
  const [registry, setRegistry] = useState({ datasets: [], phase: "idle", busy: false });
  const [selection, setSelection] = useState(null);
  const [mode, setMode] = useState("managed");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const busy = useRef(false);
  const activateRef = useRef(onActivate);
  useEffect(() => { activateRef.current = onActivate; }, [onActivate]);
  const refresh = useCallback(async () => { if (adapter) setRegistry(await adapter.status()); }, [adapter]);
  const perform = useCallback(async (operation) => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(""); setMessage("");
    try { return await operation(); }
    catch (failure) { setError(failure.message); }
    finally { busy.current = false; setPending(false); await refresh().catch((failure) => setError(failure.message)); }
  }, [refresh]);
  const choose = useCallback((kind) => perform(async () => {
    setSelection(null); setMode("managed");
    const result = await adapter.choose(kind);
    if (result.canceled) setMessage("Selection canceled. Existing packs are unchanged.");
    else setSelection(result);
  }), [adapter, perform]);
  useEffect(() => {
    if (!adapter) return undefined;
    return adapter.onCommand((command) => {
      if (!["directory", "manifest", "manage"].includes(command)) return;
      setOpen(true);
      if (command === "manage") void refresh().catch((failure) => setError(failure.message));
      else void choose(command);
    });
  }, [adapter, choose, refresh]);
  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    if (typeof dialog?.showModal === "function") dialog.showModal();
    else dialog?.setAttribute("open", "");
    closeRef.current?.focus({ preventScroll: true });
    const timer = setInterval(() => { void refresh().catch((failure) => setError(failure.message)); }, 500);
    return () => { clearInterval(timer); if (dialog?.open && typeof dialog.close === "function") dialog.close(); else dialog?.removeAttribute("open"); };
  }, [open, refresh]);
  if (!adapter || !open) return null;
  const blocked = pending || registry.busy;
  const close = () => { if (!blocked) { setOpen(false); setSelection(null); void adapter.cancel().catch(() => {}); } };
  const install = () => perform(async () => {
    const result = await adapter.install({ ticket: selection.ticket, mode });
    setSelection(null);
    setMessage(result.warning || (result.alreadyRegistered ? "This exact pack is already bundled. Choose Activate to validate and use it." : "Dataset registered. Choose Activate when you are ready to replace the current planning data."));
  });
  const activate = (id) => perform(async () => {
    const result = await activateRef.current(id);
    if (result?.error) throw new Error(result.error);
    if (result?.status !== "active") throw new Error("Activation has not completed. Wait for the current dataset operation and try again.");
    setMessage(result?.warning || "Dataset active. Existing saved projects remain bound to their original dataset.");
  });
  return (
    <dialog ref={dialogRef} className="apply-solution-dialog native-dataset-dialog" aria-modal="true" aria-labelledby="native-dataset-title"
      onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className="native-dataset-heading"><h3 id="native-dataset-title">Dataset packs</h3><button ref={closeRef} type="button" disabled={blocked} onClick={close}>Close</button></div>
      <p className="data-note">Add a validated pack, then activate it. Activation clears current results; saved projects keep their original dataset identity.</p>
      <div className="apply-solution-actions native-dataset-actions">
        <button type="button" disabled={blocked} onClick={() => choose("directory")}>Choose pack folder…</button>
        <button type="button" disabled={blocked} onClick={() => choose("manifest")}>Choose manifest…</button>
      </div>
      {blocked ? <div className="native-dataset-progress"><p role="status">{registry.phase === "idle" ? "Preparing dataset operation…" : `Dataset: ${registry.phase}…`}</p>
        <button type="button" disabled={registry.phase === "activating"} onClick={() => { void adapter.cancel().then((result) => setMessage(result.message || "Cancel requested…")).catch((failure) => setError(failure.message)); }}>Cancel operation</button></div> : null}
      {error ? <p className="project-warning" role="alert">{error}</p> : null}
      {message ? <p className="inventory-message" role="status">{message}</p> : null}
      {registry.warning ? <p className="project-warning">{registry.warning}</p> : null}
      {selection ? <section aria-label="Selected dataset pack" className="native-dataset-selection">
        <h4>{selection.manifest.name} · {selection.manifest.version}</h4>
        <dl><dt>Identity</dt><dd>{selection.manifest.id}</dd><dt>Source folder</dt><dd>{selection.location}</dd>
          <dt>Declared size</dt><dd>{selection.bytes.toLocaleString()} bytes ({(selection.bytes / 1024 ** 2).toFixed(2)} MiB)</dd>
          <dt>Manifest SHA-256</dt><dd>{selection.manifest_sha256}</dd>
          <dt>Sources</dt><dd>{selection.manifest.sources.join("; ")}</dd><dt>Licenses</dt><dd>{selection.manifest.licenses.join("; ")}</dd></dl>
        <details><summary>Declared layer hashes</summary><dl>{Object.entries(selection.manifest.files).map(([layer, name]) => <div key={layer}><dt>{layer}: {name}</dt><dd>{selection.manifest.sha256[name]}</dd></div>)}</dl></details>
        <fieldset disabled={blocked}><legend>Storage</legend>
          <label><input type="radio" name="dataset-storage" value="managed" checked={mode === "managed"} onChange={() => setMode("managed")} /> Copy into A.T.O.M (recommended)</label>
          <p className="data-note">Copies only declared files and revalidates the staged pack. The original folder stays unchanged.</p>
          <label><input type="radio" name="dataset-storage" value="reference" checked={mode === "reference"} onChange={() => setMode("reference")} /> Reference this folder (advanced)</label>
          <p className="data-note">Keep the folder and drive available. Changed contents are rejected. To locate a moved reference, choose the same pack again and register its new folder.</p>
        </fieldset>
        <div className="apply-solution-actions"><button type="button" className="primary" disabled={blocked} onClick={install}>{mode === "managed" ? "Copy and register" : "Register reference"}</button></div>
      </section> : null}
      <section aria-label="Registered dataset packs" className="native-dataset-list"><h4>Registered packs</h4>
        {registry.datasets.length ? registry.datasets.map((entry) => <div key={entry.id} className="native-dataset-entry">
          <div><strong>{entry.name || entry.id}</strong><p>{entry.id} · {entry.version} · {entry.mode}{entry.id === registry.startup_id ? " · Startup selection" : ""}</p>
            <details><summary>Location and manifest hash</summary><p>{entry.location}</p><p>{entry.manifest_sha256}</p></details></div>
          <button type="button" disabled={blocked} onClick={() => activate(entry.id)}>{entry.id === activeID ? "Revalidate active pack" : "Activate"}</button>
        </div>) : <p className="data-note">No usable packs are registered. Choose a valid pack to recover.</p>}
      </section>
    </dialog>
  );
}

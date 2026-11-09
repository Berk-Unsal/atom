"use strict";
const io = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { atomicWriteJSON, validateSettings } = require("./settings-store.cjs");
const { DatasetError, invalid, checkAbort, sourceRoot, readManifest, streamLayer, inspectDataset } = require("./dataset-source.cjs");
const validHash = (hash) => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash);
const legacyEntry = (entry) => entry && !Object.hasOwn(entry, "mode") && !Object.hasOwn(entry, "manifest_sha256");
class DatasetRegistry {
  constructor({ settings, packsRoot, registryFile, bundledRoot, executable, selectSource, activate, isBusy = () => false, inspect = inspectDataset }) {
    Object.assign(this, { settings, packsRoot, registryFile, bundledRoot, executable, selectSource, activate, isBusy, inspect });
    this.busy = false; this.phase = "idle"; this.ticket = null; this.abort = null; this.bundle = null;
  }
  entries() {
    // Schema 1 already allowed metadata-only {id,path} records before native
    // installation existed. Preserve them verbatim, but never treat them as
    // approved roots or prevent the durable workspace from opening.
    const entries = this.settings.value.datasets.filter((entry) => !legacyEntry(entry));
    const ids = new Set(this.bundle ? [this.bundle.id] : []);
    for (const entry of entries) {
      if (!entry || ids.has(entry.id) || Buffer.byteLength(entry.id || "") > 128 || !validHash(entry.manifest_sha256)
        || !["managed", "reference"].includes(entry.mode) || typeof entry.version !== "string" || !path.isAbsolute(entry.path || "")
        || (entry.mode === "managed" && path.dirname(entry.path) !== this.packsRoot)) throw new DatasetError("dataset_registry_invalid", "The native dataset registry is invalid. Original settings were preserved; back them up and repair the registry explicitly.");
      ids.add(entry.id);
    }
    return [...(this.bundle ? [this.bundle] : []), ...entries];
  }
  publishRoots(entries = this.entries()) {
    atomicWriteJSON(this.registryFile, { schema: 1, entries: entries.map((entry) => ({ id: entry.id, root: entry.path, manifest_sha256: entry.manifest_sha256 })) });
  }
  async initialize() {
    this.packsRoot = await io.realpath(this.packsRoot);
    try {
      this.bundledRoot = await io.realpath(this.bundledRoot);
      const bundled = await readManifest(this.bundledRoot);
      this.bundle = { id: bundled.manifest.id, name: bundled.manifest.name, version: bundled.manifest.version,
        path: this.bundledRoot, mode: "bundled", manifest_sha256: bundled.sha256 };
    } catch { this.bundle = null; }
    const selected = this.settings.value.preferences.activeDataset;
    if (selected !== undefined && (typeof selected !== "string" || !selected.trim() || Buffer.byteLength(selected) > 128)) {
      throw new DatasetError("dataset_registry_invalid", "The saved startup dataset selection is invalid. Original settings were preserved; back them up and repair the selection explicitly.");
    }
    this.publishRoots();
    if (selected === undefined) return this.bundledRoot;
    const entry = this.entries().find((entry) => entry.id === selected);
    // Unknown selection must fail explicitly in the sidecar, never silently
    // load a different city's data. Native Data controls remain available.
    return entry?.path || path.join(this.packsRoot, "missing-selected-dataset");
  }
  status() {
    return { busy: this.busy, phase: this.phase, startup_id: this.settings.value.preferences.activeDataset || this.bundle?.id || null,
      warning: this.bundle ? null : "Bundled dataset metadata is unavailable. Restore the application resources or add a valid pack to recover explicitly.",
      datasets: [
        ...this.entries().map(({ id, name, version, mode, manifest_sha256, path: location }) => ({ id, name, version, mode, manifest_sha256, location })),
        ...this.settings.value.datasets.filter(legacyEntry).map((entry) => ({ id: entry.id, name: typeof entry.name === "string" ? entry.name : entry.id,
          version: typeof entry.version === "string" ? entry.version : "Not validated", mode: "unverified", manifest_sha256: null, location: entry.path, needs_validation: true })),
      ] };
  }
  async single(phase, operation) {
    if (this.busy || this.isBusy()) throw new DatasetError("file_busy", "Finish or cancel the current native file, print, or dataset operation first.");
    this.busy = true; this.phase = phase; this.abort = new AbortController();
    try { return await operation(this.abort.signal); }
    catch (error) { if (error instanceof DatasetError) throw error; throw invalid(); }
    finally { this.busy = false; this.phase = "idle"; this.abort = null; }
  }
  cancel() {
    if (this.phase === "activating") return { canceled: false, message: "Activation is committing. Wait for its result before another action." };
    this.abort?.abort(); this.ticket = null;
    return { canceled: true };
  }
  choose(kind) {
    if (!["directory", "manifest"].includes(kind)) throw invalid();
    return this.single("choosing", async (signal) => {
      this.ticket = null;
      const choice = await this.selectSource(kind);
      if (choice.canceled || !choice.filePaths?.length) return { canceled: true };
      checkAbort(signal); this.phase = "validating";
      const root = await sourceRoot(choice.filePaths[0]);
      const inspected = await this.inspect(root, { executable: this.executable, signal });
      const collision = this.entries().find((entry) => entry.id === inspected.manifest.id);
      if (collision && collision.manifest_sha256 !== inspected.sha256) throw new DatasetError("dataset_duplicate", "This dataset ID is already registered with different content. Use a distinct pack ID; the active pack was preserved.");
      this.ticket = { token: crypto.randomUUID(), expires: Date.now() + 120_000, ...inspected };
      return { ticket: this.ticket.token, manifest: inspected.manifest, manifest_sha256: inspected.sha256, bytes: inspected.size, location: root };
    });
  }
  install(request) {
    if (!request || Object.keys(request).some((key) => !["ticket", "mode"].includes(key)) || !["managed", "reference"].includes(request.mode)
      || !this.ticket || request.ticket !== this.ticket.token || this.ticket.expires < Date.now()) throw new DatasetError("dataset_ticket", "Choose and validate the dataset again; this selection expired.");
    const ticket = this.ticket;
    return this.single("validating", async (signal) => {
      this.ticket = null;
      const fresh = await this.inspect(ticket.root, { executable: this.executable, signal });
      if (fresh.sha256 !== ticket.sha256) throw invalid();
      const previous = this.entries().find((entry) => entry.id === fresh.manifest.id);
      if (previous && previous.manifest_sha256 !== fresh.sha256) throw new DatasetError("dataset_duplicate", "This ID already identifies different registered content.");
      if (previous?.mode === "bundled") return { registered: true, alreadyRegistered: true, id: previous.id };
      let root = fresh.root; let staging;
      try {
        if (request.mode === "managed") {
          this.phase = "copying";
          root = path.join(this.packsRoot, fresh.sha256);
          if (await io.lstat(root).then(() => true, (error) => { if (error.code !== "ENOENT") throw error; return false; })) {
            if ((await io.lstat(root)).isSymbolicLink()) throw invalid();
            const existing = await this.inspect(root, { executable: this.executable, signal });
            if (existing.sha256 !== fresh.sha256) throw invalid();
          } else {
            staging = await io.mkdtemp(path.join(this.packsRoot, ".staging-"));
            await io.chmod(staging, 0o700);
            const source = await readManifest(fresh.root);
            if (source.sha256 !== fresh.sha256) throw invalid();
            for (const name of Object.values(source.manifest.files)) {
              await streamLayer(fresh.root, name, source.manifest.sha256[name], { signal, destination: path.join(staging, name) });
            }
            const manifestFile = await io.open(path.join(staging, "manifest.json"), "wx", 0o600);
            try { await manifestFile.writeFile(source.bytes); await manifestFile.sync(); } finally { await manifestFile.close(); }
            // Flush declared directory entries before publishing the directory.
            // Some filesystems cannot fsync directories; validation on every
            // activation/start remains mandatory after an interrupted machine.
            const directories = new Set([staging]);
            for (const name of Object.values(source.manifest.files)) {
              let directory = path.dirname(path.join(staging, name));
              while (directory !== staging) { directories.add(directory); directory = path.dirname(directory); }
            }
            for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
              try { const handle = await io.open(directory, "r"); try { await handle.sync(); } finally { await handle.close(); } } catch { /* filesystem may not support directory fsync */ }
            }
            this.phase = "validating copy";
            const copied = await this.inspect(staging, { executable: this.executable, signal });
            if (copied.sha256 !== fresh.sha256 || (await readManifest(fresh.root)).sha256 !== fresh.sha256) throw invalid();
            checkAbort(signal);
            await io.rename(staging, root); staging = null;
            try { const dir = await io.open(this.packsRoot, "r"); try { await dir.sync(); } finally { await dir.close(); } } catch { /* rename already committed */ }
          }
        }
        checkAbort(signal);
        const entry = { id: fresh.manifest.id, name: fresh.manifest.name, version: fresh.manifest.version, path: root,
          mode: request.mode, manifest_sha256: fresh.sha256 };
        const next = { ...this.settings.value, datasets: [...this.settings.value.datasets.filter((value) => value.id !== entry.id), entry] };
        validateSettings(next);
        this.settings.save(next);
        try { this.publishRoots(); }
        catch { return { registered: true, id: entry.id, warning: "The pack was registered, but the runtime registry could not be updated. Repair native directory permissions and restart before activating it." }; }
        return { registered: true, id: entry.id, mode: request.mode };
      } finally { if (staging) await io.rm(staging, { recursive: true, force: true }); }
    });
  }
  activateID(id) {
    if (typeof id !== "string" || !id || Buffer.byteLength(id) > 128) throw invalid();
    return this.single("validating", async (signal) => {
      const entry = this.entries().find((entry) => entry.id === id);
      if (!entry) throw invalid();
      let inspected;
      try {
        const root = await sourceRoot(entry.path);
        if (root !== entry.path) throw invalid();
        inspected = await this.inspect(root, { executable: this.executable, signal });
      }
      catch (error) {
        if (error.code === "dataset_canceled") throw error;
        throw new DatasetError("dataset_unavailable", "This registered pack is missing, changed, or unreadable. Mount its drive or use Add Dataset Pack to locate the same manifest and register it again. The active pack was preserved.");
      }
      if (inspected.sha256 !== entry.manifest_sha256 || inspected.manifest.id !== id) throw invalid();
      checkAbort(signal); this.publishRoots(); this.phase = "activating";
      // Cancellation stops before this commit point; it must never claim an
      // already-swapped Go pack was rolled back. The canonical runtime owns it.
      const response = await this.activate(entry);
      let warning = response.warning;
      try { this.settings.save({ ...this.settings.value, preferences: { ...this.settings.value.preferences, activeDataset: id } }); }
      catch { warning = "The dataset is active for this session, but its startup preference could not be saved. Check native storage permissions and disk space."; }
      return { ...response, warning };
    });
  }
}
module.exports = { DatasetRegistry };

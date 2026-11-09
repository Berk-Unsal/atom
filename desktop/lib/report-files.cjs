"use strict";
const crypto = require("node:crypto");
const { MAX_PORTABLE_BYTES, NativeFileError, approvedPath, readPortableFile, writePortableFile } = require("./portable-file-io.cjs");
const FORMATS = Object.freeze({ markdown: "md", html: "html", svg: "svg", zip: "zip" });
const invalid = () => new NativeFileError("report_invalid_request", "The native report request is invalid.");
function reportFilename(raw, extension) {
  if (typeof raw !== "string" || !raw || raw.length > 512) throw invalid();
  const safe = raw.replace(/[\/\\\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "-").replace(/^\.+/, "").slice(0, 180) || "atom-report";
  return safe.toLowerCase().endsWith(`.${extension}`) ? safe : `${safe.replace(/\.(md|html?|svg|zip|pdf)$/i, "")}.${extension}`;
}
function reportPayload(request, output = false) {
  const keys = output ? ["mode", "name", "bytes", "sha256"] : ["format", "name", "bytes", "sha256"];
  if (!request || typeof request !== "object" || Array.isArray(request) || Object.keys(request).some((key) => !keys.includes(key))) throw invalid();
  if (output ? !["pdf", "print"].includes(request.mode) : !Object.hasOwn(FORMATS, request.format)) throw invalid();
  if (!(request.bytes instanceof Uint8Array) || request.bytes.byteLength === 0 || request.bytes.byteLength > MAX_PORTABLE_BYTES) throw new NativeFileError("report_size", "Report exports must contain between 1 byte and 64 MiB.");
  if (typeof request.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(request.sha256)) throw invalid();
  const bytes = Buffer.from(request.bytes);
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== request.sha256) throw new NativeFileError("report_integrity", "The report bytes do not match their SHA-256. Existing retained evidence was not changed.");
  const name = reportFilename(request.name, output ? "pdf" : FORMATS[request.format]);
  return { bytes, name };
}

class ReportFiles {
  constructor({ selectSave, createSurface, isBusy = () => false, io, timeout = 30_000 }) {
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 30_000) throw new Error("Invalid report operation deadline");
    Object.assign(this, { selectSave, createSurface, isBusy, io, timeout }); this.busy = false;
  }
  async single(operation) {
    if (this.busy || this.isBusy()) throw new NativeFileError("file_busy", "Finish or cancel the current native file or print operation first.");
    this.busy = true;
    try { return await operation(); } finally { this.busy = false; }
  }
  async destination(name, extension) {
    const choice = await this.selectSave({ name, extension });
    if (choice.canceled || !choice.filePath) return null;
    const file = await approvedPath(choice.filePath, this.io);
    const expected = (await readPortableFile(file, { io: this.io, missing: true }))?.fingerprint || null;
    return { file, expected };
  }
  save(request) {
    return this.single(async () => {
      const { bytes, name } = reportPayload(request);
      const destination = await this.destination(name, FORMATS[request.format]);
      if (!destination) return { canceled: true };
      const written = await writePortableFile(destination.file, bytes, destination.expected, { io: this.io });
      return { saved: true, canceled: false, path: destination.file, sha256: written.sha256, bytes: written.bytes };
    });
  }
  output(request) {
    return this.single(async () => {
      const { bytes, name } = reportPayload(request, true);
      let html;
      try { html = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { throw new NativeFileError("report_encoding", "Report HTML must contain valid UTF-8."); }
      const destination = request.mode === "pdf" ? await this.destination(name, "pdf") : null;
      if (request.mode === "pdf" && !destination) return { canceled: true };
      let surface; let timer;
      try {
        surface = await this.createSurface(html);
        const operation = request.mode === "pdf"
          ? surface.webContents.printToPDF({ pageSize: "A4", landscape: false, printBackground: true, preferCSSPageSize: false, displayHeaderFooter: false })
          : new Promise((resolve, reject) => {
            surface.once("closed", () => resolve({ canceled: true }));
            surface.show();
            surface.webContents.print({ silent: false, printBackground: true, pageSize: "A4", landscape: false }, (success, reason) => {
              if (success) resolve({ printed: true, canceled: false });
              else if (reason === "Print job canceled") resolve({ canceled: true });
              else reject(new NativeFileError("report_print_failed", "The native print operation failed. Check the printer and retry; retained report bytes are preserved."));
            });
          });
        // A physical print dialog is user-controlled and has no short timeout.
        // PDF generation itself is bounded and owns no external chooser here.
        const rendered = request.mode === "pdf" ? await Promise.race([operation, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new NativeFileError("report_pdf_timeout", "PDF rendering timed out. Existing report bytes and destination are preserved.")), this.timeout);
        })]) : await operation;
        if (request.mode === "print") return rendered;
        if (!(rendered instanceof Uint8Array) || rendered.byteLength === 0 || rendered.byteLength > MAX_PORTABLE_BYTES) throw new NativeFileError("report_size", "The rendered PDF exceeds the 64 MiB native export limit.");
        const written = await writePortableFile(destination.file, rendered, destination.expected, { io: this.io });
        return { saved: true, canceled: false, path: destination.file, sha256: written.sha256, bytes: written.bytes };
      } finally { clearTimeout(timer); if (surface && !surface.isDestroyed()) surface.destroy(); }
    });
  }
}
module.exports = { ReportFiles, reportFilename, reportPayload };

"use strict";
const { EventEmitter } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");

// The initial compiler has no last-good service yet. Retry only when an
// observed edit superseded its input (including an editor's temporary EOF),
// and never install an output built from that superseded source revision.
async function buildInitialRevision({ build, discard, getRevision, signal, debounce = 150, onSuperseded = () => {} }) {
  for (;;) {
    signal.throwIfAborted();
    const revision = getRevision();
    let candidate; let failure;
    try { candidate = await build({ signal }); } catch (error) { failure = error; }
    // Drain pending fs.watch callbacks before deciding whether the compiler
    // diagnosed the current source or an in-progress/superseded write.
    await new Promise((resolve) => setImmediate(resolve));
    if (signal.aborted) {
      if (candidate !== undefined) await discard(candidate);
      signal.throwIfAborted();
    }
    if (revision === getRevision()) {
      if (failure) throw failure;
      return candidate;
    }
    if (candidate !== undefined) await discard(candidate);
    onSuperseded();
    await delay(debounce, undefined, { signal });
  }
}

/** Compile before touching the running service. Coalesce edits and discard a
 * candidate if another edit arrived while it compiled. No automatic RF retry. */
class RebuildQueue extends EventEmitter {
  constructor({ build, apply, discard, debounce = 150 }) {
    super();
    Object.assign(this, { build, apply, discard, debounce });
    this.revision = 0;
    this.waiters = [];
    this.closed = false;
    this.running = null;
    this.timer = null;
  }

  request() {
    if (this.closed) return;
    this.revision++;
    if (!this.running) this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      const revision = this.revision;
      this.controller = new AbortController();
      this.running = Promise.resolve().then(async () => {
        if (this.closed) return;
        let candidate;
        try {
          candidate = await this.build({ revision, signal: this.controller.signal });
          if (this.closed || revision !== this.revision) await this.discard(candidate);
          else {
            const result = await this.apply(candidate, { revision, signal: this.controller.signal });
            this.emit("applied", { revision, result });
          }
        } catch (error) {
          if (candidate !== undefined) await this.discard(candidate).catch(() => {});
          if (!this.closed) this.emit("build-failed", { revision, error });
        }
      }).finally(() => {
        this.running = null;
        if (!this.closed && revision !== this.revision) this.schedule();
        else this.resolveIdle();
      });
    }, this.debounce);
  }

  resolveIdle() { for (const resolve of this.waiters.splice(0)) resolve(); }

  idle() {
    if (!this.running && !this.timer) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async close() {
    this.closed = true;
    clearTimeout(this.timer); this.timer = null;
    this.controller?.abort();
    await this.running;
    this.resolveIdle();
  }
}

module.exports = { RebuildQueue, buildInitialRevision };

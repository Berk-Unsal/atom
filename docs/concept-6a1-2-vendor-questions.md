# Concept 6A.1.2 — Source Clarification Questions

These questions are prepared for the Signal Collector maintainer. They have not been sent.

1. How should Signal Collector interpret an Android `CellInfo` row where `isRegistered()` is `true` but `getCellConnectionStatus()` is `CONNECTION_NONE`? The reviewed Android API documentation describes `isRegistered()` as a cell used or eligible for signaling, while `CONNECTION_NONE` means the cell is not serving and is neither camped nor serving.
2. Does `SERVING_CELL_CHANGED` derive from `CellInfo.isRegistered()`, `getCellConnectionStatus()`, another Android callback, or Signal Collector's own state? Which field is authoritative when they disagree?
3. Can `registered=true` be treated as serving on devices that consistently return `CONNECTION_NONE`, and if so, what device, Android, or collector-version conditions make that interpretation valid?

The raw files identify TXT V6, but do not identify the Signal Collector app build. A response should identify the applicable collector version and clarify how the event's Cell ID and PCI are sourced.

# Production macOS file-panel qualification

Status: the first arm64 native attempt reaches the actual Save/path sheets but fails before its first file write; corrected complete arm64/Intel verification is pending for #154/#156/#158/#159. Unit selectors and local refusal are supporting evidence, not native file-panel acceptance.

The macOS package matrix launches the actual production app, copied outside the repository under a Unicode/space path and made read-only. HOME and document paths belong to one private owned temporary tree. System Events targets the exact PID and `io.github.berk-unsal.atom` bundle ID. No Electron dialog method, selected path response, filesystem operation, shared serializer or RF request is replaced.

The driver identifies native sheets/dialogs with unique bounded Cancel and Open/Save controls. Before confirming, it uses the real Go to Folder sheet to reach the owned destination and sets the actual Unicode filename where needed. It requires exact field readback and an enabled confirmation control. The observed buttonless macOS path sheet instead requires its unique focused field and one native Return key confirmation. Ambiguous panels, controls outside their panel, unknown operations, escaped/symlink targets and foreign/nonprivate roots fail closed. An uncertain input failure is never retried. Bounded diagnostics record only native marker roles/frames and label classifications, excluding file-list contents and report/document accessibility text.

The intended complete flow mirrors the proven Linux file checks:

1. Export current inputs, open an actual schema-2 Project with an unexpanded legacy Scenario, rename through the shared UI and Save As to a Unicode portable path.
2. Cancel Save As and Open, preserving exact bytes, workspace and association. Open the saved file and verify its actual filesystem identity.
3. Run Sector once explicitly, Save Version and prepare the shared report. Save Markdown with its exact retained hash and Save PDF with selectable Unicode Project/Run text.
4. Cancel a later PDF destination, preserving existing PDF and retained artifact hashes. Save the associated Project, require every association clean and prove unrelated Version/report saves leave the original legacy Project bytes exactly unchanged.
5. Ordinary Quit reaps owned app/Go processes; bundle inventory remains unchanged and the RF trace contains exactly the one explicit Sector request.

There are nine real file-panel operations. Generated portable files, Markdown, PDFs, app bundles and default-data bytes are excluded from uploads. The workflow retains the JSON receipt and failure screenshot only. Print has its separate [complete configured proof](desktop-macos-print-qualification.md); this follow-up does not substitute file Save for native Print or claim physical output, signed/quarantined downloads or clean minimum-OS installation.

Ten host regressions cover selector identity/bounds/ambiguity, cancellation with disabled confirmation, owned Unicode paths/traversal, refusal before desktop access/dependency resolution uncertain AXPress delivery and Foundation’s truthy nil attribute wrapper for a new Save target. JavaScript/JXA compilation and a read-only Foundation ownership/path-alias probe provide supporting local validation. Personal file dialogs and settings were not operated. Actual hosted native execution and resulting source-bound evidence remain required.


## First hosted attempt

Arm64 run `44816733172`, execution `4a91d19f9380a2deb8ad4a9b12170b6765f120d6` from head `9a5ae95`, passes production package smoke and the separate actual Print flow, then stops during its first Export destination. The actual native Save sheet has the expected labeled filename, Cancel and Save controls. Cmd+Shift+G opens a second native path sheet with one enabled text field and no Go/Cancel buttons, so the initial selector stops at the missing controls. No file operation is completed, and owned cleanup reports no error. [Frozen first-attempt evidence](assets/desktop-macos-files-first-ci.json) retains that failed scope.

The selector now supports this observed buttonless layout only for an unambiguous native path sheet with one bounded text field. Before one Return key event, it requires exact owned destination readback, actual field focus and the expected process remaining frontmost. Two new cases reject unfocused, ambiguous or out-of-panel fields. Input delivery failures still propagate without retry; actual corrected execution is pending.

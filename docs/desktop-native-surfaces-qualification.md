# Production native chooser qualification

Status: follow-up implementation for #154, #156, #158 and #161; hosted native evidence is pending. This qualifies the production app rather than treating the accepted #148 spike as proof for a different application build.

## Method

The `Production native dialogs` workflow builds and installs the actual native Ubuntu `.deb` on a disposable Ubuntu 24.04 Actions VM. Separate X11/Mutter and forced native Wayland/Mutter sessions retain normal Chromium sandboxing and the package's exact-path AppArmor profile. The existing session harness owns its runtime directory, portal and isolated user data; only its document-portal FUSE mount is unmounted during cleanup. Native tests reject personal-machine/root execution and require a root-owned installed app matching the committed source.

The real GTK desktop portal is selected in private session configuration. Its exact process ID, executable and dialog title scope the accessibility driver. Only visible/enabled/sensitive widgets are eligible. Save edits the real filename entry and verifies readback; Open selects the actual file row or real location entry; Cancel activates only Cancel. No Electron dialog method, chooser result, filesystem operation or RF response is substituted. The driver uses the documented [AT-SPI editable-text API](https://docs.gtk.org/atspi2/method.EditableText.set_text_contents.html); widget expectations follow [GTK 3's chooser UI](https://github.com/GNOME/gtk/blob/gtk-3-24/gtk/ui/gtkfilechooserwidget.ui).

The production test performs real project Save/Open and cancellation under long Unicode/space paths, checks the exact opened file identity and bytes, and checks cancellation preserves workspace, association and saved bytes. One explicit Sector Run and Save Version prepare the existing report lineage. Real Markdown Save must match a retained artifact's original content hash and length; real PDF Save must produce PDF bytes. Cancelled PDF Save must preserve existing retained artifacts and saved PDF bytes. A final explicit project Save precedes ordinary Quit and owned-child cleanup. Every file/report action must leave the RF POST trace at that one Sector request. The root-owned installed bundle inventory must remain unchanged.

The workflow retains only source-bound JSON receipts, real chooser accessibility trees, portal/compositor diagnostics and a failure screenshot. Generated projects, reports, app archives and bundled default data are not uploaded. The pending data-redistribution gate is unchanged.

## Evidence boundary

Local validation covers driver process/title/state restrictions, ambiguous/refused editable fields, exact Cancel activation, Node/shell syntax and the inherited host regressions. A macOS syntax check is not GTK or Wayland evidence. Native outcomes must come from the actual workflow before any acceptance claim.

These are disposable headless sessions. They do not qualify a graphical package-manager installation, a complete clean GNOME machine, configured-printer Print, signed/quarantined macOS downloads or the original performance budgets. Existing macOS chooser observations and native automation retain their own source/scope. Physical/OS Print acceptance, rights, provider and support decisions remain separate.

## First production observations and correction

Both sessions in run `42881510735` complete the seven actual GTK project/report chooser actions, including file identity, retained Markdown hash and PDF cancellation. The final ordinary-Quit check fails. Run `42882559930` then confirms an older associated Project becomes dirty when shared report/domain operations add its previously implicit description, tags and inventory metadata; the active imported Project is clean. This is a production normalization issue rather than a failed chooser response.

Native file preparation now materializes that existing compatibility metadata in the target Project through the existing ordered recovery queue before capturing its portable content-hash baseline. It preserves drafts, existing Scenario/Version count and timestamps, does not run RF, and is idempotent on subsequent preparation. A regression fails on the prior implementation and passes with the fix; actual changed content still changes the portable bytes. The shared schema/serializer and size limits are unchanged. Hosted verification is pending.

The first difference diagnostic accidentally retained expanded inventory values. Both owned artifacts from run `42882559930` (`13794997540`, `13793924362`) were removed; the API confirms no artifacts remain for that run. Diagnostic differences now include only bounded paths, types, lengths and SHA-256, with regressions preventing source rows from appearing in their output. Native files/reports and default layers remain excluded from uploads.

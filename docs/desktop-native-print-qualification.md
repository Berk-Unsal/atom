# Production Print qualification

Status: implementation pending hosted verification; no completed Print acceptance claim yet. Follow-up to #156/#158/#161 and PR #203.

The native-dialog workflow configures `AtomQualification`, an unshared local CUPS-PDF queue, only on its disposable Ubuntu 24.04 VM. It uses the distribution's [CUPS-PDF driver](https://packages.ubuntu.com/noble/amd64/printer-driver-cups-pdf/filelist) and [CUPS queue administration](https://www.cups.org/doc/man-lpadmin.html). No remote or personal printer is used. The installed app must enumerate the queue through real `getPrintersAsync()`, while CUPS `lpstat -d` independently confirms the actual default.

After the seven existing production chooser actions, the real Report Print button calls the existing non-silent production path. The driver observes the owned 1440×900 compositor through Ubuntu's [Mutter ScreenCast interface](https://github.com/GNOME/mutter/blob/gnome-46/data/dbus-interfaces/org.gnome.Mutter.ScreenCast.xml) and a private PipeWire session. It identifies the Print title, General tab, Printer table, Cancel/Print controls and visibly blue-selected local queue from actual pixels. OCR analyzes white-on-blue controls separately and maps their original pixel bounds back to the screen. Both the observed X11 bottom-button layout and Wayland header-button layout are supported; ambiguous/missing controls or an unselected queue fail before any input.

The driver clicks the observed control's center once through the owned Mutter RemoteDesktop session. No fixed control coordinates, Electron print method/callback or OS response is substituted. Ordinary app launch uses no forced Chromium accessibility mode; the external GTK file-chooser driver keeps its own AT-SPI scope. This private compositor API is qualification tooling, not a production dependency.

Cancel must return control without creating a CUPS job or changing retained artifacts and saved PDF bytes. A subsequent real Print must complete exactly one job and produce a PDF through the local virtual printer containing the Project and Simulation Run text. Receipts and original compositor screenshots are retained; temporary OCR images, generated reports/PDFs and bundled data remain excluded from upload. The existing single explicit RF request, final Save, ordinary Quit, process cleanup and unchanged installed-bundle assertions remain active. Owned compositor/PipeWire/session-manager processes are cleaned up by the existing private runtime harness.

## Observations and validation

The first run `42888648711` stopped before Print on an obsolete Electron `isDefault` test field. Corrected runs enumerate the real queue/default. Chromium accessibility experiments then register the real app but do not expose its GTK Print dialog through AT-SPI. Those failed observations are retained as failures; they do not establish cancellation or job completion.

[Run 42894406734](https://github.com/Berk-Unsal/atom/actions/runs/42894406734), head `794025a`, captures the actual compositor in both sessions. Both images visibly show the real Print dialog, selected `AtomQualification` queue and Cancel/Print controls, while the AT-SPI driver fails. The visual driver is checked against those exact captured pixels and finds the expected control centers in both layouts. This is recorded visual identification evidence, not yet evidence that the new pointer actions or complete job flow passed. Hosted verification of the new driver is pending.

Local Python regressions require all native dialog markers and a highlighted queue, reject standalone renderer Print buttons, ambiguous Cancel controls and unaligned accept controls, and cover both observed GTK layouts. Host/docs checks and syntax/action pins remain separate from actual OS qualification.

This qualifies a configured virtual-printer OS flow only after both X11 and native Wayland runs actually pass. It does not establish physical paper output, macOS Print, clean GNOME installation, signing, data rights or performance acceptance. No personal-machine CUPS, display or recording settings are changed.

# Production Print qualification

Status: implementation pending hosted verification; no Print acceptance claim yet. Follow-up to #156/#158/#161 and PR #203.

The native-dialog workflow configures `AtomQualification`, an unshared local CUPS-PDF queue, only on its disposable Ubuntu 24.04 VM. It uses the distribution's [CUPS-PDF driver](https://packages.ubuntu.com/noble/amd64/printer-driver-cups-pdf/filelist) and [CUPS queue administration](https://www.cups.org/doc/man-lpadmin.html). No remote or personal printer is used.

After the seven existing production chooser actions, the installed app's real `getPrintersAsync()` must identify this queue as the OS default. The real Report Print button calls the existing non-silent production printing path. A separate AT-SPI driver accepts only the root-owned installed app's exact process, a visible Print dialog and an enabled Cancel or Print button. It never replaces `webContents.print`, its callback or an OS response.

Cancel must return control without creating a CUPS job or changing retained artifacts and saved PDF bytes. A subsequent real Print must complete exactly one job and produce a PDF through the local virtual printer containing the Project and Simulation Run text. Only hash/length and bounded native widget diagnostics are retained; generated PDFs/reports and bundled data remain excluded from upload. The existing single explicit RF request, final Save, ordinary Quit and owned-child cleanup assertions remain active.

This qualifies a configured virtual-printer OS flow only after both X11 and native Wayland runs actually pass. It does not establish physical paper output, macOS Print, clean GNOME installation, signing, data rights or performance acceptance. No personal-machine CUPS configuration is changed.

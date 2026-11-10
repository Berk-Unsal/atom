# Ubuntu package qualification work record

Scope: #161. Work in progress on the accepted Electron host. The original issue's Wails/WebKitGTK dependency recipe is superseded by the accepted architecture decision. This work does not advertise Linux support or authorize public/default-data distribution.

## Assembly and runtime contract

Build natively on Ubuntu 24.04 x86_64 with current vendor updates. Other distributions, Linux ARM64, AppImage and alternative formats remain unqualified. Development assembly requires Node/Go, the two npm dependency sets, `file`, `ldd`, `dpkg-query`, `dpkg-deb` and `desktop-file-validate`; these are build tools, not user prerequisites.

```sh
npm run build --prefix desktop
npm run package --prefix desktop
npm run package:deb --prefix desktop
```

The builder rejects another OS, distribution, release or architecture and requires a clean matching source/package inventory. It installs the self-contained app at `/opt/atom-planner`, a launcher at `/usr/bin/atom-planner`, the matching desktop entry/icon/AppStream metadata, software/data notices and a narrowly attached AppArmor profile. Root `VERSION` remains the application and Debian package version. `deb.json` and `SHA256SUMS` retain source, shell/OS, package size/checksum, dependency policy and every bundled ELF's actual resolved dependencies. There is no second product version or universal-Linux claim.

Every dynamic ELF is inspected with `ldd`; a missing library fails assembly. Bundled libraries remain private to the app. Each resolved system library must be owned by an installed Debian package, and the dependency list requires at least that build-host package version. This deliberately chooses the observed Ubuntu build floor, rather than inventing a lower ABI bound. Explicit GTK/NSS/audio/GBM/X11/CUPS and desktop-portal packages additionally cover dynamically loaded/native services that ELF linking alone cannot establish. No developer tools, container runtime or second browser are user dependencies. The complete versioned list is build evidence, not a claim that another distro has equivalent packages. See [Debian's package-query documentation](https://manpages.debian.org/unstable/dpkg/dpkg-query.1.en.html).

Ubuntu's AppArmor rule grants user namespaces only to `/opt/atom-planner/atom-desktop`, following the [Ubuntu per-application model](https://ubuntu.com/blog/ubuntu-23-10-restricted-unprivileged-user-namespaces). Chromium sandboxing remains enabled; the package omits the setuid fallback helper and changes no global user-namespace policy. Maintainer scripts load/unload that package-owned rule when AppArmor is active, and never read, reset or delete users' profiles, documents, packs, logs or caches. The desktop identity matches Electron's [Linux desktop-name API](https://www.electronjs.org/docs/latest/api/app/#appsetdesktopnamename-linux).

## Installer and graphical-session checks

`Ubuntu desktop package` has separate sandboxed X11 and forced native Wayland jobs on Ubuntu 24.04. Each builds the native package, creates a private previous-Debian-version fixture, installs it through apt, runs the actual production app, upgrades to the current candidate, runs again, then removes and purges the package. The fixture only changes Debian's control version to `VERSION~qualification.1`; its app source and canonical VERSION remain current. This tests real apt/dpkg upgrade dispatch and maintainer scripts, not migration from a nonexistent historical desktop release.

Production-bundle automation launches the installed root-owned app as an ordinary user with a system-only PATH and a disposable native home. It checks Sector → Version → shared Report/PDF, portable Save, ordinary Quit, clean relaunch and owned-child cleanup. User/profile bytes are compared before and after apt upgrade/remove/purge. Save destinations are supplied by the test. Neither apt installation nor supplied Save responses qualify a graphical package manager or an actual chooser/Print surface.

System-package mutation tests require a disposable GitHub Actions VM and reject an existing A.T.O.M installation. They are not personal-machine cleanup commands. The reference sessions use Xvfb/Mutter or a headless native Wayland Mutter session, with ordinary Chromium sandboxing; they do not establish a clean GNOME desktop install by themselves.

## Evidence and remaining acceptance

All 134 host tests and syntax/action-pin checks pass locally. [Native CI run 42834631863](https://github.com/Berk-Unsal/atom/actions/runs/42834631863) passes both X11 and native Wayland jobs on clean execution `fe5464f69b6f0812da27ddc7478dc099a3a536a8` (PR head `cda8ac2`). Both sessions install, upgrade, run Sector/Report/PDF and portable Save, quit/relaunch with zero restored-project differences, then remove/purge while preserving profile and user-document bytes. The [raw scoped record](assets/desktop-deb-ci.json) binds installer checksums, both native phases and evidence artifact IDs. Only metadata was uploaded.

Qualification exposed and fixed inaccessible root-owned staging permissions, a hidden loaded Wayland window, and fixture races involving retained Run lineage and an already-existing PDF. The immediately preceding run `42831994342` passed both complete functional suites but failed cleanup of a live document-portal FUSE mount; the final harness explicitly unmounts only its owned portal before deleting its private runtime directory. A regression test preserves the directory when unmount fails. These fixes do not relax the sandbox or application acceptance assertions.

Actual production GTK portal Open/Save/Cancel, configured-printer Print, graphical package-manager installation, current clean GNOME machines and the outstanding #158 budget/platform review remain open. Earlier spike portal evidence retains its spike scope. The [default-data review](desktop-data-redistribution-review.md) is pending: CI retains only JSON/checksum/inventory/diagnostic evidence, never `.deb`, archives or copied data layers. Public package publication and the complete license/SBOM/release gate remain #162. No support, rights or release gate is inferred from an assembled package.

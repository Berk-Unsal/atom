# Native package assembly work record

Scope: #159 with shared assembly groundwork for #161/#162. Work in progress; build recipes and test evidence do not establish public desktop support. The accepted shell is Electron, superseding the original Wails-specific packaging proposal.

## Local internal build

From a committed clean checkout with the documented Node/Go build tools and both npm dependency sets installed:

```sh
npm run build --prefix desktop
sh scripts/desktop-package.sh             # unsigned zip on macOS, tar.gz on Linux
sh scripts/desktop-package.sh --dmg       # macOS-only internal DMG recipe
npm run test:package --prefix desktop
```

The builder accepts only native macOS arm64/x64 or Linux x64 hosts. It verifies resource VERSION/commit/architecture/Electron identity against the checkout; each macOS Mach-O, including the Go sidecar and helpers, must contain exactly the native architecture. No universal or cross-compilation qualification is claimed. Root `VERSION` supplies the application/package version. Build metadata adds source commit, shell, OS and architecture without another version stream.

Electron Packager rebrands the bundle as A.T.O.M, executable `atom-desktop`, bundle identifier `io.github.berk-unsal.atom`, with the repository icon, About version and macOS deployment metadata. The declared macOS 14 floor remains subject to actual qualification. Host code is copied from an explicit allowlist. Resources contain the shared production frontend, existing Go sidecar, manifest-declared unchanged default pack and application/data/Electron license notices. Packaging tools, Node modules, tests, source CSVs, local environment files and caches are excluded. Desktop production compilation disables Vite environment-file loading and removes inherited `VITE_*` values; browser build behavior is unchanged.

Outputs reside in ignored `desktop/build/packages/atom-VERSION-OS-ARCH-internal-unsigned/`. `package.json` records trust, data approval status, compressed/unpacked bytes, native architectures, archive checksums and the file-inventory hash. `files.json` records every bundled regular byte, executable mode and relative internal link; escaping links and special files fail assembly. `SHA256SUMS` covers the archives. ZIP and optional read-only compressed DMG retain the `.app`; the DMG has an Applications shortcut and is verified by `hdiutil`. These are unsigned internal candidates, not trusted public installers.

## Production-bundle checks

The additive smoke copies the actual assembled bundle outside the repository to a Unicode path with spaces, makes its resources read-only, isolates native data in a disposable home, and launches from a different cwd with a system-only PATH. No test bootstrap, renderer probe bundle or production privilege is inserted. Packaged mode must ignore developer resource/server/profile overrides, retain sandboxing and report the root VERSION/commit. It exercises an explicit Sector run, Save Version, shared Report lineage, native file/PDF output, clean ordinary Quit and relaunch with the same profile/file association. Every bundle byte/link must remain unchanged and the owned sidecar must exit. Save responses are supplied by the test; actual OS chooser/Print checks remain separate. This is development-machine automation, not proof of a clean-machine install or the complete D11 platform matrix.

`Desktop package assembly` runs native macOS arm64 (`macos-15`) and Intel (`macos-15-intel`) builds independently, with pinned actions and read-only permissions. It retains only diagnostic JSON/screenshots, checksum metadata and inventories while data approval is pending. A queued/build-only Intel job is not a passed native launch. Linux installer/dependency/session checks remain #161; protected signing/notarization and exact-candidate trust remain #160.

## Distribution and remaining gates

The [exact-hash default-data review](desktop-data-redistribution-review.md) is still pending. Local private full-pack assembly is possible, but no binary/data CI upload or public desktop asset is authorized by this work. A matching reviewer and approval record for the exact manifest and every layer hash are required before the builder can even report data upload eligibility. That field is not a public-release approval: all roadmap gates, provider policy, signatures and clean-machine checks remain separate. No replacement default dataset, upstream source upload or new RF behavior is introduced.

License notices here are assembly inputs, not a completed third-party license/SBOM audit; the complete dependency inventory and protected publication gate remain #162. Downloaded/quarantined signed arm64/Intel launch, macOS 14 clean-machine evidence, actual Print with a configured destination, production Wayland, package upgrade/install/uninstall and the outstanding #158 timing/memory review remain open. Users are not instructed to disable Gatekeeper, Chromium sandboxing or system security protections.

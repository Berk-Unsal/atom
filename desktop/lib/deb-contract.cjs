"use strict";
const { execFileSync } = require("node:child_process");
function runCommand(command, args, options = {}) {
  const output = execFileSync(command, args, { encoding: "utf8", ...options });
  return typeof output === "string" ? output.trim() : "";
}
const DYNAMIC_PACKAGES = ["apparmor (>= 4.0)", "libgtk-3-0t64", "libnss3", "libasound2t64", "libgbm1", "libxss1", "libxshmfence1", "libxkbcommon0", "libatk-bridge2.0-0t64", "libcups2t64", "xdg-utils", "xdg-desktop-portal", "xdg-desktop-portal-gnome"];
function assertUbuntu({ platform, arch, dpkgArch, release }) {
  const fields = Object.fromEntries(release.split("\n").filter((line) => line.includes("=")).map((line) => {
    const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
  }));
  if (platform !== "linux" || arch !== "x64" || dpkgArch !== "amd64" || fields.ID !== "ubuntu" || fields.VERSION_ID !== "24.04") throw new Error("Build the .deb natively on updated Ubuntu 24.04 x86_64");
  return fields;
}
function linkedLibraries(output) {
  if (/=>\s+not found/.test(output)) throw new Error("A bundled ELF has an unresolved runtime library");
  return [...new Set(output.split("\n").flatMap((line) => {
    const resolved = /=>\s+(\/.*?)\s+\(0x[0-9a-f]+\)/i.exec(line)?.[1] || /^\s*(\/.*?)\s+\(0x[0-9a-f]+\)/i.exec(line)?.[1];
    return resolved ? [resolved] : [];
  }))];
}
function dependencyFloor(packageName, version) {
  const name = packageName.replace(/:amd64$/, "");
  if (!/^[a-z0-9][a-z0-9+.-]+$/.test(name) || !/^[0-9][0-9A-Za-z.+:~\-]*$/.test(version)) throw new Error("Invalid installed Debian package metadata");
  return `${name} (>= ${version})`;
}
function control({ version, dependencies, installedBytes }) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+~-]+)?$/.test(version)) throw new Error("Invalid canonical package version");
  if (!dependencies.length || dependencies.some((item) => /[\r\n]/.test(item))) throw new Error("Invalid runtime dependency list");
  return `Package: atom-planner\nVersion: ${version}\nSection: science\nPriority: optional\nArchitecture: amd64\nMaintainer: A.T.O.M contributors <noreply@github.com>\nInstalled-Size: ${Math.ceil(installedBytes / 1024)}\nDepends: ${[...new Set([...dependencies, ...DYNAMIC_PACKAGES])].sort().join(", ")}\nHomepage: https://github.com/Berk-Unsal/atom\nDescription: A.T.O.M telecom planning (internal unsigned candidate)\n Shared React/Go planning product with an Electron desktop host.\n Public distribution and supported-environment qualification remain gated.\n`;
}
module.exports = { assertUbuntu, linkedLibraries, dependencyFloor, control, DYNAMIC_PACKAGES, runCommand };

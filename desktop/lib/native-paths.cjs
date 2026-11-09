"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Resolve without cwd, version, executable location or an ephemeral API port.
function nativePaths({ platform = process.platform, home = os.homedir(), env = process.env,
  packaged = false, localProfile, temporary = os.tmpdir() } = {}) {
  if (!["darwin", "linux"].includes(platform)) throw new Error("Unsupported native storage platform");
  const absolute = (value, fallback) => value && path.isAbsolute(value) ? value : fallback;
  if (!path.isAbsolute(home) || !path.isAbsolute(temporary)) throw new Error("Native storage needs absolute base directories");
  let data; let config; let cache; let state; let logs; let profile;
  if (!packaged) {
    if (localProfile && !path.isAbsolute(localProfile)) throw new Error("Choose an absolute local profile path");
    profile = localProfile || (platform === "darwin" ? path.join(home, "Library/Application Support/A.T.O.M-local")
      : path.join(absolute(env.XDG_CONFIG_HOME, path.join(home, ".config")), "A.T.O.M-local"));
    // A test/dev override contains every host-owned write, not just Chromium.
    data = path.join(profile, "native-data"); config = path.join(profile, "native-config");
    cache = path.join(profile, "native-cache"); state = path.join(profile, "native-state"); logs = path.join(state, "logs");
  } else if (platform === "darwin") {
    data = path.join(home, "Library/Application Support/A.T.O.M"); config = path.join(data, "config");
    state = path.join(data, "state"); cache = path.join(home, "Library/Caches/A.T.O.M"); logs = path.join(home, "Library/Logs/A.T.O.M");
    profile = path.join(data, "webview");
  } else {
    data = path.join(absolute(env.XDG_DATA_HOME, path.join(home, ".local/share")), "atom");
    config = path.join(absolute(env.XDG_CONFIG_HOME, path.join(home, ".config")), "atom");
    cache = path.join(absolute(env.XDG_CACHE_HOME, path.join(home, ".cache")), "atom");
    state = path.join(absolute(env.XDG_STATE_HOME, path.join(home, ".local/state")), "atom");
    logs = path.join(state, "logs"); profile = path.join(data, "webview");
  }
  const runtimeBase = !packaged ? path.join(profile, "native-runtime") : platform === "linux"
    ? absolute(env.XDG_RUNTIME_DIR, "") : "";
  if ([data, config, state, logs, profile].some((durable) => durable === cache || durable.startsWith(cache + path.sep))) {
    throw new Error("Native cache must not contain durable storage; choose separate XDG base directories");
  }
  return Object.freeze({ data, config, cache, state, logs, profile, packs: path.join(data, "packs"),
    runtimeBase, temporary, settings: path.join(config, "settings.json"), geometry: path.join(state, "window.json") });
}

function privateDirectory(directory, io = fs) {
  // Do not follow a replaced leaf, repair somebody else's permissions or reset
  // a profile on failure. Shared parent directories are not chmod'ed.
  io.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = io.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) {
    throw new Error("Native storage requires private user-owned directories (0700)");
  }
}

function prepareNativePaths(paths, io = fs) {
  for (const directory of new Set([paths.profile, paths.data, paths.config, paths.cache, paths.state, paths.logs, paths.packs])) privateDirectory(directory, io);
  // A runtime fallback is unique and disposable. Never place persistent work
  // here, and never reinterpret a cache directory as a durable profile.
  if (paths.runtimeBase) privateDirectory(paths.runtimeBase, io);
  const runtime = io.mkdtempSync(path.join(paths.runtimeBase || paths.temporary, "atom-runtime-"));
  io.chmodSync(runtime, 0o700);
  return Object.freeze({ ...paths, runtime });
}

module.exports = { nativePaths, privateDirectory, prepareNativePaths };

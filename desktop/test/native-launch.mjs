import { _electron as electron } from "playwright-core";

// Automated RF/fixture navigation must not pan/zoom the public OSM tile service.
// Install the DNS block from process startup, before any renderer or small-pack
// readiness race. Individual UI tests may additionally fulfill synthetic tiles.
// This is test-side launch instrumentation, never a production bypass setting.
export function launchNative(options) {
  return electron.launch({ ...options, args: ["--no-proxy-server", "--host-resolver-rules=MAP tile.openstreetmap.org ~NOTFOUND", ...(options.args || [])] });
}

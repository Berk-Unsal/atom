import { createHash } from "node:crypto";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

// Reuse identical incumbent light evidence rather than duplicating docs assets.
export async function createThemeCaptureWriter(repository, directory) {
  const files = new Map();
  const baseline = resolve(repository, "docs/assets/basemap-alidade");
  for (const name of (await readdir(baseline)).filter((name) => name.endsWith(".jpg"))) {
    const file = resolve(baseline, name);
    files.set(createHash("sha256").update(await readFile(file)).digest("hex"), file);
  }
  return async (name, bytes) => {
    const digest = createHash("sha256").update(bytes).digest("hex");
    const target = resolve(directory, `${name}.jpg`);
    const existing = files.get(digest);
    if (existing) {
      if (target !== existing) await rm(target, { force: true });
      return relative(repository, existing);
    }
    await writeFile(target, bytes);
    files.set(digest, target);
    return relative(repository, target);
  };
}

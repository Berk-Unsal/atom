import fs from "node:fs/promises";
import path from "node:path";
import { protectedContext, resolveTag, sourceJSONOrText, outputs } from "./release-api.mjs";
const root = path.resolve(import.meta.dirname, "../..");
await protectedContext("desktop-candidates");
const candidate = await resolveTag(process.env.ATOM_CANDIDATE_TAG);
for (const review of [JSON.parse(await fs.readFile(path.join(root, "desktop/data-redistribution.json"), "utf8")), await sourceJSONOrText(candidate.source_commit, "desktop/data-redistribution.json")]) {
  if (review.status !== "approved" || !review.approval?.reviewer || !review.approval?.record_url) throw new Error("Bundled-data review is pending; no binary upload is authorized");
}
await outputs(candidate); console.log(JSON.stringify(candidate));

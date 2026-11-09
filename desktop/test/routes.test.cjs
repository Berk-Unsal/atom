"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { allowedAPIPath, validPrivateTarget } = require("../lib/routes.cjs");

test("every existing Go API route has an explicit native policy decision", () => {
  const directory = path.resolve(__dirname, "../../backend-go");
  let count = 0;
  for (const file of fs.readdirSync(directory).filter((name) => name.endsWith(".go") && !name.endsWith("_test.go"))) {
    const source = fs.readFileSync(path.join(directory, file), "utf8");
    for (const [, method, route] of source.matchAll(/router\.(GET|POST|DELETE|PUT|PATCH)\(\s*"([^"\n]+)"/g)) {
      if (!route.startsWith("/api/") && !["/healthz", "/readyz"].includes(route)) continue;
      const concrete = route.replace(":jobID", `job-${"a".repeat(24)}`).replace(":id", "building_123");
      // Dataset activation is a typed native transaction: renderer HTTP must
      // not bypass registration, source revalidation or startup persistence.
      const typedNativeOnly = method === "POST" && route === "/api/datasets/switch";
      assert.equal(allowedAPIPath(method, concrete), !typedNativeOnly, `${method} ${route} needs a reviewed native route decision`);
      count++;
    }
  }
  assert.ok(count >= 40, "Inspect the actual backend route registrations");
});

test("unknown methods, paths and destination syntax cannot expand the proxy", () => {
  for (const [method, route] of [["CONNECT", "/api/meta"], ["POST", "/api/meta"], ["GET", "/api/admin"],
    ["GET", "/api/jobs/../meta"], ["GET", "/api/jobs/job-123"], ["GET", "/api/spatial-evidence/buildings/%2Fetc"],
    ["GET", "/api/spatial-evidence/buildings/.."], ["GET", "/api/spatial-evidence/buildings/%00"]]) {
    assert.equal(allowedAPIPath(method, route), false, `${method} ${route}`);
  }
  assert.equal(allowedAPIPath("GET", "/api/spatial-evidence/buildings/osm%3A%C3%A7ankaya-1"), true);
});

test("only a current credentialed IPv4 loopback target can receive host credentials", () => {
  const generation = "a".repeat(32);
  const target = { address: "127.0.0.1:43210", token: "b".repeat(64), generation };
  assert.equal(validPrivateTarget(target, generation), true);
  for (const address of ["localhost:43210", "0.0.0.0:43210", "[::1]:43210", "evil.test:43210", "127.0.0.1:0", "127.0.0.1:65536", "127.0.0.1:43210@evil.test", "127.0.0.1:43210/path"]) {
    assert.equal(validPrivateTarget({ ...target, address }, generation), false, address);
  }
  assert.equal(validPrivateTarget({ ...target, token: "short" }, generation), false);
  assert.equal(validPrivateTarget(target, "c".repeat(32)), false);
});

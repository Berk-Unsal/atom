"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
const { consumeCredentials, SECRET_NAMES, withSigningCredentials } = require("../lib/signing-credentials.cjs");
const fixture = () => ({ ATOM_DEVELOPER_ID_P12_BASE64: Buffer.alloc(64, 1).toString("base64"), ATOM_DEVELOPER_ID_PASSWORD: "synthetic-test-password",
  ATOM_NOTARY_KEY_BASE64: Buffer.from("-----BEGIN PRIVATE KEY-----\nsynthetic qualification fixture only\n-----END PRIVATE KEY-----").toString("base64"),
  ATOM_NOTARY_KEY_ID: "AB1234CD56", ATOM_NOTARY_ISSUER_ID: "00000000-0000-0000-0000-000000000001", GH_TOKEN: "synthetic-token", DEBUG: "*", PATH: "/usr/bin:/bin" });
test("credential consumption removes child-environment secrets before signer imports", () => {
  const env = fixture(); const credentials = consumeCredentials(env);
  assert.equal(credentials.p12.length, 64); assert.equal(credentials.keyID, "AB1234CD56");
  assert.deepEqual(env, { PATH: "/usr/bin:/bin" });
});
test("missing or malformed credentials fail without retaining values in the child environment", () => {
  for (const patch of [{ ATOM_DEVELOPER_ID_P12_BASE64: "bad?encoding" }, { ATOM_NOTARY_ISSUER_ID: "bad" }, { ATOM_DEVELOPER_ID_PASSWORD: "" }]) {
    const env = { ...fixture(), ...patch }; assert.throws(() => consumeCredentials(env));
    assert.ok(SECRET_NAMES.every((name) => env[name] === undefined)); assert.equal(env.GH_TOKEN, undefined);
  }
});
test("credential buffers are cleared when metadata preparation or later signing fails", async () => {
  for (const fail of [false, true]) {
    const env = fixture(); let retained;
    const operation = withSigningCredentials(env, async (credentials) => {
      retained = credentials; assert.deepEqual(env, { PATH: "/usr/bin:/bin" });
      if (fail) throw new Error("Synthetic metadata preparation failure");
      return "complete";
    });
    if (fail) await assert.rejects(operation, /preparation failure/); else assert.equal(await operation, "complete");
    assert.ok(retained.p12.every((byte) => byte === 0)); assert.ok(retained.notary.every((byte) => byte === 0));
  }
});

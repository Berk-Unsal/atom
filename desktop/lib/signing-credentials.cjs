"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const SECRET_NAMES = ["ATOM_DEVELOPER_ID_P12_BASE64", "ATOM_DEVELOPER_ID_PASSWORD", "ATOM_NOTARY_KEY_BASE64", "ATOM_NOTARY_KEY_ID", "ATOM_NOTARY_ISSUER_ID"];
function consumeCredentials(env) {
  const values = Object.fromEntries(SECRET_NAMES.map((name) => [name, env[name]]));
  for (const name of [...SECRET_NAMES, "DEBUG", "GH_TOKEN"]) delete env[name];
  if (SECRET_NAMES.some((name) => typeof values[name] !== "string" || !values[name])) throw new Error("Protected Developer ID/notary credentials are incomplete");
  if (!/^[A-Z0-9]{10}$/.test(values.ATOM_NOTARY_KEY_ID) || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(values.ATOM_NOTARY_ISSUER_ID)) throw new Error("Notary key/issuer identifiers are invalid");
  const decode = (value) => {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("Protected signing credential encoding is invalid");
    const bytes = Buffer.from(value, "base64");
    if (bytes.length < 32) throw new Error("Protected signing credential is incomplete");
    return bytes;
  };
  const p12 = decode(values.ATOM_DEVELOPER_ID_P12_BASE64); const notary = decode(values.ATOM_NOTARY_KEY_BASE64);
  if (!notary.toString().includes("-----BEGIN PRIVATE KEY-----")) throw new Error("Notary private-key format is invalid");
  return { p12, notary, p12Password: values.ATOM_DEVELOPER_ID_PASSWORD, keyID: values.ATOM_NOTARY_KEY_ID, issuerID: values.ATOM_NOTARY_ISSUER_ID };
}
function privateKeychain(directory, credentials) {
  const keychain = path.join(directory, "atom-signing.keychain-db"); const p12 = path.join(directory, "identity.p12"); const notaryKey = path.join(directory, "notary.p8");
  const password = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(p12, credentials.p12, { mode: 0o600 }); fs.writeFileSync(notaryKey, credentials.notary, { mode: 0o600 });
  const security = (args) => {
    try { return execFileSync("/usr/bin/security", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
    catch { throw new Error("The private signing-keychain operation failed; credential values were not logged"); }
  };
  const cleanup = () => {
    try { security(["delete-keychain", keychain]); } catch { /* A partial import may not have created it. */ }
    for (const file of [p12, notaryKey]) fs.rmSync(file, { force: true });
  };
  try {
    security(["create-keychain", "-p", password, keychain]);
    security(["set-keychain-settings", "-lut", "21600", keychain]);
    security(["unlock-keychain", "-p", password, keychain]);
    security(["import", p12, "-k", keychain, "-P", credentials.p12Password, "-T", "/usr/bin/codesign", "-T", "/usr/bin/security"]);
    security(["set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", password, keychain]);
    fs.rmSync(p12, { force: true }); credentials.p12.fill(0); credentials.notary.fill(0);
    return { keychain, notaryKey, identities: security(["find-identity", "-v", "-p", "codesigning", keychain]), cleanup };
  } catch (error) { cleanup(); throw error; }
}
async function withSigningCredentials(env, operation) {
  const credentials = consumeCredentials(env);
  try { return await operation(credentials); }
  finally { credentials.p12.fill(0); credentials.notary.fill(0); }
}
module.exports = { consumeCredentials, privateKeychain, SECRET_NAMES, withSigningCredentials };

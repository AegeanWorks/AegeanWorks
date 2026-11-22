import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalPayload,
  computeDigest,
  lookupRegister,
  parseCertificate,
  parseRegister,
  parseTerms,
  registerFreshness,
  termsDigest,
  validCertificateId,
  verifyCertificate,
} from "../../docs/verify-core.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const vector = JSON.parse(
  await readFile(path.join(here, "..", "vectors", "verification-vector.json"), "utf8")
);
const original = structuredClone(vector.certificate);
const termsText = "Aegean test agreement\n";
const termsHash = await termsDigest(termsText);
const terms = parseTerms(
  JSON.stringify({
    version: 1,
    licenses: {
      "ACL-1.0": {
        name: "Aegean Commercial License 1.0",
        document: "licenses/ACL-1.0.md",
        status: "operative",
        sha256: termsHash,
        scopes: ["internal-use"],
        tiers: ["Tier2"],
        allowances: ["hosted-service"],
      },
    },
  })
);
const today = "2026-10-27";
let assertions = 0;

function expect(value, message) {
  assert.ok(value, message);
  assertions += 1;
}

function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
  assertions += 1;
}

function registerFor(certificate, status = "valid") {
  const raw = {
    version: 1,
    certificates: {
      [certificate.cert_id]: {
        digest: certificate.digest,
        status,
        license_type: "ACL-1.0",
        issued_at: "2026-10-27",
        revoked_at: status === "revoked" ? "2026-10-28" : "",
        reason: status === "revoked" ? "test revocation" : "",
      },
    },
  };
  return parseRegister(JSON.stringify(raw));
}

async function withDigest(certificate) {
  const copy = structuredClone(certificate);
  delete copy.digest;
  copy.digest = await computeDigest(copy);
  return copy;
}

async function verdict(certificate, register, options = {}) {
  return verifyCertificate({
    certificate,
    register,
    terms: options.terms || terms,
    termsText: options.termsText === undefined ? termsText : options.termsText,
    project: options.project || "",
    today: options.today || today,
  });
}

assertions += 1;
assert.equal(await computeDigest(original), vector.expected_digest);
assertions += 1;
assert.equal(original.digest, vector.expected_digest);
assertions += 1;
assert.match(canonicalPayload(original), /\\u0131/);
assertions += 1;
assert.match(canonicalPayload(original), /\\u2014/);
assertions += 1;
assert.match(canonicalPayload(original), /"projects":\["Aegean-Licensing","Chronos"\]/);
assertions += 1;
assert.equal(canonicalPayload({ cert_id: "x", format: 2, note: "\u007f" }),
  '{"cert_id":"x","format":2,"note":"\\u007f"}');
assertions += 1;
assert.equal(canonicalPayload({ cert_id: "x", format: 2, n: 1.0 }),
  '{"cert_id":"x","format":2,"n":1}');
assertions += 1;
assert.throws(() => canonicalPayload({ cert_id: "x", format: 2, n: 1.5 }), /integer/);
assertions += 1;
assert.throws(() => canonicalPayload({ cert_id: "x", format: 2, n: 9007199254740992 }), /safe/);
assertions += 1;
assert.equal(parseCertificate("\uFEFF" + JSON.stringify(original)).cert_id, original.cert_id);
assertions += 1;
assert.throws(
  () => parseTerms(JSON.stringify({ version: 1, licenses: {} })),
  /at least one/
);
assertions += 1;
assert.throws(
  () =>
    parseTerms(
      JSON.stringify({
        version: 1,
        licenses: {
          "ACL-1.0": {
            document: "licenses/ACL-1.0.md",
            scopes: "internal-use",
            tiers: [],
            allowances: [],
          },
        },
      })
    ),
  /list of strings/
);
assertions += 1;

const validRegister = registerFor(original);
const valid = await verdict(original, validRegister);
equal(valid.status, "VALID", "vector should verify against its register entry");
equal(valid.is_valid, true, "valid result");
equal(valid.registered, true, "valid result is registered");
equal(valid.signature_verified, false, "public verifier never claims signature verification");
equal(valid.terms_verified, false, "vector cites no terms digest");

const tampered = structuredClone(original);
tampered.licensee_name = "Mallory";
equal((await verdict(tampered, validRegister)).status, "TAMPERED", "altered payload");

const forged = await withDigest(tampered);
equal((await verdict(forged, validRegister)).status, "UNREGISTERED", "self-consistent forgery is unregistered");

equal((await verdict(original, registerFor(original, "revoked"))).status, "REVOKED", "revoked entry");
equal((await verdict(original, validRegister, { project: "Voidfarer" })).status, "SCOPE_MISMATCH", "scope");

const expired = structuredClone(original);
expired.is_perpetual = false;
expired.expires_at = "2026-01-01";
const expiredCert = await withDigest(expired);
equal((await verdict(expiredCert, registerFor(expiredCert))).status, "EXPIRED", "expired certificate");

const looseDate = structuredClone(original);
looseDate.is_perpetual = false;
looseDate.expires_at = "20270101";
const looseDateCert = await withDigest(looseDate);
equal(
  (await verdict(looseDateCert, registerFor(looseDateCert))).status,
  "INVALID_FORMAT",
  "dates must use YYYY-MM-DD"
);

const contradictory = structuredClone(original);
contradictory.expires_at = "2027-01-01";
const contradictoryCert = await withDigest(contradictory);
equal(
  (await verdict(contradictoryCert, registerFor(contradictoryCert))).status,
  "INVALID_FORMAT",
  "perpetual with expiry"
);

const oldFormat = structuredClone(original);
oldFormat.format = 1;
equal((await verdict(oldFormat, validRegister)).status, "UNSUPPORTED_FORMAT", "format 1");

const noId = structuredClone(original);
noId.cert_id = "";
const noIdCert = await withDigest(noId);
equal((await verdict(noIdCert, validRegister)).status, "UNREGISTERED", "empty id is unregistered, matching the Python reference");

const noProjects = structuredClone(original);
delete noProjects.projects;
const noProjectsCert = await withDigest(noProjects);
equal(
  (await verdict(noProjectsCert, registerFor(noProjectsCert), { project: "Voidfarer" })).status,
  "VALID",
  "missing projects defaults to * like the Python data model"
);

for (const [field, value] of Object.entries({
  projects: [1, 2],
  allowances: 5,
  expires_at: ["2027-01-01"],
  is_perpetual: "false",
  license_type: "",
})) {
  const malformed = structuredClone(original);
  malformed[field] = value;
  malformed.digest = "0".repeat(64);
  equal(
    (await verdict(malformed, validRegister)).status,
    "INVALID_FORMAT",
    `${field} has the wrong JSON type`
  );
}

const wrongTerms = structuredClone(original);
wrongTerms.terms_digest = "0".repeat(64);
const wrongTermsCert = await withDigest(wrongTerms);
equal(
  (await verdict(wrongTermsCert, registerFor(wrongTermsCert))).status,
  "INVALID_FORMAT",
  "terms digest mismatch"
);

const unknownTier = structuredClone(original);
unknownTier.tier = "Tier9";
const unknownTierCert = await withDigest(unknownTier);
equal(
  (await verdict(unknownTierCert, registerFor(unknownTierCert))).status,
  "INVALID_FORMAT",
  "unknown tier"
);

const unknownScope = structuredClone(original);
unknownScope.scope = "unlimited-global";
const unknownScopeCert = await withDigest(unknownScope);
equal(
  (await verdict(unknownScopeCert, registerFor(unknownScopeCert))).status,
  "INVALID_FORMAT",
  "unknown scope"
);

const unknownAllowance = structuredClone(original);
unknownAllowance.allowances = ["ai-training"];
const unknownAllowanceCert = await withDigest(unknownAllowance);
equal(
  (await verdict(unknownAllowanceCert, registerFor(unknownAllowanceCert))).status,
  "INVALID_FORMAT",
  "unknown allowance"
);

const citedTerms = structuredClone(original);
citedTerms.terms_digest = termsHash;
const citedTermsCert = await withDigest(citedTerms);
const cited = await verdict(citedTermsCert, registerFor(citedTermsCert));
equal(cited.status, "VALID", "matching terms digest");
equal(cited.terms_verified, true, "terms verified flag");
const citedRevoked = await verdict(
  citedTermsCert,
  registerFor(citedTermsCert, "revoked")
);
equal(citedRevoked.status, "REVOKED", "revoked cited certificate");
equal(citedRevoked.terms_verified, true, "terms stay verified when revocation stops the check");
equal(
  (await verdict(citedTermsCert, registerFor(citedTermsCert), { termsText: null })).status,
  "UNAVAILABLE",
  "missing agreement text is unavailable, not invalid"
);

const wrongPin = parseTerms(
  JSON.stringify({
    version: 1,
    licenses: {
      "ACL-1.0": {
        name: "Aegean Commercial License 1.0",
        document: "licenses/ACL-1.0.md",
        status: "operative",
        sha256: "0".repeat(64),
        scopes: ["internal-use"],
        tiers: ["Tier2"],
        allowances: ["hosted-service"],
      },
    },
  })
);
equal(
  (await verdict(citedTermsCert, registerFor(citedTermsCert), { terms: wrongPin })).status,
  "INVALID_FORMAT",
  "edited agreement is refused"
);

assert.throws(
  () =>
    parseRegister(
      JSON.stringify({
        version: 1,
        certificates: { x: { digest: "0".repeat(64), status: "pending" } },
      })
    ),
  /unknown status/,
  "unknown register status is malformed"
);
assertions += 1;
assert.throws(
  () =>
    parseRegister(
      JSON.stringify({
        version: 1,
        certificates: { x: { digest: "A".repeat(64), status: "valid" } },
      })
    ),
  /invalid digest/,
  "an uppercase register digest is malformed"
);
assertions += 1;
assert.throws(
  () =>
    parseRegister(
      JSON.stringify({
        version: 1,
        certificates: {
          x: { digest: "0".repeat(64), status: "valid", license_type: 7 },
        },
      })
    ),
  /non-text license_type/,
  "a non-text register field is malformed"
);
assertions += 1;
assert.throws(() => parseCertificate("[1,2,3]"), /must be an object|not valid/i);
assertions += 1;
assert.throws(() => parseCertificate("not json"), /valid JSON/);
assertions += 1;

expect(validCertificateId("conformance-vector-0001"), "certificate id accepted");
expect(validCertificateId("abc_DEF.123:456"), "certificate id punctuation");
expect(!validCertificateId("../escape"), "path traversal id rejected");
expect(!validCertificateId("has space"), "space id rejected");
expect(!validCertificateId(""), "empty id rejected");
expect(!validCertificateId("x".repeat(129)), "long id rejected");

const lookupMap = new Map([
  ["known", { cert_id: "known", status: "valid" }],
]);
equal(lookupRegister(lookupMap, "known")?.status, "valid", "register lookup");
equal(lookupRegister(lookupMap, " missing "), null, "unknown register lookup");
equal(lookupRegister(null, "known"), null, "missing register map");
equal(lookupRegister(lookupMap, "bad id"), null, "unsafe lookup id");

const freshnessText = JSON.stringify({ version: 2, generated_at: "2026-10-30T00:00:00Z", next_update: "2026-11-29T00:00:00Z", certificates: {} });
const fresh = registerFreshness(freshnessText, new Date("2026-11-22T00:00:00Z"));
equal(fresh.generated, "2026-10-30", "freshness reports the generated date");
equal(fresh.nextUpdate, "2026-11-29", "freshness reports the refresh date");
equal(fresh.stale, false, "in-window snapshot is not stale");
equal(registerFreshness(freshnessText, new Date("2026-12-01T00:00:00Z")).stale, true, "past-window snapshot is stale");
equal(registerFreshness("not json"), null, "unreadable register has no freshness");

console.log(`ok ${assertions} verifier assertions`);

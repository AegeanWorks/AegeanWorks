/* AegeanWorks public certificate checks (format 2).
 * Pure functions shared by the browser UI and the Node parity tests.
 * This module never implements the HMAC signature check: the signing key is
 * private, and the public register is the proof of issuance (ACL-1.0 §6).
 */

export const CERT_FORMAT = 2;
export const DIGEST_DOMAIN = "aegean-certificate/2\n";
export const MAX_CERTIFICATE_BYTES = 262144;
export const MAX_REGISTER_BYTES = 1048576;
export const MAX_TERMS_BYTES = 262144;

/* hygiene: allow canonical register fetch, not a loaded third-party asset */
export const REGISTER_URL = "https://raw.githubusercontent.com/AegeanWorks/Aegean-Licensing/master/licenses/issued.json";
/* hygiene: allow canonical terms fetch, not a loaded third-party asset */
export const TERMS_URL = "https://raw.githubusercontent.com/AegeanWorks/Aegean-Licensing/master/licenses/terms.json";
/* hygiene: allow canonical agreement fetch, not a loaded third-party asset */
export const TERMS_BASE_URL = "https://raw.githubusercontent.com/AegeanWorks/Aegean-Licensing/master/";

const SERIAL = /^[0-9a-f]{64}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DOCUMENT_PATH = /^licenses\/[A-Za-z0-9._-]+\.md$/;

export class VerificationInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "VerificationInputError";
  }
}

function compareCodePoints(left, right) {
  const a = Array.from(left, (character) => character.codePointAt(0));
  const b = Array.from(right, (character) => character.codePointAt(0));
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function quoteAscii(text) {
  let output = '"';
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (character === '"') output += '\\"';
    else if (character === "\\") output += "\\\\";
    else if (character === "\b") output += "\\b";
    else if (character === "\f") output += "\\f";
    else if (character === "\n") output += "\\n";
    else if (character === "\r") output += "\\r";
    else if (character === "\t") output += "\\t";
    else if (codePoint < 0x20 || codePoint === 0x7f) {
      output += "\\u" + codePoint.toString(16).padStart(4, "0");
    } else if (codePoint <= 0x7f) output += character;
    else if (codePoint <= 0xffff) output += "\\u" + codePoint.toString(16).padStart(4, "0");
    else {
      const scalar = codePoint - 0x10000;
      const high = 0xd800 + (scalar >> 10);
      const low = 0xdc00 + (scalar & 0x3ff);
      output += "\\u" + high.toString(16).padStart(4, "0");
      output += "\\u" + low.toString(16).padStart(4, "0");
    }
  }
  return output + '"';
}

function serializeAscii(value) {
  if (value === null) return "null";
  if (typeof value === "string") return quoteAscii(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new VerificationInputError("Certificate numbers must be integers within the safe range.");
    }
    return String(value);
  }
  if (Array.isArray(value)) return "[" + value.map(serializeAscii).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value).sort(compareCodePoints);
    return "{" + keys.map((key) => quoteAscii(key) + ":" + serializeAscii(value[key])).join(",") + "}";
  }
  throw new VerificationInputError("Unsupported JSON value in certificate.");
}

export function canonicalPayload(certificate) {
  if (!certificate || typeof certificate !== "object" || Array.isArray(certificate)) {
    throw new VerificationInputError("Certificate must be a JSON object.");
  }
  const filtered = Object.create(null);
  for (const key of Object.keys(certificate)) {
    if (key === "digest" || key === "signature") continue;
    filtered[key] = certificate[key];
  }
  if (Array.isArray(filtered.projects)) {
    filtered.projects = filtered.projects.slice().sort(compareCodePoints);
  }
  return serializeAscii(filtered);
}

export async function computeDigest(certificate) {
  const bytes = new TextEncoder().encode(DIGEST_DOMAIN + canonicalPayload(certificate));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeDocumentText(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export async function termsDigest(text) {
  const bytes = new TextEncoder().encode(normalizeDocumentText(String(text)));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseCertificate(rawText) {
  const text = String(rawText || "").replace(/^\uFEFF/, "");
  if (new TextEncoder().encode(text).length > MAX_CERTIFICATE_BYTES) {
    throw new VerificationInputError("Certificate is larger than 256 KiB.");
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new VerificationInputError("Certificate is not valid JSON.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new VerificationInputError("Certificate JSON must be an object.");
  }
  return data;
}

function stringArray(value) {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value === "string") return [value];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new VerificationInputError("A project or allowance list must contain only strings.");
  }
  return value.slice();
}

function stringList(value, label) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new VerificationInputError(label + " must be a list of strings.");
  }
  return value.slice();
}

export function parseRegister(rawText) {
  const text = String(rawText || "");
  if (new TextEncoder().encode(text).length > MAX_REGISTER_BYTES) {
    throw new VerificationInputError("Register is larger than 1 MiB.");
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new VerificationInputError("Register is not valid JSON.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new VerificationInputError("Register must be a JSON object.");
  }
  if (data.version !== 1 && data.version !== 2) {
    throw new VerificationInputError("Unsupported register version.");
  }
  if (data.version === 2) {
    const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    if (!ISO.test(String(data.generated_at || "")) || !ISO.test(String(data.next_update || ""))) {
      throw new VerificationInputError("Version-2 register needs generated_at and next_update timestamps.");
    }
  }
  const certificates = data.certificates;
  if (!certificates || typeof certificates !== "object" || Array.isArray(certificates)) {
    throw new VerificationInputError("Register certificates must be a JSON object.");
  }
  const entries = new Map();
  for (const certId of Object.keys(certificates)) {
    const raw = certificates[certId];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new VerificationInputError("Register entry for " + certId + " is malformed.");
    }
    const status = raw.status;
    if (status !== "valid" && status !== "revoked") {
      throw new VerificationInputError("Register entry for " + certId + " has an unknown status.");
    }
    const digest = typeof raw.digest === "string" ? raw.digest : "";
    if (!HEX64.test(digest)) {
      throw new VerificationInputError("Register entry for " + certId + " has an invalid digest.");
    }
    for (const field of ["license_type", "issued_at", "revoked_at", "reason"]) {
      if (raw[field] !== undefined && typeof raw[field] !== "string") {
        throw new VerificationInputError(
          "Register entry for " + certId + " has a non-text " + field + "."
        );
      }
    }
    entries.set(certId, {
      cert_id: certId,
      digest,
      status,
      license_type: typeof raw.license_type === "string" ? raw.license_type : "",
      issued_at: typeof raw.issued_at === "string" ? raw.issued_at : "",
      revoked_at: typeof raw.revoked_at === "string" ? raw.revoked_at : "",
      reason: typeof raw.reason === "string" ? raw.reason : "",
    });
  }
  return entries;
}

export function parseTerms(rawText) {
  const text = String(rawText || "");
  if (new TextEncoder().encode(text).length > MAX_TERMS_BYTES) {
    throw new VerificationInputError("Terms registry is larger than 256 KiB.");
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new VerificationInputError("Terms registry is not valid JSON.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new VerificationInputError("Terms registry must be a JSON object.");
  }
  if (data.version !== 1) {
    throw new VerificationInputError("Unsupported terms registry version.");
  }
  const licenses = data.licenses;
  if (!licenses || typeof licenses !== "object" || Array.isArray(licenses)) {
    throw new VerificationInputError("Terms registry licenses must be a JSON object.");
  }
  const entries = new Map();
  for (const key of Object.keys(licenses)) {
    const raw = licenses[key];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new VerificationInputError("License " + key + " in the terms registry is malformed.");
    }
    const document = typeof raw.document === "string" ? raw.document : "";
    if (!DOCUMENT_PATH.test(document)) {
      throw new VerificationInputError("License " + key + " names an invalid document path.");
    }
    const sha256 = typeof raw.sha256 === "string" ? raw.sha256.trim().toLowerCase() : "";
    if (sha256 && !HEX64.test(sha256)) {
      throw new VerificationInputError("License " + key + " has an invalid terms digest.");
    }
    const scopes = stringList(raw.scopes, "License " + key + " scopes");
    const tiers = raw.tiers === undefined
      ? []
      : stringList(raw.tiers, "License " + key + " tiers");
    const allowances = raw.allowances === undefined
      ? []
      : stringList(raw.allowances, "License " + key + " allowances");
    if (!scopes.length) {
      throw new VerificationInputError("License " + key + " requires a scopes list.");
    }
    entries.set(key.toLowerCase(), {
      key,
      name: typeof raw.name === "string" ? raw.name : key,
      document,
      status: typeof raw.status === "string" ? raw.status : "draft",
      sha256,
      scopes,
      tiers,
      allowances,
    });
  }
  if (!entries.size) {
    throw new VerificationInputError("Terms registry must list at least one license.");
  }
  return entries;
}

export function resolveTerms(terms, licenseType) {
  const key = String(licenseType || "").trim().toLowerCase();
  const entry = terms.get(key);
  if (!entry) throw new VerificationInputError("Unknown license type: " + licenseType + ".");
  return entry;
}

export function validCertificateId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value.trim());
}

/* Freshness of a version-2 register, for honest labelling of bundled snapshots. */
export function registerFreshness(rawText, now = new Date()) {
  let data;
  try {
    data = JSON.parse(String(rawText || ""));
  } catch (error) {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const iso = /^\d{4}-\d{2}-\d{2}T/;
  const generated = iso.test(String(data.generated_at || "")) ? String(data.generated_at).slice(0, 10) : "";
  const nextUpdate = iso.test(String(data.next_update || "")) ? String(data.next_update).slice(0, 10) : "";
  if (!generated && !nextUpdate) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const due = nextUpdate ? Date.parse(nextUpdate + "T00:00:00Z") : NaN;
  return { generated, nextUpdate, stale: Number.isFinite(due) ? due < today : false };
}

export function lookupRegister(register, certificateId) {
  if (!(register instanceof Map)) return null;
  const id = String(certificateId || "").trim();
  if (!validCertificateId(id)) return null;
  return register.get(id) || null;
}

function isIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function result(status, reasons, details) {
  return {
    status,
    is_valid: status === "VALID",
    reasons: reasons.slice(),
    cert: details && details.cert ? details.cert : null,
    registered: Boolean(details && details.registered),
    terms_verified: Boolean(details && details.terms_verified),
    signature_verified: false,
    register_entry: details && details.register_entry ? details.register_entry : null,
    terms: details && details.terms ? details.terms : null,
  };
}

function displayCertificate(certificate) {
  const text = (value) => (value === undefined || value === null ? "" : String(value));
  return {
    cert_id: text(certificate.cert_id),
    licensee_name: text(certificate.licensee_name),
    licensee_contact: text(certificate.licensee_contact),
    licensee_address: text(certificate.licensee_address),
    licensee_registration: text(certificate.licensee_registration),
    licensee_country: text(certificate.licensee_country),
    issuer: text(certificate.issuer),
    issuer_contact: text(certificate.issuer_contact),
    license_type: text(certificate.license_type),
    projects: certificate.projects === undefined ? ["*"] : stringArray(certificate.projects),
    scope: text(certificate.scope),
    tier: text(certificate.tier),
    allowances: stringArray(certificate.allowances),
    issued_at: text(certificate.issued_at),
    expires_at: text(certificate.expires_at),
    is_perpetual: certificate.is_perpetual !== false,
    notes: text(certificate.notes),
    serial: text(certificate.serial),
    signature_present: Boolean(certificate.signature),
  };
}

function typeError(certificate) {
  const projects = certificate.projects === undefined ? ["*"] : certificate.projects;
  if (typeof projects === "string") {
    // A single project name is accepted, matching the Python data model.
  } else if (Array.isArray(projects)) {
    if (!projects.every((item) => typeof item === "string")) {
      return "'projects' must contain only strings.";
    }
  } else {
    return "'projects' must be a string or a list of strings.";
  }
  const allowances = certificate.allowances === undefined ? [] : certificate.allowances;
  if (typeof allowances === "string" || allowances === null) {
    // One allowance, or none.
  } else if (Array.isArray(allowances)) {
    if (!allowances.every((item) => typeof item === "string")) {
      return "'allowances' must contain only strings.";
    }
  } else {
    return "'allowances' must be a string or a list of strings.";
  }
  if (
    certificate.expires_at !== undefined &&
    certificate.expires_at !== null &&
    typeof certificate.expires_at !== "string"
  ) {
    return "'expires_at' must be a string or null.";
  }
  if ("is_perpetual" in certificate && typeof certificate.is_perpetual !== "boolean") {
    return "'is_perpetual' must be a boolean.";
  }
  if (
    "license_type" in certificate &&
    (typeof certificate.license_type !== "string" || !certificate.license_type.trim())
  ) {
    return "'license_type' must be a non-empty string.";
  }
  return "";
}

export async function verifyCertificate({
  certificate,
  register,
  terms,
  termsText = null,
  project = "",
  today = new Date().toISOString().slice(0, 10),
}) {
  if (!certificate || typeof certificate !== "object" || Array.isArray(certificate)) {
    return result("INVALID_FORMAT", ["Certificate must be a JSON object."]);
  }
  if (!(register instanceof Map) || !(terms instanceof Map)) {
    return result("UNAVAILABLE", ["The register or the terms registry is not loaded."]);
  }
  if (certificate.format !== CERT_FORMAT) {
    return result("UNSUPPORTED_FORMAT", [
      "Certificate format " + JSON.stringify(certificate.format) + " is not accepted; only format 2 verifies.",
    ]);
  }
  const recorded = typeof certificate.digest === "string" ? certificate.digest.trim() : "";
  if (!recorded) {
    return result("TAMPERED", ["Certificate is missing its digest."]);
  }
  const malformed = typeError(certificate);
  if (malformed) {
    return result("INVALID_FORMAT", [malformed]);
  }
  let computed;
  try {
    computed = await computeDigest(certificate);
  } catch (error) {
    return result("INVALID_FORMAT", ["Certificate payload cannot be canonicalized: " + error.message]);
  }
  if (recorded !== computed) {
    return result("TAMPERED", ["The certificate digest does not match its contents."]);
  }
  let cert;
  try {
    cert = displayCertificate(certificate);
  } catch (error) {
    return result("INVALID_FORMAT", [error.message]);
  }
  if (!SERIAL.test(cert.serial)) {
    return result("INVALID_FORMAT", ["Certificate serial must be 64 lowercase hex characters."], { cert });
  }

  let resolved = null;
  let termsVerified = false;
  const licenseType = certificate.license_type === undefined
    ? "ACL-1.0"
    : certificate.license_type;
  if (typeof licenseType !== "string" || !licenseType) {
    return result("INVALID_FORMAT", ["Certificate license_type must be a non-empty string."], { cert });
  }
  try {
    resolved = resolveTerms(terms, licenseType);
  } catch (error) {
    return result("INVALID_FORMAT", [error.message], { cert });
  }
  if (cert.tier && resolved.tiers.length && !resolved.tiers.includes(cert.tier)) {
    return result("INVALID_FORMAT", [
      "Tier " + cert.tier + " is not defined by " + resolved.key + ".",
    ], { cert, terms: resolved });
  }
  if (cert.scope && !resolved.scopes.includes(cert.scope)) {
    return result("INVALID_FORMAT", [
      "Scope " + cert.scope + " is not defined by " + resolved.key + ".",
    ], { cert, terms: resolved });
  }
  const unknown = cert.allowances.filter((allowance) => !resolved.allowances.includes(allowance));
  if (unknown.length) {
    return result("INVALID_FORMAT", [
      "Allowances " + unknown.join(", ") + " are not defined by " + resolved.key + ".",
    ], { cert, terms: resolved, terms_verified: termsVerified });
  }
  const citedTerms = typeof certificate.terms_digest === "string"
    ? certificate.terms_digest.trim()
    : "";
  if (citedTerms) {
    if (!termsText) {
      return result("UNAVAILABLE", [
        "The certificate cites the agreement text, but the canonical agreement could not be loaded.",
      ], { cert, terms: resolved, terms_verified: termsVerified });
    }
    const published = await termsDigest(termsText);
    if (resolved.sha256 && published !== resolved.sha256) {
      return result("INVALID_FORMAT", [
        "The published agreement no longer matches the digest pinned in terms.json.",
      ], { cert, terms: resolved, terms_verified: termsVerified });
    }
    if (citedTerms !== published) {
      return result("INVALID_FORMAT", [
        "The certificate cites an agreement text that does not match the published agreement.",
      ], { cert, terms: resolved, terms_verified: termsVerified });
    }
    termsVerified = true;
  }

  const entry = register.get(cert.cert_id);
  if (!entry || entry.digest !== recorded) {
    return result("UNREGISTERED", [
      "Certificate " + cert.cert_id + " is not in the register of issued certificates.",
    ], { cert, terms: resolved, terms_verified: termsVerified });
  }
  if (entry.status === "revoked") {
    return result("REVOKED", [
      "Certificate " + cert.cert_id + " was revoked" +
        (entry.revoked_at ? " on " + entry.revoked_at : "") +
        (entry.reason ? ": " + entry.reason : "."),
    ], { cert, terms: resolved, register_entry: entry, terms_verified: termsVerified });
  }

  const perpetual = certificate.is_perpetual === undefined ? true : certificate.is_perpetual;
  if (typeof perpetual !== "boolean") {
    return result("INVALID_FORMAT", ["is_perpetual must be a boolean."], {
      cert, terms: resolved, register_entry: entry,
    });
  }
  const expiresAt = certificate.expires_at ? String(certificate.expires_at) : "";
  if (perpetual && expiresAt) {
    return result("INVALID_FORMAT", ["Certificate is perpetual but also declares expires_at."], {
      cert, terms: resolved, register_entry: entry,
    });
  }
  if (!perpetual && !expiresAt) {
    return result("INVALID_FORMAT", ["Certificate is not perpetual but has no expires_at."], {
      cert, terms: resolved, register_entry: entry,
    });
  }
  if (!perpetual) {
    if (!isIsoDate(expiresAt) || !isIsoDate(today)) {
      return result("INVALID_FORMAT", ["Certificate dates must use YYYY-MM-DD."], {
        cert, terms: resolved, register_entry: entry,
      });
    }
    if (today > expiresAt) {
      return result("EXPIRED", ["Certificate expired on " + expiresAt + "."], {
        cert, terms: resolved, register_entry: entry,
      });
    }
  }

  if (project) {
    const wanted = project.trim().toLowerCase();
    const allowed = cert.projects.map((item) => item.toLowerCase());
    if (wanted && !allowed.includes("*") && !allowed.includes(wanted)) {
      return result("SCOPE_MISMATCH", [
        "Project " + project + " is not covered by " + cert.projects.join(", ") + ".",
      ], { cert, terms: resolved, register_entry: entry, terms_verified: termsVerified });
    }
  }

  return result("VALID", [], {
    cert,
    terms: resolved,
    terms_verified: termsVerified,
    registered: true,
    register_entry: entry,
  });
}

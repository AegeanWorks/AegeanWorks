import {
  MAX_CERTIFICATE_BYTES,
  MAX_TERMS_BYTES,
  REGISTER_URL,
  TERMS_BASE_URL,
  TERMS_URL,
  parseCertificate,
  parseRegister,
  parseTerms,
  lookupRegister,
  resolveTerms,
  validCertificateId,
  verifyCertificate,
} from "./verify-core.js";

/* Bundled snapshot, used only when the canonical host cannot be reached. */
const LOCAL_REGISTER_URL = "licensing/issued.json";
const LOCAL_TERMS_URL = "licensing/terms.json";
const LOCAL_TERMS_BASE_URL = "licensing/";

const STATUS_LABELS = {
  VALID: "Valid",
  REGISTERED: "Registered",
  REVOKED: "Revoked",
  UNREGISTERED: "Not registered",
  TAMPERED: "Tampered",
  EXPIRED: "Expired",
  SCOPE_MISMATCH: "Outside scope",
  INVALID_FORMAT: "Invalid",
  UNSUPPORTED_FORMAT: "Unsupported",
  UNAVAILABLE: "Unavailable",
};

const STATUS_CLASSES = {
  VALID: "is-valid",
  REGISTERED: "is-valid",
  REVOKED: "is-danger",
  TAMPERED: "is-danger",
  INVALID_FORMAT: "is-danger",
  UNSUPPORTED_FORMAT: "is-danger",
  UNAVAILABLE: "is-danger",
  UNREGISTERED: "is-warning",
  EXPIRED: "is-warning",
  SCOPE_MISMATCH: "is-warning",
};

const SUMMARY = {
  VALID: "The certificate is listed as valid in the public register; its digest, terms, scope, dates and optional project check all pass.",
  REVOKED: "The register lists this certificate as revoked. Do not rely on it.",
  UNREGISTERED: "This id and digest are not in the canonical register, so the certificate is not evidence of a grant.",
  TAMPERED: "The digest does not match the certificate contents. Treat the file as altered.",
  EXPIRED: "The certificate term ended before the reference date.",
  SCOPE_MISMATCH: "The certificate does not cover the project you entered.",
  INVALID_FORMAT: "The certificate or the published agreement is malformed; no conclusion is possible.",
  UNSUPPORTED_FORMAT: "Only format-2 certificates verify.",
  UNAVAILABLE: "The register or the agreement text could not be loaded, so no conclusion is possible.",
};

const state = {
  register: null,
  terms: null,
  fetchedAt: null,
  loading: false,
  snapshot: false,
  termTexts: new Map(),
};

let lastExport = null;

const form = document.getElementById("verify-form");
const input = document.getElementById("certificate-input");
const fileInput = document.getElementById("certificate-file");
const projectInput = document.getElementById("project-input");
const runtime = document.getElementById("verify-runtime");
const runtimeError = document.getElementById("verify-runtime-error");
const resultPanel = document.getElementById("verify-result");
const resultBadge = document.getElementById("result-badge");
const resultTitle = document.getElementById("result-title");
const resultSummary = document.getElementById("result-summary");
const resultReasons = document.getElementById("result-reasons");
const resultFacts = document.getElementById("result-facts");
const resultRegister = document.getElementById("result-register");
const registerCount = document.getElementById("register-count");
const registerMeta = document.getElementById("register-meta");
const refreshButton = document.getElementById("refresh-register");
const submitButton = document.getElementById("verify-submit");
const clearButton = document.getElementById("clear-button");
const idInput = document.getElementById("certificate-id");
const idButton = document.getElementById("lookup-id");
const copyButton = document.getElementById("copy-result");
const downloadButton = document.getElementById("download-result");
const exportStatus = document.getElementById("export-status");

function setRuntime(message) {
  if (runtime) runtime.textContent = message;
}

function showError(message) {
  if (!runtimeError) return;
  runtimeError.textContent = message;
  runtimeError.hidden = false;
}

function clearError() {
  if (!runtimeError) return;
  runtimeError.textContent = "";
  runtimeError.hidden = true;
}

function clearResult() {
  if (!resultPanel) return;
  resultPanel.hidden = true;
  lastExport = null;
  if (resultBadge) resultBadge.textContent = "";
  if (resultBadge) resultBadge.className = "verify-badge";
  if (resultSummary) resultSummary.textContent = "";
  if (resultReasons) resultReasons.replaceChildren();
  if (resultFacts) resultFacts.replaceChildren();
  if (resultRegister) resultRegister.textContent = "";
  if (exportStatus) exportStatus.textContent = "";
}

function utcClock(date) {
  return date.toISOString().slice(11, 16) + " UTC";
}

async function readCapped(response, limit, label) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > limit) {
    if (response.body) await response.body.cancel().catch(function () {});
    throw new Error(label + " is larger than the expected limit.");
  }
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > limit) {
      throw new Error(label + " is larger than the expected limit.");
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      total += step.value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(function () {});
        throw new Error(label + " is larger than the expected limit.");
      }
      chunks.push(step.value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch (error) {
      /* the stream is already closed or cancelled */
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(bytes);
}

async function fetchCanonical(url, limit, label) {
  const controller = new AbortController();
  const timer = window.setTimeout(function () {
    controller.abort();
  }, 15000);
  const separator = url.indexOf("?") === -1 ? "?" : "&";
  try {
    const response = await fetch(url + separator + "nonce=" + Date.now(), {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
      headers: { Accept: "application/json, text/plain;q=0.9" },
    });
    if (!response.ok) {
      throw new Error(label + " returned HTTP " + response.status + ".");
    }
    return await readCapped(response, limit, label);
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(label + " timed out. Check your connection and try again.");
    }
    if (error instanceof TypeError) {
      throw new Error(label + " could not be reached. Check your connection and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function updateRegisterStatus() {
  if (registerCount) {
    if (!state.register) {
      registerCount.textContent = "Register unavailable.";
    } else if (state.register.size === 0) {
      registerCount.textContent = "No certificates are listed yet.";
    } else {
      registerCount.textContent =
        state.register.size + (state.register.size === 1 ? " certificate listed." : " certificates listed.");
    }
  }
  if (registerMeta) {
    registerMeta.textContent = state.register
      ? (state.snapshot
        ? "Bundled snapshot · canonical host unreachable"
        : (state.fetchedAt
          ? "Canonical issued.json · fetched " + utcClock(state.fetchedAt)
          : "Canonical issued.json"))
      : "No canonical registry loaded.";
  }
}

/* Try the canonical URL first; fall back to the bundled snapshot, clearly
   labelled in state.snapshot so no result is presented as live canonical data. */
async function fetchWithFallback(remote, local, limit, label) {
  try {
    return { value: await fetchCanonical(remote, limit, label), snapshot: false, problem: "" };
  } catch (remoteError) {
    try {
      return { value: await fetchCanonical(local, limit, label), snapshot: true, problem: remoteError.message };
    } catch (localError) {
      return { value: null, snapshot: false, problem: remoteError.message + " " + localError.message };
    }
  }
}

async function loadRegistries() {
  if (state.loading) return;
  state.loading = true;
  window.__aegeanVerifierReady = true;
  if (!window.crypto || !window.crypto.subtle) {
    state.loading = false;
    setRuntime("This browser cannot compute SHA-256. Use the command-line verifier below.");
    showError("Web Crypto is not available in this browser, so the certificate cannot be checked here.");
    if (refreshButton) refreshButton.disabled = true;
    return;
  }
  if (submitButton) submitButton.disabled = true;
  if (refreshButton) refreshButton.disabled = true;
  if (idButton) idButton.disabled = true;
  clearError();
  setRuntime("Loading the public register…");
  const outcomes = await Promise.all([
    fetchWithFallback(REGISTER_URL, LOCAL_REGISTER_URL, 1048576, "The public register"),
    fetchWithFallback(TERMS_URL, LOCAL_TERMS_URL, 262144, "The terms registry"),
  ]);
  const problems = [];
  if (outcomes[0].value) {
    try {
      state.register = parseRegister(outcomes[0].value);
      if (idButton) idButton.disabled = false;
    } catch (error) {
      state.register = null;
      problems.push(error.message);
    }
  } else {
    state.register = null;
    problems.push(outcomes[0].problem || "The public register could not be loaded.");
  }
  if (outcomes[1].value) {
    try {
      state.terms = parseTerms(outcomes[1].value);
      state.termTexts.clear();
    } catch (error) {
      state.terms = null;
      problems.push(error.message);
    }
  } else {
    state.terms = null;
    problems.push(outcomes[1].problem || "The terms registry could not be loaded.");
  }
  state.snapshot = outcomes[0].snapshot || outcomes[1].snapshot;
  state.fetchedAt = new Date();
  updateRegisterStatus();
  state.loading = false;
  if (refreshButton) refreshButton.disabled = false;
  if (state.register && state.terms) {
    if (submitButton) submitButton.disabled = false;
    setRuntime(state.snapshot
      ? "Using the bundled register snapshot. Refresh retries the canonical register."
      : "Register ready. Paste a certificate or choose a file.");
    if (state.snapshot) clearError();
  } else {
    setRuntime("Verification is unavailable until the canonical registry loads.");
    showError(Array.from(new Set(problems)).join(" "));
  }
}

async function fetchTermsDocument(entry) {
  if (state.termTexts.has(entry.document)) return state.termTexts.get(entry.document);
  let text;
  try {
    text = await fetchCanonical(TERMS_BASE_URL + entry.document, MAX_TERMS_BYTES, "The agreement text");
  } catch (remoteError) {
    text = await fetchCanonical(LOCAL_TERMS_BASE_URL + entry.document, MAX_TERMS_BYTES, "The agreement text");
  }
  state.termTexts.set(entry.document, text);
  return text;
}

function renderFacts(facts) {
  if (!resultFacts) return;
  const fragment = document.createDocumentFragment();
  facts.forEach(function (fact) {
    const term = document.createElement("dt");
    term.textContent = fact[0];
    const value = document.createElement("dd");
    value.textContent = fact[1] || "—";
    fragment.append(term, value);
  });
  resultFacts.replaceChildren(fragment);
}

function registerSummary(verification) {
  const entry = verification.register_entry;
  if (!entry) return "Not listed in issued.json.";
  if (entry.status === "revoked") {
    return "Revoked" + (entry.revoked_at ? " on " + entry.revoked_at : "") + ".";
  }
  return "Valid entry" + (entry.issued_at ? ", issued " + entry.issued_at : "") + ".";
}

function finishResult(status, summary, reasons, facts, note, title, exportData) {
  if (!resultPanel) return;
  if (resultBadge) {
    resultBadge.textContent = STATUS_LABELS[status] || status;
    resultBadge.className = "verify-badge " + (STATUS_CLASSES[status] || "is-danger");
  }
  if (resultSummary) resultSummary.textContent = summary;
  if (resultReasons) {
    const fragment = document.createDocumentFragment();
    reasons.forEach(function (reason) {
      const item = document.createElement("li");
      item.textContent = reason;
      fragment.append(item);
    });
    resultReasons.replaceChildren(fragment);
  }
  renderFacts(facts);
  if (resultRegister) resultRegister.textContent = note || "";
  if (resultTitle) resultTitle.textContent = title;
  lastExport = exportData;
  if (exportStatus) exportStatus.textContent = "";
  resultPanel.hidden = false;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  resultPanel.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  if (resultTitle) resultTitle.focus({ preventScroll: true });
}

function exportText(exportData) {
  const lines = [
    "AegeanWorks " + (exportData.kind === "certificate" ? "verification result" : "register lookup"),
    "Status: " + (STATUS_LABELS[exportData.status] || exportData.status),
    exportData.summary,
    "",
  ];
  exportData.facts.forEach(function (fact) {
    lines.push(fact[0] + ": " + (fact[1] || "—"));
  });
  if (exportData.note) lines.push("", exportData.note);
  lines.push("", "Checked: " + new Date().toISOString());
  return lines.join("\n");
}

async function copyResult() {
  if (!lastExport) return;
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    if (exportStatus) exportStatus.textContent = "Clipboard access is unavailable; use Download JSON.";
    return;
  }
  try {
    await navigator.clipboard.writeText(exportText(lastExport));
    if (exportStatus) exportStatus.textContent = "Copied to clipboard.";
  } catch (error) {
    if (exportStatus) exportStatus.textContent = "Copy failed; use Download JSON.";
  }
}

function downloadResult() {
  if (!lastExport) return;
  const facts = {};
  lastExport.facts.forEach(function (fact) {
    facts[fact[0]] = fact[1] || "";
  });
  const payload = {
    product: "AegeanWorks",
    format: 1,
    kind: lastExport.kind,
    certificate_id: lastExport.id,
    checked_at: new Date().toISOString(),
    status: lastExport.status,
    summary: lastExport.summary,
    facts,
    note: lastExport.note || "",
    entry: lastExport.entry || null,
    verification: lastExport.verification || null,
  };
  const name = String(lastExport.id || "result").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80);
  const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "aegean-" + lastExport.kind + "-" + (name || "result") + ".json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  if (exportStatus) exportStatus.textContent = "Downloaded a JSON result.";
}

function renderRegisterLookup(entry, id) {
  const status = entry ? (entry.status === "revoked" ? "REVOKED" : "REGISTERED") : "UNREGISTERED";
  const summary = !entry
    ? "No certificate with this ID is listed in the canonical register."
    : entry.status === "revoked"
      ? "The public register lists this certificate ID as revoked. Do not rely on it."
      : "The public register lists this certificate ID as valid. Paste the certificate to verify its digest and contents.";
  const reasons = [
    "A register lookup checks the id and status only; it does not verify a certificate file.",
  ];
  const facts = [
    ["Certificate", id],
    ["Register", !entry ? "Not listed" : entry.status === "revoked" ? "Revoked" : "Valid entry"],
    ["License", entry ? entry.license_type : ""],
    ["Issued", entry ? entry.issued_at : ""],
  ];
  if (entry && entry.status === "revoked") {
    facts.push(["Revoked", entry.revoked_at || "Date not listed"]);
    if (entry.reason) facts.push(["Reason", entry.reason]);
  }
  facts.push(["Digest", entry ? entry.digest : ""]);
  facts.push(["Signature", "Not part of a register lookup."]);
  const note = state.fetchedAt
    ? "Register checked against the canonical issued.json at " + utcClock(state.fetchedAt) + "."
    : "Register checked against the canonical issued.json.";
  finishResult(
    status,
    summary,
    reasons,
    facts,
    note,
    "Register lookup",
    {
      kind: "register",
      id,
      status,
      summary,
      facts,
      note,
      entry: entry || null,
    }
  );
}

async function handleIdLookup() {
  clearError();
  if (!state.register) await loadRegistries();
  if (!state.register) {
    showError("The register is not available, so the id cannot be looked up.");
    return;
  }
  const id = idInput ? idInput.value.trim() : "";
  if (!validCertificateId(id)) {
    showError("Enter a certificate ID using letters, digits, dots, colons, underscores or hyphens.");
    if (idInput) idInput.focus();
    return;
  }
  renderRegisterLookup(lookupRegister(state.register, id), id);
}

function renderResult(verification, certificate, citedTerms) {
  if (!resultPanel) return;
  const status = verification.status;
  const summary = SUMMARY[status] || "The certificate could not be verified.";
  const reasons = verification.reasons.length ? verification.reasons : ["All checks passed."];
  const cert = verification.cert || {};
  const license = [cert.license_type, cert.tier].filter(Boolean).join(" · ");
  const termsState = verification.terms_verified
    ? "Verified against the published agreement."
    : citedTerms
      ? "Cited but not verified."
      : "Not cited by the certificate.";
  const facts = [
    ["Certificate", cert.cert_id],
    ["Licensee", cert.licensee_name],
    ["Contact", cert.licensee_contact],
    ["License", license],
    ["Scope", cert.scope],
    ["Projects", (cert.projects || []).join(", ")],
    ["Allowances", (cert.allowances || []).join(", ")],
    ["Issued", cert.issued_at],
    ["Term", cert.is_perpetual ? "Perpetual" : "Expires " + (cert.expires_at || "")],
    ["Serial", cert.serial],
    ["Register", registerSummary(verification)],
    ["Terms", termsState],
    ["Signature", cert.signature_present
      ? "Present (private HMAC; not checked in the browser)."
      : "Absent."],
  ];
  const note = state.fetchedAt
    ? "Register checked against the canonical issued.json at " + utcClock(state.fetchedAt) + "."
    : "Register checked against the canonical issued.json.";
  finishResult(
    status,
    summary,
    reasons,
    facts,
    note,
    "Verification result",
    {
      kind: "certificate",
      id: cert.cert_id || "certificate",
      status,
      summary,
      facts,
      note,
      verification: {
        registered: verification.registered,
        terms_verified: verification.terms_verified,
        signature_verified: false,
      },
      entry: verification.register_entry || null,
    }
  );
}

async function handleSubmit(event) {
  event.preventDefault();
  clearError();
  clearResult();
  if (!state.register || !state.terms) await loadRegistries();
  if (!state.register || !state.terms) {
    showError("Verification is unavailable while the canonical register or terms registry is offline.");
    return;
  }
  const text = input ? input.value.trim() : "";
  if (!text) {
    showError("Paste a certificate or choose a JSON file first.");
    if (input) input.focus();
    return;
  }
  let certificate;
  try {
    certificate = parseCertificate(text);
  } catch (error) {
    showError(error.message);
    return;
  }
  const citedTerms =
    typeof certificate.terms_digest === "string" && certificate.terms_digest.trim().length > 0;
  let termsText = null;
  if (citedTerms) {
    try {
      const entry = resolveTerms(state.terms, certificate.license_type);
      termsText = await fetchTermsDocument(entry);
    } catch (error) {
      termsText = null;
    }
  }
  let verification;
  try {
    verification = await verifyCertificate({
      certificate,
      register: state.register,
      terms: state.terms,
      termsText,
      project: projectInput ? projectInput.value : "",
    });
  } catch (error) {
    showError("The certificate could not be checked: " + error.message);
    return;
  }
  renderResult(verification, certificate, citedTerms);
}

async function loadCertificateFile(file) {
  if (!file) return;
  clearError();
  clearResult();
  if (file.size > MAX_CERTIFICATE_BYTES) {
    showError("That file is larger than 256 KiB.");
    return;
  }
  try {
    input.value = await file.text();
    setRuntime("Loaded " + file.name + ". Choose Verify certificate.");
  } catch (error) {
    showError("The file could not be read.");
  }
}

if (form) {
  form.addEventListener("submit", handleSubmit);
  if (fileInput) {
    fileInput.addEventListener("change", function () {
      loadCertificateFile(fileInput.files && fileInput.files[0]);
    });
  }
  if (idButton) {
    idButton.addEventListener("click", handleIdLookup);
  }
  if (idInput) {
    idInput.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      handleIdLookup();
    });
  }
  if (copyButton) {
    copyButton.addEventListener("click", copyResult);
  }
  if (downloadButton) {
    downloadButton.addEventListener("click", downloadResult);
  }
  let dragDepth = 0;
  ["dragenter", "dragover"].forEach(function (name) {
    form.addEventListener(name, function (event) {
      if (!event.dataTransfer) return;
      event.preventDefault();
      if (name === "dragenter") dragDepth += 1;
      form.classList.add("is-dragging");
    });
  });
  form.addEventListener("dragleave", function (event) {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) form.classList.remove("is-dragging");
  });
  form.addEventListener("drop", function (event) {
    event.preventDefault();
    dragDepth = 0;
    form.classList.remove("is-dragging");
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) loadCertificateFile(file);
  });
  if (clearButton) {
    clearButton.addEventListener("click", function () {
      if (input) input.value = "";
      if (fileInput) fileInput.value = "";
      if (projectInput) projectInput.value = "";
      if (idInput) idInput.value = "";
      clearError();
      clearResult();
      setRuntime(
        state.register && state.terms
          ? "Register ready. Paste a certificate or choose a file."
          : state.register
            ? "Register ready. Certificate checks need the terms registry; the ID lookup is available."
            : "Verification is unavailable until the canonical registry loads."
      );
      if (input) input.focus();
    });
  }
  if (refreshButton) {
    refreshButton.addEventListener("click", function () {
      clearResult();
      loadRegistries();
    });
  }
  loadRegistries();
} else {
  window.__aegeanVerifierReady = true;
}

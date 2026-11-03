/**
 * Clipboard writing with a legacy fallback, so "copy" also works from a
 * file:// page or any context where the async clipboard is unavailable.
 */

export async function copyText(text, { navigatorRef, documentRef } = {}) {
  const nav = navigatorRef ?? globalThis.navigator;
  const doc = documentRef ?? globalThis.document;
  const value = String(text ?? "");
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(value);
      return true;
    } catch {
      // Denied or unsupported; try the legacy path below.
    }
  }
  if (!doc?.body) return false;
  try {
    const area = doc.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    doc.body.appendChild(area);
    area.select();
    const copied = typeof doc.execCommand === "function" ? doc.execCommand("copy") : false;
    area.remove();
    return Boolean(copied);
  } catch {
    return false;
  }
}

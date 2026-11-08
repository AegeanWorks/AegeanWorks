/**
 * RFC 5545 calendar output for a chosen slot: escaped, folded at 75 octets
 * and terminated with CRLF, with every timestamp written in UTC.
 */

const CRLF = "\r\n";
const encoder = new TextEncoder();

export function icsEscape(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

export function icsStamp(date) {
  const value = date instanceof Date ? date : new Date(date);
  const pad = (number, width = 2) => String(number).padStart(width, "0");
  return (
    `${pad(value.getUTCFullYear(), 4)}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}` +
    `T${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}${pad(value.getUTCSeconds())}Z`
  );
}

export function foldIcsLine(line) {
  const text = String(line ?? "");
  const lines = [];
  let current = "";
  let bytes = 0;
  for (const character of text) {
    const size = encoder.encode(character).length;
    const budget = lines.length === 0 ? 75 : 74;
    if (bytes + size > budget) {
      lines.push(current);
      current = ` ${character}`;
      bytes = 1 + size;
    } else {
      current += character;
      bytes += size;
    }
  }
  if (current || lines.length === 0) lines.push(current);
  return lines.join(CRLF);
}

export function buildIcsCalendar({
  summary,
  description = "",
  startUtc,
  endUtc,
  now = Date.now(),
  uid = null,
}) {
  const stamp = icsStamp(new Date(now));
  const eventUid = uid ?? `meridian-${stamp}-${Math.random().toString(36).slice(2, 10)}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AegeanWorks//Meridian//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${eventUid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsStamp(new Date(startUtc))}`,
    `DTEND:${icsStamp(new Date(endUtc))}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join(CRLF)}${CRLF}`;
}

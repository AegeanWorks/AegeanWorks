/**
 * The IANA zone catalog: the platform's full list when present, a curated
 * fallback when it is not, plus labels and ranked search for the pickers.
 */

const COMMON_ZONE_LIST = [
  "UTC",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Denver",
  "America/Phoenix",
  "America/Mexico_City",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Bogota",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Atlantic/Reykjavik",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Zurich",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Helsinki",
  "Europe/Istanbul",
  "Europe/Kyiv",
  "Europe/Moscow",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Asia/Jerusalem",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Taipei",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Sydney",
  "Australia/Auckland",
];

export const COMMON_ZONES = Object.freeze(COMMON_ZONE_LIST);

const COMMON_ORDER = new Map(COMMON_ZONE_LIST.map((zone, index) => [zone, index]));

function plainZone(zone) {
  return zone.toLowerCase().replace(/_/g, "");
}

function plainLabel(zone) {
  return zoneLabel(zone).toLowerCase().replace(/\s+/g, "");
}

export function allTimeZones() {
  let zones = null;
  if (typeof Intl.supportedValuesOf === "function") {
    const listed = Intl.supportedValuesOf("timeZone");
    if (Array.isArray(listed) && listed.length) zones = listed.slice();
  }
  if (!zones) return COMMON_ZONE_LIST.slice();
  if (!zones.includes("UTC")) zones.unshift("UTC");
  for (const zone of COMMON_ZONE_LIST) {
    if (!zones.includes(zone)) zones.push(zone);
  }
  return zones;
}

export function zoneLabel(zone) {
  if (zone === "UTC") return "UTC";
  return zone.slice(zone.lastIndexOf("/") + 1).replace(/_/g, " ");
}

export function zoneRegion(zone) {
  return zone.includes("/") ? zone.slice(0, zone.indexOf("/")) : "Etc";
}

export function searchZones(query, zones = allTimeZones(), limit = 80) {
  const needle = String(query ?? "").trim().toLowerCase().replace(/[_\s]+/g, "");
  const ranked = zones.map((zone) => {
    if (!needle) return { zone, rank: COMMON_ORDER.get(zone) ?? COMMON_ZONE_LIST.length };
    const plain = plainZone(zone);
    const label = plainLabel(zone);
    if (plain === needle || label === needle) return { zone, rank: 0 };
    if (label.startsWith(needle) || plain.startsWith(needle)) return { zone, rank: 1 };
    if (label.includes(needle) || plain.includes(needle)) return { zone, rank: 2 };
    return { zone, rank: -1 };
  });
  return ranked
    .filter((item) => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.zone.localeCompare(b.zone))
    .slice(0, limit)
    .map((item) => item.zone);
}

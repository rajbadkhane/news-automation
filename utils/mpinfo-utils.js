const crypto = require("crypto");

function normalizeUrl(value, baseUrl) {
  if (!value || String(value).startsWith("javascript:") || String(value).startsWith("#")) {
    return null;
  }

  try {
    return new URL(String(value).replace(/&amp;/g, "&"), baseUrl).href;
  } catch {
    return null;
  }
}

function getQueryParam(url, key) {
  try {
    return new URL(url).searchParams.get(key);
  } catch {
    return null;
  }
}

function cleanHindiText(value = "") {
  return String(value)
    .replace(/\{\{[^}]+\}\}/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanHtml(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/\s(?:class|style|onclick|onload)="[^"]*"/gi, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNewsId(url) {
  return getQueryParam(url, "newsid") || getQueryParam(url, "NewsID") || getQueryParam(url, "id");
}

function createArticleHash({ title = "", publishDate = "", district = "", contentText = "", sourceUrl = "" }) {
  const stableText = [title, publishDate, district, sourceUrl, contentText.slice(0, 2000)]
    .map(cleanHindiText)
    .join("|")
    .toLowerCase();
  return crypto.createHash("sha256").update(stableText).digest("hex").slice(0, 32);
}

function detectDistrictFromHostname(hostname = "") {
  return String(hostname)
    .split(".")[0]
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isMeaningfulImageUrl(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || !/^https?:\/\//.test(normalized)) {
    return false;
  }

  return !(
    /tn-250921125347\.jpg|logo|icon|sprite|avatar|banner|placeholder|default|fallback|attention|qrcode|qr-code|wechat|weibo|follow|subscribe|rhs|promo|sponsor|newsletter|subscription|facebook|twitter|instagram|youtube|whatsapp|vaccination|mahaabhiyan|abhiyan|\.svg(?:\?|$)/i.test(normalized) ||
    /(?:^|[/?&_.-])(?:ads?|advert|advertisement|advertorial)(?:[/?&_.=-]|$)/i.test(normalized)
  );
}

function resolveImageUrl(value, baseUrl) {
  const resolved = normalizeUrl(value, baseUrl);
  return isMeaningfulImageUrl(resolved) ? resolved : null;
}

function normalizePublishDate(value, sourceUrl = "") {
  const raw = cleanHindiText(value);
  const pubdate = getQueryParam(sourceUrl, "pubdate");
  const candidate = raw || pubdate || "";

  if (!candidate) {
    return null;
  }

  const monthMap = {
    january: 0,
    jan: 0,
    "जनवरी": 0,
    february: 1,
    feb: 1,
    "फरवरी": 1,
    march: 2,
    mar: 2,
    "मार्च": 2,
    april: 3,
    apr: 3,
    "अप्रैल": 3,
    may: 4,
    "मई": 4,
    june: 5,
    jun: 5,
    "जून": 5,
    july: 6,
    jul: 6,
    "जुलाई": 6,
    august: 7,
    aug: 7,
    "अगस्त": 7,
    september: 8,
    sep: 8,
    sept: 8,
    "सितंबर": 8,
    "सितम्बर": 8,
    october: 9,
    oct: 9,
    "अक्टूबर": 9,
    november: 10,
    nov: 10,
    "नवंबर": 10,
    "नवम्बर": 10,
    december: 11,
    dec: 11,
    "दिसंबर": 11,
    "दिसम्बर": 11,
  };

  const namedMonthMatch = candidate.match(
    /([A-Za-z\u0900-\u097F]+)\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/i
  );
  if (namedMonthMatch) {
    const [, monthName, dayValue, yearValue, hourValue = "0", minuteValue = "0"] = namedMonthMatch;
    const monthIndex = monthMap[monthName.toLowerCase()] ?? monthMap[monthName];
    if (Number.isInteger(monthIndex)) {
      const utcMs = Date.UTC(
        Number.parseInt(yearValue, 10),
        monthIndex,
        Number.parseInt(dayValue, 10),
        Number.parseInt(hourValue, 10),
        Number.parseInt(minuteValue, 10)
      ) - (candidate.toLowerCase().includes("ist") ? 330 * 60 * 1000 : 0);
      return new Date(utcMs).toISOString();
    }
  }

  const slashMatch = candidate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const [, monthOrDay, dayOrMonth, year] = slashMatch;
    const first = Number.parseInt(monthOrDay, 10);
    const second = Number.parseInt(dayOrMonth, 10);
    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;
    return new Date(Date.UTC(Number(year), month - 1, day)).toISOString();
  }

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? candidate : parsed.toISOString();
}

function uniqueBy(items, selector) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = selector(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

module.exports = {
  cleanHindiText,
  cleanHtml,
  createArticleHash,
  detectDistrictFromHostname,
  extractNewsId,
  getQueryParam,
  isMeaningfulImageUrl,
  normalizePublishDate,
  normalizeUrl,
  resolveImageUrl,
  uniqueBy,
};

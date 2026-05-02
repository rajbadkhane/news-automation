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

  return !/tn-250921125347\.jpg|logo|icon|sprite|avatar|banner|advert|placeholder|default|facebook|twitter|instagram|youtube|whatsapp|vaccination|mahaabhiyan|abhiyan|\.svg(?:\?|$)/i.test(normalized);
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

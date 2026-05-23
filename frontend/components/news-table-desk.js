"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { unicodeToChanakya } from "@/lib/chanakya-converter";
import { unicodeTo4CGandhi } from "@/lib/gandhi-converter";
import { unicodeToKrutidev } from "@/lib/krutidev-converter";

const CACHE_KEY = "gts-news-table-cache-v2";
const CACHE_TTL_MS = 20 * 1000;
const REFRESH_INTERVAL_MS = 20 * 1000;
const INITIAL_LOAD_MAX_WAIT_MS = 12000;
const REQUEST_TIMEOUT_MS = 60000;
const TABLE_RECORD_LIMIT = 500;
const DEFAULT_PAGE_SIZE = 25;
const TOI_LEFT_CROP_RATIO = 103 / 1280;
const SECTION_CONFIG = {
  news: {
    label: "News",
    pagePath: "/news-table",
    listPath: `/delivery/news/grouped?language=hindi&limit=${TABLE_RECORD_LIMIT}`,
    syncPath: "/sync/cliff-news?limit=200&language=ENGLISH&rewrite=true",
  },
  editorial: {
    label: "Editorial",
    pagePath: "/editorial",
    listPath: "/editorial/grouped?limit=15",
    syncPath: "/sync/editorial?limit=15",
  },
  rashifal: {
    label: "Rashifal",
    pagePath: "/rashifal",
    listPath: "/rashifal/grouped?limit=50",
    syncPath: "/sync/rashifal?limit=50",
  },
};
const HEADER_FEATURES = [
  { label: "FAST", symbol: "◷" },
  { label: "ACCURATE", symbol: "✓" },
  { label: "IMPARTIAL", symbol: "⚖" },
  { label: "GLOBAL", symbol: "◎" },
];

const GOOGLE_TRANSLATE_ELEMENT_ID = "google_translate_element";
const GOOGLE_TRANSLATE_SCRIPT_ID = "google-translate-script";
const TRANSLATE_LANGUAGES = [
  { code: "hi", label: "Hindi" },
  { code: "en", label: "English" },
  { code: "ur", label: "Urdu" },
  { code: "pa", label: "Punjabi" },
  { code: "mr", label: "Marathi" },
  { code: "bn", label: "Bangla" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "kn", label: "Kannada" },
];
const TRANSLATE_LANGUAGE_CODES = new Set(TRANSLATE_LANGUAGES.map((language) => language.code));

function createEmptyPayload() {
  return {
    status: "Loading",
    count: 0,
    category_count: 0,
    grouped_records: [],
    loaded_at: new Date().toISOString(),
  };
}

function hasPayloadRecords(payload) {
  return (payload?.grouped_records || []).some((group) => (group.records || []).length > 0);
}

function getGoogleTranslateCombo() {
  if (typeof document === "undefined") {
    return null;
  }

  return document.querySelector(".goog-te-combo");
}

function clearGoogleTranslateCookie() {
  if (typeof document === "undefined") {
    return;
  }

  const host = window.location.hostname;
  const pathname = window.location.pathname || "/";
  const hostParts = host ? host.split(".").filter(Boolean) : [];
  const domainCandidates = new Set();
  if (host) {
    domainCandidates.add(host);
    domainCandidates.add(`.${host}`);
  }
  if (hostParts.length > 2) {
    for (let index = 1; index < hostParts.length - 1; index += 1) {
      const parentDomain = hostParts.slice(index).join(".");
      domainCandidates.add(parentDomain);
      domainCandidates.add(`.${parentDomain}`);
    }
  }
  const paths = Array.from(new Set(["/", pathname]));
  paths.forEach((path) => {
    document.cookie = `googtrans=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}`;
    domainCandidates.forEach((domain) => {
      document.cookie = `googtrans=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; domain=${domain}`;
    });
  });

  [window.localStorage, window.sessionStorage].forEach((storage) => {
    try {
      Object.keys(storage)
        .filter((key) => /goog|translate|googtrans/i.test(key))
        .forEach((key) => storage.removeItem(key));
    } catch {
      // Storage cleanup is best-effort; cookie reset is the important part.
    }
  });
}

function writeGoogleTranslateCookie(languageCode) {
  if (typeof document === "undefined") {
    return;
  }

  if (languageCode === "hi") {
    clearGoogleTranslateCookie();
    return;
  }

  const value = `/hi/${languageCode}`;
  const host = window.location.hostname;
  document.cookie = `googtrans=${value}; path=/`;
  if (host) {
    document.cookie = `googtrans=${value}; path=/; domain=${host}`;
  }
}

function applyGoogleTranslateLanguage(languageCode) {
  if (!TRANSLATE_LANGUAGE_CODES.has(languageCode)) {
    return false;
  }

  if (languageCode === "hi") {
    clearGoogleTranslateCookie();
    return true;
  }

  writeGoogleTranslateCookie(languageCode);
  const combo = getGoogleTranslateCombo();
  if (!combo) {
    return false;
  }

  if (combo.value !== languageCode) {
    combo.value = languageCode;
  }
  combo.dispatchEvent(new Event("change"));
  return true;
}

function resetGoogleTranslateToHindi({ reload = false } = {}) {
  clearGoogleTranslateCookie();
  try {
    window.sessionStorage.setItem("gts-force-hindi-reset", "1");
  } catch {
    // Reset still works without session storage.
  }

  if (reload && typeof window !== "undefined") {
    window.setTimeout(() => {
      window.location.replace(window.location.href);
    }, 80);
  }
}

function GoogleTranslateControl({ value, onChange, compact = false }) {
  return (
    <label
      className={`flex items-center gap-2 rounded border border-[#b8c4d2] bg-white text-[#14243a] shadow-sm ${compact ? "min-w-[205px] px-2 py-1 text-xs" : "min-w-[235px] px-3 py-2 text-sm"}`}
      title="Translate table and preview with Google Translate"
    >
      <span className={`${compact ? "h-6 w-6" : "h-7 w-7"} flex shrink-0 items-center justify-center rounded border border-[#d8e0e8] bg-[#f4f7fb] text-[#1f5f95]`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-4 w-4">
          <path
            d="M4 5h9M8.5 3v2M11.5 5c-.6 2.5-2.1 4.8-4.5 6.9M6 8.5c1.2 1.7 2.7 3 4.5 4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path
            d="M13 19h7M14.2 19l2.9-7h1.1l2.9 7M15.2 16.5h4.8"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </span>
      <span className="font-bold">भाषा चुनें</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-white text-sm font-bold text-[#14243a] outline-none"
      >
        {TRANSLATE_LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function GoogleTranslateRuntime() {
  return (
    <>
      <div id={GOOGLE_TRANSLATE_ELEMENT_ID} className="news-google-translate-host" aria-hidden="true" />
      <style jsx global>{`
        .news-google-translate-host {
          position: absolute;
          left: -9999px;
          top: 0;
          height: 0;
          width: 0;
          overflow: hidden;
        }

        .goog-te-banner-frame,
        .goog-te-banner-frame.skiptranslate,
        .VIpgJd-ZVi9od-ORHb-OEVmcd {
          display: none !important;
        }

        body {
          top: 0 !important;
        }
      `}</style>
    </>
  );
}

function NewsTableLoadingScreen({ progress = 1, label = "News" }) {
  const safeProgress = Math.min(100, Math.max(1, Math.round(progress)));

  return (
    <div className="flex min-h-[calc(100vh-126px)] items-center justify-center bg-[#f5f7fb] px-4 py-12">
      <section className="w-full max-w-[520px] rounded-lg border border-[#cfd8e3] bg-white p-6 text-center shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#1f5f95]">Loading {label}</p>
        <h2 className="mt-3 text-2xl font-black text-[#14243a]">News table is preparing</h2>
        <div className="mt-6 overflow-hidden rounded-md border border-[#b8c4d2] bg-[#eef3f8]">
          <div
            className="h-4 rounded-md bg-gradient-to-r from-[#1f70bd] via-[#2f9e44] to-[#d00019] transition-all duration-300"
            style={{ width: `${safeProgress}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-sm font-bold text-[#334155]">
          <span>Fetching latest feed</span>
          <span>{safeProgress}%</span>
        </div>
      </section>
    </div>
  );
}

function getDashboardProxyPath(path) {
  const normalized = String(path || "").startsWith("/") ? path : `/${path}`;
  return `/api/dashboard${normalized}`;
}

async function fetchWithTimeout(resource, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

function getDisplayImageUrl(imageUrl, quality = "high") {
  if (!imageUrl) {
    return "";
  }

  return `${getDashboardProxyPath("/image-proxy")}?url=${encodeURIComponent(imageUrl)}&quality=${encodeURIComponent(quality)}`;
}

function isUsableImageUrl(imageUrl) {
  const value = String(imageUrl || "").trim();
  return /^https?:\/\//i.test(value);
}

function isRenderableImageSrc(imageSrc) {
  const value = String(imageSrc || "").trim();
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

function isTimesOfIndiaSource(item) {
  const sourceText = [
    item?.feed_source,
    item?.feed_url,
    item?.source_url,
    item?.source,
    item?.image_link,
    item?.image_source,
    item?.raw_articles?.source_url,
    item?.raw_articles?.feed_source,
    item?.raw_articles?.image_link,
    item?.media?.source_url,
    item?.media?.image_link,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /timesofindia\.indiatimes\.com|(?:^|[^\w])toi(?:[^\w]|$)|times\s+of\s+india|toiimg\.com|timescontent\.com/.test(sourceText);
}

function cleanText(value) {
  return String(value || "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatTime(value) {
  if (!value) {
    return "-";
  }

  try {
    return new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));
  } catch {
    return "-";
  }
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function formatUploadAge(value, nowMs = Date.now()) {
  if (!value) {
    return "-";
  }

  const uploadedAt = new Date(value).getTime();
  if (Number.isNaN(uploadedAt)) {
    return "-";
  }

  const diffMinutes = Math.max(0, Math.floor((nowMs - uploadedAt) / 60000));
  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function getRecordTime(record) {
  const timestamp = new Date(record?.fetched_at || record?.published_at || record?.updated_at || 0).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getRecordId(record) {
  return Number(record?.rewrite_id || record?.id || 0) || 0;
}

function sortNewestFirst(records) {
  return [...records].sort((left, right) => {
    const timeDiff = getRecordTime(right) - getRecordTime(left);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return getRecordId(right) - getRecordId(left);
  });
}

function stripPhotoCaption(value) {
  return cleanText(value).replace(
    /(?:^|\n+)\s*(?:photo\s*caption|image\s*caption|caption|फोटो\s*कैप्शन|इमेज\s*कैप्शन|चित्र\s*कैप्शन)\s*[:：-]\s*[\s\S]*$/i,
    ""
  ).trim();
}

function extractPhotoCaption(value) {
  const text = cleanText(value);
  const match = text.match(
    /(?:^|\n+)\s*(?:photo\s*caption|image\s*caption|caption|फोटो\s*कैप्शन|इमेज\s*कैप्शन|चित्र\s*कैप्शन)\s*[:：-]\s*([\s\S]*)$/i
  );

  return cleanText(match?.[1] || "");
}

function getImageCaption(record, articleTexts) {
  const directCaption = cleanText(
    record.image_caption ||
      record.photo_caption ||
      record.caption ||
      record.media?.image_caption ||
      record.media?.photo_caption ||
      record.media?.caption ||
      record.raw_articles?.image_caption ||
      record.raw_articles?.photo_caption ||
      record.raw_articles?.caption ||
      record.ui_hindi?.image_caption ||
      record.ui_hindi?.photo_caption ||
      record.ui_hindi?.caption
  );

  if (directCaption) {
    return directCaption;
  }

  return extractPhotoCaption(articleTexts.short_100) ||
    extractPhotoCaption(articleTexts.medium_300) ||
    extractPhotoCaption(articleTexts.long_500);
}

function flattenPayload(payload, section = "news") {
  const records = (payload?.grouped_records || []).flatMap((group) =>
    (group.records || []).map((record) => {
      const articleTexts = {
        short_100: cleanText(record.raw_articles?.words_100 || record.ui_hindi?.short_100 || record.summary),
        medium_300: cleanText(record.raw_articles?.words_300 || record.ui_hindi?.medium_300 || record.summary),
        long_500: cleanText(
          record.raw_articles?.words_600 ||
            record.raw_articles?.words_500 ||
            record.ui_hindi?.long_500 ||
            record.article ||
            record.summary
        ),
      };

      return {
        ...record,
        section,
        fetched_at: record.fetched_at || record.published_at || record.updated_at || payload?.loaded_at || null,
        category: record.category || group.category || "uncategorized",
        title: record.ui_hindi?.title || record.title || "Untitled story",
        state: record.ui_hindi?.state || record.state || "राष्ट्रीय",
        district:
          record.ui_hindi?.district ||
          record.ui_hindi?.district_name ||
          record.district ||
          "",
        image_caption: getImageCaption(record, articleTexts),
        short_100: stripPhotoCaption(articleTexts.short_100),
        medium_300: stripPhotoCaption(articleTexts.medium_300),
        long_500: stripPhotoCaption(articleTexts.long_500),
      };
    })
  );

  return sortNewestFirst(records);
}

function uniqueValues(records, selector) {
  return Array.from(new Set(records.map(selector).filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

function truncate(value, size) {
  const text = cleanText(value);
  if (text.length <= size) {
    return text;
  }

  return `${text.slice(0, size).trim()}...`;
}

function splitPreviewParagraphs(value) {
  const text = cleanText(value);

  if (!text) {
    return [];
  }

  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function getSectionCacheKey(section, variant = "default") {
  return `${CACHE_KEY}:${section}:${variant}`;
}

function readSectionCache(section, variant = "default") {
  try {
    const raw = window.localStorage.getItem(getSectionCacheKey(section, variant));
    if (!raw) {
      return null;
    }

    const cached = JSON.parse(raw);
    if (!cached?.payload || Date.now() - cached.savedAt > CACHE_TTL_MS) {
      return null;
    }

    return cached;
  } catch {
    return null;
  }
}

function writeSectionCache(section, payload, variant = "default") {
  try {
    window.localStorage.setItem(
      getSectionCacheKey(section, variant),
      JSON.stringify({
        payload,
        savedAt: Date.now(),
      })
    );
  } catch {
    // Storage can be full or disabled. The UI still works from live data.
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getRenderedText(ref) {
  return cleanText(ref?.current?.innerText || ref?.current?.textContent || "");
}

async function getUnicodeCopyValue(text, translateLanguage, translatedTextRef) {
  const originalValue = cleanText(text);
  if (translateLanguage === "hi") {
    return originalValue;
  }

  applyGoogleTranslateLanguage(translateLanguage);
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const renderedValue = getRenderedText(translatedTextRef);
    if (renderedValue && renderedValue !== originalValue) {
      return renderedValue;
    }

    await delay(160);
  }

  return getRenderedText(translatedTextRef) || originalValue;
}

async function copyText(text, setMessage, options = {}) {
  const value = cleanText(options.value || text);
  if (!value) {
    setMessage("Copy ke liye content available nahi hai.");
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    setMessage("Copied");
    return true;
  } catch {
    setMessage("Clipboard permission nahi mili.");
    return false;
  }
}

async function copyChanakyaText(text, setMessage) {
  const value = cleanText(text);
  if (!value) {
    setMessage("Chanakya copy ke liye content available nahi hai.");
    return false;
  }

  try {
    await navigator.clipboard.writeText(unicodeToChanakya(value, { useFixedKraGlyph: true }));
    setMessage("Chanakya text copied");
    return true;
  } catch {
    setMessage("Clipboard permission nahi mili.");
    return false;
  }
}

async function copyKrutidevText(text, setMessage) {
  const value = cleanText(text);
  if (!value) {
    setMessage("Krutidev copy ke liye content available nahi hai.");
    return false;
  }

  try {
    await navigator.clipboard.writeText(unicodeToKrutidev(value));
    setMessage("Krutidev text copied");
    return true;
  } catch {
    setMessage("Clipboard permission nahi mili.");
    return false;
  }
}

async function copyGandhiText(text, setMessage) {
  const value = cleanText(text);
  if (!value) {
    setMessage("4cGandhi copy ke liye content available nahi hai.");
    return false;
  }

  try {
    await navigator.clipboard.writeText(unicodeTo4CGandhi(value));
    setMessage("4cGandhi text copied");
    return true;
  } catch {
    setMessage("Clipboard permission nahi mili.");
    return false;
  }
}

function useCopyButtonFeedback() {
  const [copiedKey, setCopiedKey] = useState("");

  useEffect(() => {
    if (!copiedKey) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setCopiedKey(""), 1000);
    return () => window.clearTimeout(timeout);
  }, [copiedKey]);

  return [copiedKey, setCopiedKey];
}

function CopyActions({ text, setMessage, translateLanguage = "hi" }) {
  const [copiedKey, setCopiedKey] = useCopyButtonFeedback();
  const translatedTextRef = useRef(null);

  async function handleCopy(event, key, copyAction) {
    event.stopPropagation();
    const unicodeValue = key === "copy"
      ? await getUnicodeCopyValue(text, translateLanguage, translatedTextRef)
      : "";
    const copied = await copyAction(text, setMessage, { value: unicodeValue });
    if (copied) {
      setCopiedKey(key);
    }
  }

  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-1">
      <button
        type="button"
        onClick={(event) => void handleCopy(event, "copy", copyText)}
        className="w-full min-w-0 truncate rounded border border-[#b8c4d2] bg-white px-1.5 py-1 text-xs font-semibold text-[#26384c] hover:bg-[#edf6ff]"
        title="Copy normal Unicode text"
      >
        {copiedKey === "copy" ? "Copied" : "Copy in Unicode"}
      </button>
      <button
        type="button"
        onClick={(event) => void handleCopy(event, "chanakya", copyChanakyaText)}
        className="w-full min-w-0 truncate rounded border border-[#b68b35] bg-[#fff8e8] px-1.5 py-1 text-xs font-semibold text-[#7a4f00] hover:bg-[#ffefc2]"
        title="Copy converted Chanakya font text"
      >
        {copiedKey === "chanakya" ? "Copied" : "Copy in Chanakya"}
      </button>
      <button
        type="button"
        onClick={(event) => void handleCopy(event, "krutidev", copyKrutidevText)}
        className="w-full min-w-0 truncate rounded border border-[#7857b8] bg-[#f6f1ff] px-1.5 py-1 text-xs font-semibold text-[#4e2c83] hover:bg-[#ede2ff]"
        title="Copy converted Krutidev font text"
      >
        {copiedKey === "krutidev" ? "Copied" : "Copy in Krutidev"}
      </button>
      <button
        type="button"
        onClick={(event) => void handleCopy(event, "gandhi", copyGandhiText)}
        className="w-full min-w-0 truncate rounded border border-[#24845b] bg-[#effbf5] px-1.5 py-1 text-xs font-semibold text-[#176340] hover:bg-[#ddf7ea]"
        title="Copy converted 4cGandhi font text"
      >
        {copiedKey === "gandhi" ? "Copied" : "Copy in 4cGandhi"}
      </button>
      <span
        ref={translatedTextRef}
        className="pointer-events-none absolute -left-[9999px] top-auto h-px w-px overflow-hidden whitespace-pre-wrap"
        aria-hidden="true"
      >
        {text}
      </span>
    </div>
  );
}

function PreviewModal({ preview, onClose, setPreview, setMessage, translateLanguage, onTranslateLanguageChange }) {
  const activeText = preview?.active === "caption"
    ? preview.item.image_caption
    : preview?.active === "300"
    ? preview.item.medium_300
    : preview?.active === "600"
      ? preview.item.long_500
      : preview?.item.short_100;
  const paragraphs = splitPreviewParagraphs(activeText);
  const options = [
    { key: "caption", label: "Image Caption", text: preview?.item.image_caption },
    { key: "100", label: "100 Words", text: preview?.item.short_100 },
    { key: "300", label: "300 Words", text: preview?.item.medium_300 },
    { key: "600", label: "600 Words", text: preview?.item.long_500 },
  ];
  const [copiedKey, setCopiedKey] = useCopyButtonFeedback();
  const translatedTextRef = useRef(null);

  async function handleModalCopy(key, copyAction) {
    const unicodeValue = key === "copy"
      ? await getUnicodeCopyValue(activeText, translateLanguage, translatedTextRef)
      : "";
    const copied = await copyAction(activeText, setMessage, { value: unicodeValue });
    if (copied) {
      setCopiedKey(key);
    }
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    if (!preview?.item || translateLanguage === "hi") {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      applyGoogleTranslateLanguage(translateLanguage);
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [preview?.active, preview?.item, translateLanguage]);

  if (!preview?.item) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/55 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="News preview"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="max-h-[92vh] w-full overflow-hidden rounded-t-2xl border border-[#cbd7e3] bg-white shadow-[0_24px_90px_rgba(8,21,34,0.35)] sm:mx-auto sm:max-w-4xl sm:rounded-2xl">
        <header className="border-b border-[#dfe6ee] bg-[#f4f7fa] px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#337ab7]">
                {preview.active === "caption" ? "Image Caption Preview" : `${preview.active} Words Preview`}
              </p>
              <h2 className="mt-2 text-lg font-bold leading-7 text-[#123b61] sm:text-xl">
                {preview.item.title || "Untitled story"}
              </h2>
              <p className="mt-1 text-xs text-[#687789]">
                {preview.item.category || "-"} | {formatDate(preview.item.fetched_at)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#b8c4d2] bg-white text-xl font-bold leading-none text-[#26384c] hover:bg-[#edf6ff]"
              aria-label="Close preview"
            >
              x
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <GoogleTranslateControl
              value={translateLanguage}
              onChange={onTranslateLanguageChange}
              compact
            />
            {options.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPreview((current) => ({ ...current, active: option.key }))}
                className={`rounded-full border px-4 py-2 text-xs font-bold ${preview.active === option.key ? "border-[#23527c] bg-[#337ab7] text-white" : "border-[#b8c4d2] bg-white text-[#26384c] hover:bg-[#edf6ff]"}`}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void handleModalCopy("copy", copyText)}
              className="rounded-full border border-[#b8c4d2] bg-white px-4 py-2 text-xs font-bold text-[#26384c] hover:bg-[#edf6ff]"
            >
              {copiedKey === "copy" ? "Copied" : "Copy in Unicode"}
            </button>
            <button
              type="button"
              onClick={() => void handleModalCopy("chanakya", copyChanakyaText)}
              className="rounded-full border border-[#b68b35] bg-[#fff8e8] px-4 py-2 text-xs font-bold text-[#7a4f00] hover:bg-[#ffefc2]"
            >
              {copiedKey === "chanakya" ? "Copied" : "Copy in Chanakya"}
            </button>
            <button
              type="button"
              onClick={() => void handleModalCopy("krutidev", copyKrutidevText)}
              className="rounded-full border border-[#7857b8] bg-[#f6f1ff] px-4 py-2 text-xs font-bold text-[#4e2c83] hover:bg-[#ede2ff]"
            >
              {copiedKey === "krutidev" ? "Copied" : "Copy in Krutidev"}
            </button>
            <button
              type="button"
              onClick={() => void handleModalCopy("gandhi", copyGandhiText)}
              className="rounded-full border border-[#24845b] bg-[#effbf5] px-4 py-2 text-xs font-bold text-[#176340] hover:bg-[#ddf7ea]"
            >
              {copiedKey === "gandhi" ? "Copied" : "Copy in 4cGandhi"}
            </button>
          </div>
        </header>

        <div className="max-h-[62vh] overflow-y-auto px-4 py-5 sm:px-6">
          <span
            ref={translatedTextRef}
            className="pointer-events-none absolute -left-[9999px] top-auto h-px w-px overflow-hidden whitespace-pre-wrap"
            aria-hidden="true"
          >
            {activeText}
          </span>
          {paragraphs.length ? (
            <div className="space-y-4 text-[16px] leading-8 text-[#17293b]">
              {paragraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-[#dfe6ee] bg-[#f8fafc] px-4 py-5 text-center text-sm text-[#6b7280]">
              Preview content available nahi hai.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function PreviewTextCell({ item, type, text, previewSize, setPreview, setMessage, translateLanguage }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setPreview({ item, active: type });
        }}
        className="min-h-[40px] w-full min-w-0 text-left leading-5 text-[#17293b] hover:text-[#0d6efd] hover:underline"
        title={`Open ${type} words preview`}
      >
        {truncate(text, previewSize)}
      </button>
      <div className="grid w-full min-w-0 grid-cols-2 gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setPreview({ item, active: type });
          }}
          className="col-span-2 w-full rounded border border-[#337ab7] bg-[#edf6ff] px-1.5 py-1 text-xs font-semibold text-[#1f5f95] hover:bg-[#dff0ff]"
        >
          Preview/पूरी खबर पढ़ें
        </button>
        <div className="col-span-2">
          <CopyActions text={text} setMessage={setMessage} translateLanguage={translateLanguage} />
        </div>
      </div>
    </div>
  );
}

async function downloadImage(item, setMessage) {
  if (!isUsableImageUrl(item.image_link)) {
    setMessage("Image available nahi hai.");
    return;
  }

  try {
    const response = await fetch(getDisplayImageUrl(item.image_link, "original"));
    if (!response.ok) {
      throw new Error(`Image request failed with ${response.status}`);
    }

    const blob = await response.blob();
    const downloadBlob = isTimesOfIndiaSource(item) ? await cropImageBlobFromLeft(blob, TOI_LEFT_CROP_RATIO) : blob;
    const url = URL.createObjectURL(downloadBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `news-${item.id || "image"}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage("Image download started");
  } catch {
    setMessage("Image download nahi ho paya.");
  }
}

async function cropImageBlobFromLeft(blob, cropRatio) {
  const image = await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const probe = new Image();
    probe.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(probe);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image crop failed"));
    };
    probe.src = objectUrl;
  });

  const cropLeft = Math.max(0, Math.min(image.naturalWidth - 1, Math.round(image.naturalWidth * cropRatio)));
  const croppedWidth = image.naturalWidth - cropLeft;
  const canvas = document.createElement("canvas");
  canvas.width = croppedWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return blob;
  }

  context.drawImage(
    image,
    cropLeft,
    0,
    croppedWidth,
    image.naturalHeight,
    0,
    0,
    croppedWidth,
    image.naturalHeight
  );

  return await new Promise((resolve) => {
    canvas.toBlob((croppedBlob) => resolve(croppedBlob || blob), blob.type || "image/jpeg", 0.92);
  });
}

function ImageCell({ item, setMessage }) {
  const hasImage = isUsableImageUrl(item.image_link);
  const proxyImageSrc = hasImage ? getDisplayImageUrl(item.image_link) : "";
  const shouldCropLeft = isTimesOfIndiaSource(item);
  const [imageSrc, setImageSrc] = useState(proxyImageSrc);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasImage) {
      setImageSrc("");
      setFailed(false);
      return undefined;
    }

    let cancelled = false;
    const loadImage = (src) => new Promise((resolve, reject) => {
      const probe = new Image();
      probe.referrerPolicy = "no-referrer";
      probe.onload = () => resolve(src);
      probe.onerror = reject;
      probe.src = src;
    });

    setFailed(false);
    setImageSrc(proxyImageSrc);

    loadImage(proxyImageSrc)
      .then((src) => {
        if (!cancelled) {
          setImageSrc(src);
        }
      })
      .catch(() => loadImage(item.image_link)
        .then((src) => {
          if (!cancelled) {
            setImageSrc(src);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setFailed(true);
          }
        }));

    return () => {
      cancelled = true;
    };
  }, [hasImage, item.image_link, proxyImageSrc]);

  if (!hasImage || failed || !isRenderableImageSrc(imageSrc)) {
    return (
      <div className="flex h-[86px] w-[126px] items-center justify-center rounded border border-[#d6dde6] bg-[#f3f6f9] px-2 text-center text-xs text-[#6b7280]">
        {hasImage && !failed ? "Loading" : "No image"}
      </div>
    );
  }

  return (
    <div className="flex w-[138px] flex-col items-center gap-1">
      <div
        className="h-[86px] w-[126px] overflow-hidden rounded border border-[#cfd8e3] bg-[#eef2f7] shadow-sm"
        title="Image preview"
        onContextMenu={(event) => {
          event.preventDefault();
        }}
      >
        <img
          src={imageSrc}
          alt={item.title || "News image"}
          className={`pointer-events-none h-full select-none object-cover ${shouldCropLeft ? "max-w-none" : "w-full"}`}
          style={shouldCropLeft ? {
            width: `${100 / (1 - TOI_LEFT_CROP_RATIO)}%`,
            transform: `translateX(-${TOI_LEFT_CROP_RATIO * 100}%)`,
          } : undefined}
          draggable={false}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            if (imageSrc !== item.image_link) {
              setImageSrc(item.image_link);
              return;
            }

            setFailed(true);
          }}
        />
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void downloadImage(item, setMessage);
        }}
        className="rounded border border-[#b8c4d2] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#245985] hover:border-[#337ab7] hover:bg-[#edf6ff]"
      >
        Download
      </button>
    </div>
  );
}

function NewsTableHeader({ activeSection }) {
  return (
    <header className="border-b border-[#d7dde6] bg-white">
      <div className="relative overflow-hidden bg-[#030a18] text-white">
        <div className="absolute inset-0 opacity-70">
          <div className="absolute left-[38%] top-0 h-full w-[36%] bg-[radial-gradient(circle_at_center,rgba(28,84,142,0.42),transparent_58%)]" />
          <div className="absolute inset-y-0 right-0 w-[45%] bg-[linear-gradient(115deg,transparent_0%,rgba(10,24,49,0.2)_34%,rgba(189,14,27,0.22)_35%,transparent_36%,transparent_58%,rgba(189,14,27,0.18)_59%,transparent_60%)]" />
          <div className="absolute left-[42%] top-4 h-24 w-72 rounded-full border border-[#18355d] opacity-45" />
          <div className="absolute left-[44%] top-7 h-14 w-[430px] bg-[radial-gradient(circle,#234c82_1px,transparent_1px)] [background-size:9px_9px] opacity-35" />
        </div>

        <div className="relative flex min-h-[118px] flex-col gap-5 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <img
              src="/images/logo.png"
              alt="Gautam Enterprises"
              className="h-[76px] w-[76px] shrink-0 object-contain"
            />
            <div className="min-w-0">
              <div className="flex flex-col gap-1 md:flex-row md:items-end md:gap-5">
                <div>
                  <p className="font-serif text-[28px] font-bold uppercase leading-none tracking-[0.09em] text-white md:text-[34px]">
                    Gautam
                  </p>
                  <p className="mt-1 border-y border-[#d01f2f] py-1 font-serif text-[18px] uppercase leading-none tracking-[0.18em] text-white md:text-[22px]">
                    Enterprises
                  </p>
                </div>
                <div className="hidden h-16 w-px bg-white/30 md:block" />
                <div>
                  <p className="text-[36px] font-black uppercase leading-none tracking-[0.11em] text-[#e31324] md:text-[44px]">
                    Gen-H
                  </p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-white/80">
                    A wired news agency
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.42em] text-white/75">
                Fast . Accurate . Impartial . Global
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:items-end">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {HEADER_FEATURES.map((item) => (
                <div key={item.label} className="flex items-center gap-2 border-l border-[#c61c2a]/55 pl-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/45 text-lg text-white/90">
                    {item.symbol}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-[0.08em] text-white/90">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex flex-wrap gap-2" aria-label="News sections">
          {Object.entries(SECTION_CONFIG).map(([key, item]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (key === activeSection) {
                  return;
                }

                window.location.href = item.pagePath;
              }}
              className={`rounded border px-4 py-2 text-sm font-bold shadow-sm ${activeSection === key ? "border-[#b30e1c] bg-[#c91522] text-white" : "border-[#cfd8e3] bg-white text-[#14243a] hover:bg-[#f4f7fb]"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {activeSection === "news" ? (
            <form action="/news-table/logout" method="POST">
              <button
                type="submit"
                className="rounded border border-[#b8c4d2] bg-white px-5 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#14243a] shadow-sm hover:bg-[#f4f7fb]"
              >
                Logout
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export default function NewsTableDesk({ initialPayload, initialSection = "news" }) {
  const activeSection = SECTION_CONFIG[initialSection] ? initialSection : "news";
  const [payload, setPayload] = useState(initialPayload || createEmptyPayload());
  const [initialLoadSettled, setInitialLoadSettled] = useState(() => hasPayloadRecords(initialPayload));
  const [initialLoadComplete, setInitialLoadComplete] = useState(() => hasPayloadRecords(initialPayload));
  const [loadProgress, setLoadProgress] = useState(() => (hasPayloadRecords(initialPayload) ? 100 : 1));
  const [filters, setFilters] = useState({
    category: "",
    state: "",
    district: "",
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [lastReloadAt, setLastReloadAt] = useState(initialPayload?.loaded_at || new Date().toISOString());
  const [message, setMessage] = useState("");
  const [categoryCatalog, setCategoryCatalog] = useState(null);
  const [preview, setPreview] = useState(null);
  const [relativeNow, setRelativeNow] = useState(null);
  const [translateLanguage, setTranslateLanguage] = useState("hi");

  const records = useMemo(() => flattenPayload(payload, activeSection), [activeSection, payload]);
  const payloadHasRecords = hasPayloadRecords(payload);
  const dynamicNewsCategories = useMemo(() => {
    const categories =
      categoryCatalog?.data?.final_categories ||
      categoryCatalog?.final_categories ||
      categoryCatalog?.data?.data?.final_categories ||
      [];
    return Array.isArray(categories) ? categories.filter(Boolean) : [];
  }, [categoryCatalog]);
  const categories = useMemo(() => {
    if (activeSection === "news" && dynamicNewsCategories.length > 0) {
      return dynamicNewsCategories;
    }

    return uniqueValues(records, (item) => item.category);
  }, [activeSection, dynamicNewsCategories, records]);
  const states = useMemo(() => uniqueValues(records, (item) => item.state), [records]);
  const districts = useMemo(() => uniqueValues(records, (item) => item.district), [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((item) => {
      if (filters.category && item.category !== filters.category) {
        return false;
      }
      if (filters.state && item.state !== filters.state) {
        return false;
      }
      if (filters.district && item.district !== filters.district) {
        return false;
      }
      return true;
    });
  }, [filters.category, filters.state, filters.district, records]);

  const pageSize = Number(filters.pageSize) || DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = filteredRecords.length ? (safeCurrentPage - 1) * pageSize : 0;
  const pageEndIndex = Math.min(pageStartIndex + pageSize, filteredRecords.length);
  const visibleRecords = filteredRecords.slice(pageStartIndex, pageEndIndex);
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);
  const handleTranslateLanguageChange = useCallback((languageCode) => {
    const nextLanguage = TRANSLATE_LANGUAGE_CODES.has(languageCode) ? languageCode : "hi";
    setTranslateLanguage(nextLanguage);
    if (nextLanguage === "hi") {
      resetGoogleTranslateToHindi({ reload: true });
      return;
    }

    applyGoogleTranslateLanguage(nextLanguage);
  }, []);

  useEffect(() => {
    let retryTimer = null;
    let retries = 0;

    if (translateLanguage === "hi") {
      clearGoogleTranslateCookie();
      try {
        window.sessionStorage.removeItem("gts-force-hindi-reset");
      } catch {
        // Session storage is optional.
      }
    }

    function initializeTranslateElement() {
      if (!document.getElementById(GOOGLE_TRANSLATE_ELEMENT_ID)) {
        return false;
      }

      if (getGoogleTranslateCombo()) {
        return true;
      }

      if (!window.google?.translate?.TranslateElement) {
        return false;
      }

      new window.google.translate.TranslateElement(
        {
          pageLanguage: "hi",
          includedLanguages: TRANSLATE_LANGUAGES
            .filter((language) => language.code !== "hi")
            .map((language) => language.code)
            .join(","),
          autoDisplay: false,
        },
        GOOGLE_TRANSLATE_ELEMENT_ID
      );
      return true;
    }

    function applyWhenReady() {
      if (initializeTranslateElement() && applyGoogleTranslateLanguage(translateLanguage)) {
        return;
      }

      if (retries < 30) {
        retries += 1;
        retryTimer = window.setTimeout(applyWhenReady, 250);
      }
    }

    window.googleTranslateElementInit = applyWhenReady;

    if (!document.getElementById(GOOGLE_TRANSLATE_SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = GOOGLE_TRANSLATE_SCRIPT_ID;
      script.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      script.async = true;
      document.body.appendChild(script);
    } else {
      applyWhenReady();
    }

    return () => {
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [initialLoadComplete, translateLanguage]);

  useEffect(() => {
    if (translateLanguage === "hi") {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      applyGoogleTranslateLanguage(translateLanguage);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [activeSection, pageStartIndex, pageEndIndex, payload, translateLanguage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters.category, filters.state, filters.district, filters.pageSize, activeSection]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (initialLoadComplete) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setLoadProgress((current) => {
        if (current >= 96) {
          return current;
        }

        const step = current < 35 ? 7 : current < 72 ? 4 : 2;
        return Math.min(96, current + step);
      });
    }, 260);

    return () => window.clearInterval(interval);
  }, [initialLoadComplete]);

  useEffect(() => {
    if (initialLoadComplete) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setMessage("Backend abhi busy hai. Table open kar diya; reload se data refresh ho jayega.");
      setInitialLoadSettled(true);
      setLoadProgress(100);
    }, INITIAL_LOAD_MAX_WAIT_MS);

    return () => window.clearTimeout(timeout);
  }, [initialLoadComplete]);

  useEffect(() => {
    if (initialLoadComplete || (!initialLoadSettled && !payloadHasRecords)) {
      return undefined;
    }

    setLoadProgress(100);
    const timeout = window.setTimeout(() => setInitialLoadComplete(true), 420);
    return () => window.clearTimeout(timeout);
  }, [initialLoadComplete, initialLoadSettled, payloadHasRecords]);

  const refreshNews = useCallback(async ({ force = false, section = activeSection } = {}) => {
    const sectionConfig = SECTION_CONFIG[section] || SECTION_CONFIG.news;
    if (!force) {
      const cached = readSectionCache(section);
      if (cached) {
        setPayload(cached.payload);
        setLastReloadAt(new Date(cached.savedAt).toISOString());
        if (section === activeSection) {
          setLoadProgress(100);
          setInitialLoadSettled(true);
        }
        return;
      }
    }

    try {
      if (force && sectionConfig.syncPath) {
        setMessage(`${sectionConfig.label} sync chal raha hai...`);
        const syncResponse = await fetchWithTimeout(getDashboardProxyPath(sectionConfig.syncPath), {
          method: "POST",
          cache: "no-store",
        }, REQUEST_TIMEOUT_MS);
        const syncPayload = await syncResponse.json().catch(() => null);

        if (!syncResponse.ok || syncPayload?.status === "Error" || syncPayload?.success === false) {
          throw new Error(syncPayload?.message || syncPayload?.error?.message || `${sectionConfig.label} sync failed.`);
        }
      }

      const response = await fetchWithTimeout(getDashboardProxyPath(sectionConfig.listPath), {
        cache: "no-store",
      }, REQUEST_TIMEOUT_MS);
      const nextPayload = await response.json();
      if (response.ok && nextPayload.status !== "Error") {
        setPayload(nextPayload);
        setLastReloadAt(new Date().toISOString());
        writeSectionCache(section, nextPayload);
        setMessage(`${sectionConfig.label} reload ho gaya.`);
        if (section === activeSection) {
          setLoadProgress(100);
        }
      } else {
        setMessage(nextPayload.message || `${sectionConfig.label} load nahi ho paya.`);
      }
    } catch (error) {
      setMessage(error.message || "Backend connection wait kar raha hai; cached data dikhaya ja raha hai.");
    } finally {
      if (section === activeSection) {
        setLoadProgress(100);
        setInitialLoadSettled(true);
      }
    }
  }, [activeSection]);

  useEffect(() => {
    const hasInitialRecords = hasPayloadRecords(initialPayload);
    setInitialLoadSettled(hasInitialRecords);
    setInitialLoadComplete(hasInitialRecords);
    setLoadProgress(hasInitialRecords ? 100 : 1);

    const cached = readSectionCache(activeSection);
    if (cached) {
      setPayload(cached.payload);
      setLastReloadAt(new Date(cached.savedAt).toISOString());
      setLoadProgress(100);
      setInitialLoadSettled(true);
      return;
    }

    setPayload(initialPayload || createEmptyPayload());
    setLastReloadAt(new Date().toISOString());
    if (hasPayloadRecords(initialPayload)) {
      writeSectionCache(activeSection, initialPayload);
    }
  }, [activeSection, initialPayload]);

  useEffect(() => {
    let cancelled = false;

    async function loadCategoryCatalog() {
      try {
        const response = await fetchWithTimeout(getDashboardProxyPath("/categories"), { cache: "no-store" });
        const nextPayload = await response.json();
        if (!cancelled && response.ok) {
          setCategoryCatalog(nextPayload);
        }
      } catch {
        // Fall back to categories present in the article payload.
      }
    }

    void loadCategoryCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    startTransition(() => {
      void refreshNews({ section: activeSection });
    });
  }, [activeSection, refreshNews]);

  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState !== "visible") {
        return;
      }

      startTransition(() => {
        void refreshNews({ section: activeSection });
      });
    }

    const interval = window.setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [activeSection, refreshNews]);

  useEffect(() => {
    if (!message) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setMessage(""), 1800);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    setRelativeNow(Date.now());
    const interval = window.setInterval(() => setRelativeNow(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  if (!initialLoadComplete) {
    return (
      <main className="min-h-screen bg-white text-black" style={{ zoom: "90%" }}>
        <GoogleTranslateRuntime />
        <NewsTableHeader activeSection={activeSection} />
        <NewsTableLoadingScreen
          progress={loadProgress}
          label={SECTION_CONFIG[activeSection]?.label || "News"}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-black" style={{ zoom: "90%" }}>
      <GoogleTranslateRuntime />
      <NewsTableHeader activeSection={activeSection} />
      <div className="px-3 pt-3">
        <div className="grid gap-3 lg:grid-cols-4">
          <label className="block text-sm font-bold">
            Select Category :
            <select
              value={filters.category}
              onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
              className="mt-2 h-9 w-full border border-[#b7b7b7] bg-white px-3 text-center text-sm text-black"
            >
              <option value="">--Select Category--</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-bold">
            State:
            <select
              value={filters.state}
              onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value }))}
              className="mt-2 h-9 w-full border border-[#b7b7b7] bg-white px-3 text-sm text-black"
            >
              <option value="">-- Select State / राज्य चुनें --</option>
              {states.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-bold">
            District:
            <select
              value={filters.district}
              onChange={(event) => setFilters((current) => ({ ...current, district: event.target.value }))}
              className="mt-2 h-9 w-full border border-[#b7b7b7] bg-white px-3 text-sm text-black"
            >
              <option value="">--Select District / जिला चुनें--</option>
              {districts.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
          </label>

          <div className="hidden lg:block" aria-hidden="true" />
        </div>

        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => void refreshNews({ force: true })}
            className="rounded bg-[#337ab7] px-4 py-2 text-sm text-white hover:bg-[#286090]"
          >
            Search {SECTION_CONFIG[activeSection]?.label || "News"}
          </button>
        </div>
      </div>

      <div className="mt-3 px-3 pb-4">
        <section className="min-w-0">
          <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <h2 className="text-base font-bold">{SECTION_CONFIG[activeSection]?.label || "News"}/समाचार</h2>
            <button
              type="button"
              onClick={() => void refreshNews({ force: true })}
              className="text-center text-sm text-[#1f70bd] hover:underline"
            >
              Click here to reload {SECTION_CONFIG[activeSection]?.label || "news"}({formatTime(lastReloadAt)})
            </button>
            <h2 className="text-base font-bold">Content (समाचार)</h2>
          </div>

          <div className="my-2 flex flex-col gap-2 text-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span>Show</span>
              <select
                value={filters.pageSize}
                onChange={(event) => setFilters((current) => ({ ...current, pageSize: Number(event.target.value) }))}
                className="h-8 border border-[#999] bg-white px-2 text-sm text-black"
              >
                {[25, 50].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              <span>entries</span>
              <span className="text-[#555]">Total entries: {filteredRecords.length}</span>
              <GoogleTranslateControl
                value={translateLanguage}
                onChange={handleTranslateLanguageChange}
                compact
              />
              {message ? <span className="ml-3 text-sm text-[#0d6efd]">{message}</span> : null}
            </div>

            <nav className="flex flex-wrap items-center gap-1 lg:justify-end" aria-label="Table pagination">
              <span className="mr-1 text-[#555]">Jump to page</span>
              <select
                value={safeCurrentPage}
                onChange={(event) => setCurrentPage(Number(event.target.value))}
                className="h-8 border border-[#999] bg-white px-2 text-sm text-black"
              >
                {pageNumbers.map((page) => (
                  <option key={page} value={page}>
                    {page}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safeCurrentPage === 1}
                className="border border-[#b7b7b7] bg-white px-3 py-1 text-sm text-black disabled:cursor-not-allowed disabled:opacity-45"
              >
                Previous
              </button>
              {pageNumbers.map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`border px-3 py-1 text-sm ${safeCurrentPage === page ? "border-[#333] bg-[#333] text-white" : "border-[#b7b7b7] bg-white text-black"}`}
                  aria-current={safeCurrentPage === page ? "page" : undefined}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={safeCurrentPage === totalPages}
                className="border border-[#b7b7b7] bg-white px-3 py-1 text-sm text-black disabled:cursor-not-allowed disabled:opacity-45"
              >
                Next
              </button>
            </nav>
          </div>

          <div className="overflow-x-auto rounded border border-[#cfd8e3] bg-white">
            <table className="w-full min-w-[1450px] table-fixed border-collapse text-[13px]">
              <thead>
                <tr className="sticky top-0 border-b border-[#b9c6d4] bg-[#f5f5f5] text-left text-[11px] uppercase text-[#333]">
                  <th className="w-[68px] border-r border-[#d8e0e8] px-2 py-2">Id</th>
                  <th className="w-[110px] border-r border-[#d8e0e8] px-2 py-2">Category</th>
                  <th className="w-[120px] border-r border-[#d8e0e8] px-2 py-2">Uploaded</th>
                  <th className="w-[245px] border-r border-[#d8e0e8] px-2 py-2">Title/हैडलाइन</th>
                  <th className="w-[145px] border-r border-[#d8e0e8] px-2 py-2 text-center">Image</th>
                  <th className="w-[180px] border-r border-[#d8e0e8] px-2 py-2">Image Caption</th>
                  <th className="w-[190px] border-r border-[#d8e0e8] px-2 py-2">100 Words</th>
                  <th className="w-[200px] border-r border-[#d8e0e8] px-2 py-2">300 Words</th>
                  <th className="w-[200px] border-r border-[#d8e0e8] px-2 py-2">600 Words</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((item, index) => (
                  <tr
                    key={`${item.id}-${item.rewrite_id || index}`}
                    className={`border-b border-[#e8edf3] align-top transition-colors hover:bg-[#f2f8ff] ${index % 2 ? "bg-white" : "bg-[#fbfcfe]"}`}
                  >
                    <td className="overflow-hidden border-r border-[#e5eaf0] px-2 py-2 text-center text-[#4b5b6d]">{item.id}</td>
                    <td className="overflow-hidden border-r border-[#e5eaf0] px-2 py-2 text-center">
                      <span className="inline-flex rounded border border-[#d6dde6] bg-white px-2 py-1 text-[11px] font-semibold text-[#334155]">
                        {item.category}
                      </span>
                    </td>
                    <td className="overflow-hidden border-r border-[#e5eaf0] px-2 py-2 text-center text-[#4b5b6d]" title={formatDate(item.fetched_at)}>
                      {relativeNow ? formatUploadAge(item.fetched_at, relativeNow) : "-"}
                    </td>
                    <td className="overflow-hidden border-r border-[#e5eaf0] px-2 py-2">
                      <div className="flex min-w-0 flex-col gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold leading-5 text-[#123b61]">{truncate(item.title, 75)}</div>
                          <div className="mt-1 text-xs text-[#687789]">{item.state || "-"}</div>
                        </div>
                        <CopyActions text={item.title} setMessage={setMessage} translateLanguage={translateLanguage} />
                      </div>
                    </td>
                    <td className="overflow-hidden border-r border-[#e5eaf0] px-2 py-2 text-center">
                      <ImageCell item={item} setMessage={setMessage} />
                    </td>
                    <td className="overflow-hidden border-r border-[#e5eaf0] px-2 py-2">
                      <div className="flex min-w-0 flex-col gap-2">
                        {item.image_caption ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPreview({ item, active: "caption" });
                            }}
                            className="min-h-[40px] w-full min-w-0 text-left leading-5 text-[#17293b] hover:text-[#0d6efd] hover:underline"
                            title="Open image caption preview"
                          >
                            {truncate(item.image_caption, 92)}
                          </button>
                        ) : (
                          <span className="leading-5 text-[#687789]">Caption available nahi hai.</span>
                        )}
                        {item.image_caption ? (
                          <div className="grid w-full min-w-0 grid-cols-1 gap-1">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setPreview({ item, active: "caption" });
                              }}
                              className="w-full rounded border border-[#337ab7] bg-[#edf6ff] px-1.5 py-1 text-xs font-semibold text-[#1f5f95] hover:bg-[#dff0ff]"
                            >
                              Preview
                            </button>
                            <CopyActions text={item.image_caption} setMessage={setMessage} translateLanguage={translateLanguage} />
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="overflow-hidden border-r border-[#e5eaf0] px-2 py-2">
                      <PreviewTextCell
                        item={item}
                        type="100"
                        text={item.short_100}
                        previewSize={58}
                        setPreview={setPreview}
                        setMessage={setMessage}
                        translateLanguage={translateLanguage}
                      />
                    </td>
                    <td className="overflow-hidden border-r border-[#e5eaf0] px-2 py-2">
                      <PreviewTextCell
                        item={item}
                        type="300"
                        text={item.medium_300}
                        previewSize={70}
                        setPreview={setPreview}
                        setMessage={setMessage}
                        translateLanguage={translateLanguage}
                      />
                    </td>
                    <td className="overflow-hidden border-r border-[#e5eaf0] px-2 py-2">
                      <PreviewTextCell
                        item={item}
                        type="600"
                        text={item.long_500}
                        previewSize={78}
                        setPreview={setPreview}
                        setMessage={setMessage}
                        translateLanguage={translateLanguage}
                      />
                    </td>
                  </tr>
                ))}
                {!visibleRecords.length ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-[#555]">
                      {filters.category || filters.state || filters.district
                        ? "No results for selected filters. Try clearing filters or reload data."
                        : "No news found. Reload news button to refresh data."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[#555]">
              Showing {filteredRecords.length ? pageStartIndex + 1 : 0} to {pageEndIndex} of {filteredRecords.length} entries
            </div>
          </div>
        </section>
      </div>
      {preview ? (
        <PreviewModal
          preview={preview}
          setPreview={setPreview}
          setMessage={setMessage}
          translateLanguage={translateLanguage}
          onTranslateLanguageChange={handleTranslateLanguageChange}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </main>
  );
}

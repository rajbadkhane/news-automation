"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { unicodeToChanakya } from "@/lib/chanakya-converter";

const CACHE_KEY = "gts-news-table-cache-v1";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 1000;
const SECTION_CONFIG = {
  news: {
    label: "News",
    pagePath: "/news-table",
    listPath: "/delivery/news/grouped?language=hindi&limit=500",
    syncPath: null,
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

function getDashboardProxyPath(path) {
  const normalized = String(path || "").startsWith("/") ? path : `/${path}`;
  return `/api/dashboard${normalized}`;
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

function flattenPayload(payload, section = "news") {
  const records = (payload?.grouped_records || []).flatMap((group) =>
    (group.records || []).map((record) => ({
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
      short_100: cleanText(record.raw_articles?.words_100 || record.ui_hindi?.short_100 || record.summary),
      medium_300: cleanText(record.raw_articles?.words_300 || record.ui_hindi?.medium_300 || record.summary),
      long_500: cleanText(
        record.raw_articles?.words_600 ||
          record.raw_articles?.words_500 ||
          record.ui_hindi?.long_500 ||
          record.article ||
          record.summary
      ),
    }))
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

async function copyText(text, setMessage) {
  const value = cleanText(text);
  if (!value) {
    setMessage("Copy ke liye content available nahi hai.");
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setMessage("Copied");
  } catch {
    setMessage("Clipboard permission nahi mili.");
  }
}

async function copyChanakyaText(text, setMessage) {
  const value = cleanText(text);
  if (!value) {
    setMessage("Chanakya copy ke liye content available nahi hai.");
    return;
  }

  try {
    await navigator.clipboard.writeText(unicodeToChanakya(value, { useFixedKraGlyph: true }));
    setMessage("Chanakya text copied");
  } catch {
    setMessage("Clipboard permission nahi mili.");
  }
}

function CopyActions({ text, setMessage }) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void copyText(text, setMessage);
        }}
        className="rounded border border-[#b8c4d2] bg-white px-2 py-1 text-xs font-semibold text-[#26384c] hover:bg-[#edf6ff]"
        title="Copy normal Unicode text"
      >
        Copy
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void copyChanakyaText(text, setMessage);
        }}
        className="rounded border border-[#b68b35] bg-[#fff8e8] px-2 py-1 text-xs font-semibold text-[#7a4f00] hover:bg-[#ffefc2]"
        title="Copy converted Chanakya font text"
      >
        Chanakya
      </button>
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
    const url = URL.createObjectURL(blob);
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

function ImageCell({ item, setMessage }) {
  const [useDirectImage, setUseDirectImage] = useState(false);
  const [failed, setFailed] = useState(false);
  const hasImage = isUsableImageUrl(item.image_link);
  const imageSrc = useDirectImage ? item.image_link : getDisplayImageUrl(item.image_link);

  if (!hasImage || failed) {
    return (
      <div className="flex h-[86px] w-[126px] items-center justify-center rounded border border-[#d6dde6] bg-[#f3f6f9] px-2 text-center text-xs text-[#6b7280]">
        No image
      </div>
    );
  }

  return (
    <div className="flex w-[138px] flex-col items-center gap-1">
      <div
        className="h-[86px] w-[126px] overflow-hidden rounded border border-[#cfd8e3] bg-[#eef2f7] shadow-sm"
        title="Image preview"
      >
        <img
          src={imageSrc}
          alt={item.title || "News image"}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            if (!useDirectImage) {
              setUseDirectImage(true);
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

export default function NewsTableDesk({ initialPayload, initialSection = "news" }) {
  const activeSection = SECTION_CONFIG[initialSection] ? initialSection : "news";
  const [payload, setPayload] = useState(initialPayload);
  const [filters, setFilters] = useState({
    category: "",
    state: "",
    district: "",
    pageSize: 25,
  });
  const [lastReloadAt, setLastReloadAt] = useState(initialPayload?.loaded_at || new Date().toISOString());
  const [message, setMessage] = useState("");

  const records = useMemo(() => flattenPayload(payload, activeSection), [activeSection, payload]);
  const categories = useMemo(() => uniqueValues(records, (item) => item.category), [records]);
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

  const visibleRecords = filteredRecords.slice(0, Number(filters.pageSize) || 25);

  const refreshNews = useCallback(async ({ force = false, section = activeSection } = {}) => {
    const sectionConfig = SECTION_CONFIG[section] || SECTION_CONFIG.news;
    if (!force) {
      const cached = readSectionCache(section);
      if (cached) {
        setPayload(cached.payload);
        setLastReloadAt(new Date(cached.savedAt).toISOString());
        return;
      }
    }

    try {
      if (force && sectionConfig.syncPath) {
        await fetch(getDashboardProxyPath(sectionConfig.syncPath), {
          method: "POST",
          cache: "no-store",
        });
      }

      const response = await fetch(getDashboardProxyPath(sectionConfig.listPath), {
        cache: force ? "reload" : "force-cache",
      });
      const nextPayload = await response.json();
      if (response.ok && nextPayload.status !== "Error") {
        setPayload(nextPayload);
        setLastReloadAt(new Date().toISOString());
        writeSectionCache(section, nextPayload);
      } else {
        setMessage(nextPayload.message || `${sectionConfig.label} load nahi ho paya.`);
      }
    } catch {
      setMessage("Backend connection wait kar raha hai; cached data dikhaya ja raha hai.");
    }
  }, [activeSection]);

  useEffect(() => {
    const cached = readSectionCache(activeSection);
    if (cached) {
      setPayload(cached.payload);
      setLastReloadAt(new Date(cached.savedAt).toISOString());
      return;
    }

    setPayload(initialPayload);
    setLastReloadAt(new Date().toISOString());
    writeSectionCache(activeSection, initialPayload);
  }, [activeSection, initialPayload]);

  useEffect(() => {
    if (activeSection === "news") {
      return;
    }

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

  return (
    <main className="min-h-screen bg-white p-3 text-black">
      <h1 className="mb-4 text-[22px] font-bold">News</h1>
      <div className="mb-3 flex flex-wrap gap-2 border-b border-[#d8d8d8] pb-3">
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
            className={`border px-4 py-2 text-sm font-bold ${activeSection === key ? "border-[#23527c] bg-[#337ab7] text-white" : "border-[#c7c7c7] bg-white text-black"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="border-t border-[#e5e5e5] pt-3">
        <div className="grid gap-3 lg:grid-cols-4">
          <label className="block text-sm font-bold">
            Select Category :
            <select
              value={filters.category}
              onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
              className="mt-2 h-[34px] w-full border border-[#c7c7c7] bg-white px-3 text-center text-sm text-black"
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
              className="mt-2 h-[40px] w-full border border-[#aeb7c2] bg-[#f5f7f9] px-3 text-sm text-[#19324b]"
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
              className="mt-2 h-[40px] w-full border border-[#aeb7c2] bg-[#f5f7f9] px-3 text-sm text-[#19324b]"
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

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => void refreshNews({ force: true })}
            className="rounded bg-[#337ab7] px-4 py-2 text-sm text-white hover:bg-[#286090]"
          >
            Search {SECTION_CONFIG[activeSection]?.label || "News"}
          </button>
        </div>
      </div>

      <div className="mt-4">
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

          <div className="my-2 flex items-center gap-2">
            <span>Show</span>
            <select
              value={filters.pageSize}
              onChange={(event) => setFilters((current) => ({ ...current, pageSize: Number(event.target.value) }))}
              className="h-[40px] border border-[#bfc9d4] px-3"
            >
              {[25, 50, 100, 300, 500].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span>entries</span>
            {message ? <span className="ml-3 text-sm text-[#0d6efd]">{message}</span> : null}
          </div>

          <div className="overflow-x-auto rounded border border-[#dfe6ee] bg-white shadow-sm">
            <table className="w-full min-w-[1660px] border-collapse text-sm">
              <thead>
                <tr className="sticky top-0 border-b border-[#b9c6d4] bg-[#f4f7fa] text-left text-xs uppercase text-[#30445c]">
                  <th className="w-[55px] border-r border-[#d8e0e8] px-3 py-3">#</th>
                  <th className="w-[90px] border-r border-[#d8e0e8] px-3 py-3">Id</th>
                  <th className="w-[105px] border-r border-[#d8e0e8] px-3 py-3">Category</th>
                  <th className="w-[330px] border-r border-[#d8e0e8] px-3 py-3">Title</th>
                  <th className="w-[155px] border-r border-[#d8e0e8] px-3 py-3 text-center">Image Preview</th>
                  <th className="w-[230px] border-r border-[#d8e0e8] px-3 py-3">100 Words</th>
                  <th className="w-[260px] border-r border-[#d8e0e8] px-3 py-3">300 Words</th>
                  <th className="w-[280px] border-r border-[#d8e0e8] px-3 py-3">600 Words</th>
                  <th className="w-[120px] px-3 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((item, index) => (
                  <tr
                    key={`${item.id}-${item.rewrite_id || index}`}
                    className={`border-b border-[#e8edf3] align-top transition-colors hover:bg-[#f2f8ff] ${index % 2 ? "bg-white" : "bg-[#fbfcfe]"}`}
                  >
                    <td className="border-r border-[#e5eaf0] px-3 py-3 text-center font-semibold text-[#4b5b6d]">{index + 1}</td>
                    <td className="border-r border-[#e5eaf0] px-3 py-3 text-center text-[#4b5b6d]">{item.id}</td>
                    <td className="border-r border-[#e5eaf0] px-3 py-3 text-center">
                      <span className="inline-flex rounded border border-[#d6dde6] bg-[#f7fafc] px-2 py-1 text-xs font-semibold text-[#334155]">
                        {item.category}
                      </span>
                    </td>
                    <td className="border-r border-[#e5eaf0] px-3 py-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold leading-6 text-[#123b61]">{truncate(item.title, 105)}</div>
                          <div className="mt-1 text-xs text-[#687789]">{item.state || "-"}</div>
                        </div>
                        <CopyActions text={item.title} setMessage={setMessage} />
                      </div>
                    </td>
                    <td className="border-r border-[#e5eaf0] px-3 py-3 text-center">
                      <ImageCell item={item} setMessage={setMessage} />
                    </td>
                    <td className="border-r border-[#e5eaf0] px-3 py-3">
                      <div className="flex items-start gap-2">
                        <span className="flex-1">{truncate(item.short_100, 58)}</span>
                        <CopyActions text={item.short_100} setMessage={setMessage} />
                      </div>
                    </td>
                    <td className="border-r border-[#e5eaf0] px-3 py-3">
                      <div className="flex items-start gap-2">
                        <span className="flex-1">{truncate(item.medium_300, 70)}</span>
                        <CopyActions text={item.medium_300} setMessage={setMessage} />
                      </div>
                    </td>
                    <td className="border-r border-[#e5eaf0] px-3 py-3">
                      <div className="flex items-start gap-2">
                        <span className="flex-1">{truncate(item.long_500, 78)}</span>
                        <CopyActions text={item.long_500} setMessage={setMessage} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-[#4b5b6d]">{formatDate(item.fetched_at)}</td>
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
        </section>
      </div>
    </main>
  );
}

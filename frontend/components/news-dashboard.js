"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";

const REFRESH_INTERVAL_MS = 30000;

function formatTimestamp(value) {
  if (!value) {
    return "No timestamp";
  }

  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function extractHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Unknown source";
  }
}

function prettifyCategory(value) {
  return (value || "uncategorized")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function prettifyFeedSource(value) {
  if (!value) {
    return "Saved Feed";
  }

  const normalized = value.toLowerCase();
  if (normalized === "dd") {
    return "DD News";
  }
  if (normalized === "mpinfo") {
    return "MP Info";
  }
  if (normalized === "pib") {
    return "PIB";
  }
  if (normalized === "google-rss") {
    return "Google RSS";
  }
  if (normalized === "cliff-news") {
    return "Cliff News";
  }
  if (normalized.endsWith("-gov")) {
    return value
      .split("-")
      .map((part) => {
        const lower = part.toLowerCase();
        if (lower === "gov") {
          return "Govt";
        }

        return part.length <= 3
          ? part.toUpperCase()
          : part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");
  }

  return value;
}

function prettifySchedulerName(value) {
  if (value === "main") {
    return "Main Cron";
  }
  if (value === "ai") {
    return "AI Cron";
  }

  return value || "Scheduler";
}

function prettifyRunType(value) {
  if (value === "cycle") {
    return "Cycle";
  }
  if (value === "category") {
    return "Category";
  }

  return value || "Run";
}

function toneForStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("success")) {
    return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
  }
  if (normalized.includes("error")) {
    return "border-rose-300/30 bg-rose-400/10 text-rose-100";
  }
  if (normalized.includes("skip")) {
    return "border-amber-300/30 bg-amber-400/10 text-amber-100";
  }

  return "border-white/15 bg-white/10 text-slate-100";
}

function cleanAiText(value) {
  return String(value || "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitAiParagraphs(value) {
  return cleanAiText(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitUiStoryParagraphs(value) {
  return cleanAiText(value)
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function getDisplayImageUrl(imageUrl) {
  if (!imageUrl) {
    return null;
  }

  return `${getDashboardProxyPath("/image-proxy")}?url=${encodeURIComponent(imageUrl)}`;
}

function isUsableImageUrl(imageUrl) {
  return /^https?:\/\//i.test(String(imageUrl || "").trim());
}

function DashboardImage({ imageUrl, alt, className, loading = "lazy" }) {
  const [useDirectImage, setUseDirectImage] = useState(false);
  const [failed, setFailed] = useState(false);
  const hasImage = isUsableImageUrl(imageUrl);

  if (!hasImage || failed) {
    return (
      <div className="h-full w-full bg-slate-900" aria-hidden="true" />
    );
  }

  return (
    <img
      src={useDirectImage ? imageUrl : getDisplayImageUrl(imageUrl)}
      alt={alt || "News image"}
      className={className}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => {
        if (!useDirectImage) {
          setUseDirectImage(true);
          return;
        }

        setFailed(true);
      }}
    />
  );
}

function getDashboardProxyPath(path) {
  const normalized = String(path || "").startsWith("/") ? path : `/${path}`;
  return `/api/dashboard${normalized}`;
}

function flattenGroups(groups) {
  return groups.flatMap((group) => group.records || []);
}

function buildStats(groups) {
  const records = flattenGroups(groups);
  const withImages = records.filter((item) => item.image_link).length;
  const categories = groups.length;
  const sources = new Set(records.map((item) => extractHost(item.source_url))).size;
  const feedSources = new Set(records.map((item) => item.feed_source).filter(Boolean)).size;

  return [
    { label: "Stories Saved", value: String(records.length).padStart(2, "0") },
    { label: "Images Captured", value: String(withImages).padStart(2, "0") },
    { label: "Live Categories", value: String(categories || 0).padStart(2, "0") },
    { label: "Source Domains", value: String(sources || 0).padStart(2, "0") },
    { label: "Feed Sources", value: String(feedSources || 0).padStart(2, "0") },
  ];
}

const FEED_LEGEND = [
  { label: "Cliff News", className: "bg-cyan-400/20 text-cyan-100 border-cyan-300/30" },
  { label: "DD News", className: "bg-emerald-400/20 text-emerald-100 border-emerald-300/30" },
  { label: "MP Info", className: "bg-amber-400/20 text-amber-100 border-amber-300/30" },
  { label: "PIB", className: "bg-sky-400/20 text-sky-100 border-sky-300/30" },
  { label: "State Govt", className: "bg-white/10 text-slate-100 border-white/20" },
];

function renderSummaryBullets(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-2 text-sm leading-6 text-slate-200">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-300" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function NewsDashboard({
  initialPayload,
  cronPayload,
  initialSchedulerLogPayload,
}) {
  const shellRef = useRef(null);
  const [livePayload, setLivePayload] = useState(initialPayload);
  const [liveCronPayload, setLiveCronPayload] = useState(cronPayload);
  const [schedulerLogPayload, setSchedulerLogPayload] = useState(initialSchedulerLogPayload);
  const groupedRecords = livePayload?.grouped_records || [];
  const flatRecords = useMemo(() => flattenGroups(groupedRecords), [groupedRecords]);
  const stats = useMemo(() => buildStats(groupedRecords), [groupedRecords]);
  const leadStory = flatRecords[0] || null;
  const mpInfoStories = flatRecords.filter((item) => item.feed_source === "mpinfo");
  const scheduler = liveCronPayload?.scheduler || null;
  const schedulerLogs = schedulerLogPayload?.records || [];
  const [syncState, setSyncState] = useState({
    loading: false,
    message: "",
  });
  const [aiState, setAiState] = useState({
    loading: false,
    message: "",
    selectedNewsId: null,
    activeLanguage: "english",
    article: null,
  });
  const [readerStory, setReaderStory] = useState(null);
  const dashboardNewsPath = getDashboardProxyPath("/delivery/news/grouped?language=hindi&limit=500");
  const dashboardCronPath = getDashboardProxyPath("/cron/status");
  const dashboardLogsPath = getDashboardProxyPath("/scheduler/logs?limit=20");

  async function triggerSync(endpoint, successMessage) {
    setSyncState({
      loading: true,
      message: "Syncing Cliff News and refreshing published delivery...",
    });

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || payload?.status === "Error" || payload?.success === false) {
        throw new Error(payload?.message || payload?.error?.message || `Sync failed with ${response.status}.`);
      }

      await refreshDashboard();

      setSyncState({
        loading: false,
        message: successMessage || "Sync completed. Dashboard refreshed.",
      });
    } catch (error) {
      setSyncState({
        loading: false,
        message: error.message || "Sync failed. Please retry after checking the backend connection.",
      });
    }
  }

  async function refreshDashboard() {
    try {
      const [newsResponse, cronResponse, schedulerLogsResponse] = await Promise.all([
        fetch(dashboardNewsPath, { cache: "no-store" }),
        fetch(dashboardCronPath, { cache: "no-store" }),
        fetch(dashboardLogsPath, { cache: "no-store" }),
      ]);

      const [newsPayload, cronPayloadNext, schedulerLogPayloadNext] = await Promise.all([
        newsResponse.json(),
        cronResponse.json(),
        schedulerLogsResponse.json(),
      ]);

      if (newsResponse.ok && newsPayload.status !== "Error") {
        setLivePayload(newsPayload);
      }

      if (cronResponse.ok && cronPayloadNext.status !== "Error") {
        setLiveCronPayload(cronPayloadNext);
      }

      if (schedulerLogsResponse.ok && schedulerLogPayloadNext.status !== "Error") {
        setSchedulerLogPayload(schedulerLogPayloadNext);
      }
    } catch (error) {
      setSyncState((current) => ({
        ...current,
        message: current.message || "Live refresh is waiting for the backend connection.",
      }));
    }
  }

  async function openAiRewrite(item) {
    if (item?.ui_hindi) {
      setReaderStory(item);
      setAiState((current) => ({
        ...current,
        loading: false,
        selectedNewsId: item.id,
        message: "",
      }));
      window.requestAnimationFrame(() => {
        document.getElementById("article-reader")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

    setReaderStory(null);
    setAiState((current) => ({
      ...current,
      loading: false,
      selectedNewsId: item.id,
      message: "AI rewrite generation is now restricted to the protected admin panel.",
    }));
  }

  function handleCardClick(item, event) {
    if (event.target?.closest?.("a,button")) {
      return;
    }

    openAiRewrite(item);
  }

  const aiRewrite = aiState.article?.rewrite || null;
  const aiLanguageBlock = aiRewrite?.[aiState.activeLanguage] || null;

  useEffect(() => {
    if (!shellRef.current) {
      return undefined;
    }

    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-hero]",
        { autoAlpha: 0, y: 42 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.1,
        }
      );

      gsap.fromTo(
        "[data-card]",
        { autoAlpha: 0, y: 24, scale: 0.985 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.7,
          ease: "power2.out",
          stagger: 0.05,
          delay: 0.15,
        }
      );
    }, shellRef);

    return () => context.revert();
  }, []);

  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState !== "visible") {
        return;
      }

      startTransition(() => {
        void refreshDashboard();
      });
    }

    const interval = window.setInterval(() => {
      refreshIfVisible();
    }, REFRESH_INTERVAL_MS);

    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [dashboardCronPath, dashboardLogsPath, dashboardNewsPath]);

  return (
    <main
      ref={shellRef}
      className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,122,89,0.28),transparent_28%),radial-gradient(circle_at_82%_0%,rgba(196,241,249,0.22),transparent_24%),linear-gradient(180deg,#0c111f_0%,#111827_45%,#0b1120_100%)]"
    >
      <section className="mx-auto max-w-7xl px-6 pb-14 pt-8 md:px-10 lg:px-12">
        <div
          data-hero
          className="mb-8 flex flex-col gap-6 rounded-[32px] border border-white/10 bg-white/6 p-6 shadow-panel backdrop-blur-xl md:flex-row md:items-end md:justify-between md:p-8"
        >
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex items-center rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-1 text-xs uppercase tracking-[0.3em] text-amber-100">
              Gautam Tech Studio
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-5xl leading-none text-white md:text-7xl">
              Category News Desk
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200 md:text-base">
              A category-wise newsroom interface for your automated RSS pipeline. Fetch, store, and review
              stories by topic with a cleaner editorial view.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:min-w-[320px]">
            <button
              type="button"
              onClick={() => triggerSync(getDashboardProxyPath("/sync/cliff-news?limit=100&language=ENGLISH&rewrite=true"), "Cliff News API synced and rewritten. Reloading dashboard...")}
              disabled={syncState.loading}
              className="rounded-2xl bg-amber-400 px-4 py-3 text-center text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-300"
            >
              {syncState.loading ? "Syncing..." : "Sync Cliff News"}
            </button>
            <a
              href={dashboardNewsPath}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/15"
            >
              Open Grouped API
            </a>
            <a
              href="/ai"
              className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-center text-sm font-semibold text-amber-50 transition hover:-translate-y-0.5 hover:bg-amber-300/20"
            >
              Open AI Desk
            </a>
          </div>
        </div>

        {syncState.message ? (
          <div
            data-hero
            className="mb-8 rounded-[24px] border border-white/10 bg-white/8 px-5 py-4 text-sm text-slate-100 backdrop-blur-xl"
          >
            {syncState.message}
          </div>
        ) : null}

        {aiState.message ? (
          <div
            data-hero
            className="mb-8 rounded-[24px] border border-cyan-300/20 bg-cyan-300/10 px-5 py-4 text-sm text-cyan-50 backdrop-blur-xl"
          >
            {aiState.message}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {stats.map((item) => (
            <article
              key={item.label}
              data-card
              className="rounded-[28px] border border-white/10 bg-white/8 p-5 backdrop-blur-xl"
            >
              <p className="text-xs uppercase tracking-[0.25em] text-slate-300">{item.label}</p>
              <p className="mt-3 text-4xl font-semibold text-white">{item.value}</p>
            </article>
          ))}
        </div>

        <div
          data-hero
          className="mt-6 flex flex-col gap-3 rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-xl md:flex-row md:items-center md:justify-between"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Feed Sources</p>
            <p className="mt-2 text-sm text-slate-200">
              Stories are blended from the configured government RSS publishers and state portals below.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {FEED_LEGEND.map((item) => (
              <span
                key={item.label}
                className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.2em] ${item.className}`}
              >
                {item.label}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section data-card className="rounded-[32px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-100/80">Lead Story</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">
                  {leadStory ? leadStory.title : "No saved articles yet"}
                </h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200">
                {prettifyCategory(leadStory?.category)}
              </div>
            </div>

            {leadStory ? (
              <div
                role="button"
                tabIndex={0}
                onMouseDownCapture={(event) => handleCardClick(leadStory, event)}
                onClickCapture={(event) => handleCardClick(leadStory, event)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openAiRewrite(leadStory);
                  }
                }}
                className="mt-6 cursor-pointer overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/30 transition hover:-translate-y-1 hover:border-white/25 focus:outline-none focus:ring-2 focus:ring-amber-300/70"
              >
                <div className="relative aspect-[16/9] overflow-hidden">
                  {leadStory.image_link ? (
                    <DashboardImage
                      imageUrl={leadStory.image_link}
                      alt={leadStory.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-full bg-slate-900" aria-hidden="true" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs uppercase tracking-[0.25em] text-cyan-100/70">
                        {extractHost(leadStory.source_url)}
                      </p>
                      <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white">
                        {prettifyFeedSource(leadStory.feed_source)}
                      </span>
                    </div>
                    <p className="mt-2 max-w-3xl text-lg text-white md:text-2xl">{leadStory.title}</p>
                  </div>
                </div>

                <div className="grid gap-4 border-t border-white/10 p-6 md:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Fetched At</p>
                    <p className="mt-2 text-sm text-slate-100">{formatTimestamp(leadStory.fetched_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Image Source</p>
                    <p className="mt-2 text-sm text-slate-100">{leadStory.image_source || "Not tagged"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Feed Source</p>
                    <p className="mt-2 text-sm text-slate-100">{prettifyFeedSource(leadStory.feed_source)}</p>
                  </div>
                  <div className="flex items-end">
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openAiRewrite(leadStory);
                        }}
                        disabled={aiState.loading}
                        className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-300/20 disabled:opacity-60"
                      >
                        Read Article
                      </button>
                      <a
                        href={leadStory.source_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                      >
                        Read Original Story
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-8 rounded-[28px] border border-dashed border-white/20 bg-slate-950/20 p-10 text-center text-slate-300">
                Trigger the backend category sync first, then this dashboard will render the saved category-wise stories.
              </div>
            )}
          </section>

          <aside data-card className="rounded-[32px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl md:p-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-100/80">Pipeline Status</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Category Monitor</h2>
              </div>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-emerald-200">
                Live
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {[
                {
                  title: "Backend API",
                  value: livePayload?.status === "Success" ? "Connected" : "Needs attention",
                },
                {
                  title: "Database",
                  value: livePayload?.database || livePayload?.meta?.database || "Unavailable",
                },
                {
                  title: "Categories Loaded",
                  value: String(livePayload?.category_count || 0),
                },
                {
                  title: "Auto Scheduler",
                  value: scheduler?.enabled
                    ? `Running every ${Math.round((scheduler.tick_ms || 0) / 1000)}s`
                    : "Disabled",
                },
                {
                  title: "Skipped Duplicates",
                  value: scheduler
                    ? String(
                        Object.values(scheduler.categories || {}).reduce(
                          (sum, item) => sum + (item?.skippedCount || 0),
                          0
                        )
                      )
                    : "0",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-3xl border border-white/10 bg-slate-950/30 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-white">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-[28px] bg-gradient-to-br from-amber-400 via-orange-400 to-rose-500 p-[1px]">
              <div className="rounded-[27px] bg-slate-950/95 p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-amber-100/70">Automation Hooks</p>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={() => triggerSync(getDashboardProxyPath("/sync/cliff-news?limit=100&language=ENGLISH&rewrite=true"), "Fetched Cliff News articles and rewrites. Reloading dashboard...")}
                    disabled={syncState.loading}
                    className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-white transition hover:bg-white/15"
                  >
                    Fetch 100 Cliff articles
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerSync(getDashboardProxyPath("/sync/cliff-news?category=Business&limit=20&language=ENGLISH&rewrite=true"), "Business Cliff News synced. Reloading dashboard...")}
                    disabled={syncState.loading}
                    className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-white transition hover:bg-white/15"
                  >
                    Fetch Cliff business
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerSync(getDashboardProxyPath("/fetch-mpinfo-news?category=National%2FState&limit=5"), "MP Info test fetch completed. Reloading dashboard...")}
                    disabled={syncState.loading}
                    className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-white transition hover:bg-white/15"
                  >
                    Test MP Info feed
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-[28px] border border-white/10 bg-slate-950/30 p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Cron Window</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Quiet Hours</p>
                  <p className="mt-2 text-sm text-white">
                    {scheduler
                      ? `${String(scheduler.quiet_hours.startHour).padStart(2, "0")}:00 to ${String(scheduler.quiet_hours.endHour).padStart(2, "0")}:00 IST`
                      : "Unavailable"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Last Run</p>
                  <p className="mt-2 text-sm text-white">
                    {scheduler?.last_run_at ? formatTimestamp(scheduler.last_run_at) : "No scheduled run yet"}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-6 text-slate-400">
                The scheduler fetches one article per category at staggered times across each 30-minute window and skips duplicate stories automatically.
              </p>
            </div>
          </aside>
        </div>

        <section className="mt-8 rounded-[32px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl md:p-8">
          <div data-hero className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-100/80">Scheduler Map</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-white">
                Automatic Category Timeline
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-300">
              Each category is assigned its own slot inside the 30-minute cycle so the backend fetches gradually instead of hitting every source at once.
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {scheduler?.schedule?.map((slot) => {
              const categoryState = scheduler.categories?.[slot.category];
              return (
                <article
                  key={slot.category}
                  data-card
                  className="rounded-[28px] border border-white/10 bg-slate-950/35 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Category</p>
                      <h3 className="mt-2 text-2xl font-semibold text-white">
                        {prettifyCategory(slot.category)}
                      </h3>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-200">
                      +{slot.offsetSeconds}s
                    </span>
                  </div>
                  <div className="mt-5 space-y-2 text-sm text-slate-300">
                    <p>Status: {categoryState?.lastStatus || "Waiting"}</p>
                    <p>Last run: {categoryState?.lastRunAt ? formatTimestamp(categoryState.lastRunAt) : "Not yet"}</p>
                    <p>Saved: {categoryState?.savedCount ?? 0} | Skipped: {categoryState?.skippedCount ?? 0}</p>
                  </div>
                </article>
              );
            }) || (
              <div className="rounded-[28px] border border-dashed border-white/20 bg-slate-950/20 p-10 text-center text-slate-300 lg:col-span-3">
                Cron scheduler status is not available yet.
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-[32px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl md:p-8">
          <div data-hero className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-100/80">Run History</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-white">
                Scheduler Audit Trail
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-300">
              Recent main cron and AI cron runs written to MySQL, including success, skip, and failure details.
            </p>
          </div>

          <div className="mt-8 grid gap-4">
            {schedulerLogs.length > 0 ? (
              schedulerLogs.map((item) => (
                <article
                  key={item.id}
                  data-card
                  className="rounded-[28px] border border-white/10 bg-slate-950/35 p-5"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-cyan-100">
                          {prettifySchedulerName(item.scheduler_name)}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-200">
                          {prettifyRunType(item.run_type)}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${toneForStatus(item.status)}`}>
                          {item.status}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-white">
                        {item.category ? prettifyCategory(item.category) : item.title || "Full scheduler cycle"}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        {item.message || "Scheduler run recorded."}
                      </p>
                      {item.error_message ? (
                        <p className="mt-2 text-sm leading-6 text-rose-200">
                          Error: {item.error_message}
                        </p>
                      ) : null}
                    </div>

                    <div className="min-w-[220px] rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                      <p>Started: {formatTimestamp(item.started_at)}</p>
                      <p className="mt-2">Completed: {item.completed_at ? formatTimestamp(item.completed_at) : "Running"}</p>
                      <p className="mt-2">Trigger: {item.trigger_source}</p>
                      <p className="mt-2">Saved: {item.saved_count} | Skipped: {item.skipped_count} | Failed: {item.failed_count}</p>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[28px] border border-dashed border-white/20 bg-slate-950/20 p-10 text-center text-slate-300">
                Scheduler logs will appear here after the first cron run is recorded.
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-[32px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl md:p-8">
          <div data-hero className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-100/80">MP Info Spotlight</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-white">
                Madhya Pradesh Feed Test
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-300">
              A quick verification area for MP Info stories so you can confirm this government feed is flowing into the same pipeline.
            </p>
          </div>

          <div className="mb-10 grid gap-5 lg:grid-cols-2">
            {mpInfoStories.length > 0 ? (
              mpInfoStories.slice(0, 4).map((item) => (
                <article
                  key={`mpinfo-${item.id}`}
                  data-card
                  role="button"
                  tabIndex={0}
                  onClick={() => openAiRewrite(item)}
                  onMouseDownCapture={(event) => handleCardClick(item, event)}
                  onClickCapture={(event) => handleCardClick(item, event)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openAiRewrite(item);
                    }
                  }}
                  className="group cursor-pointer overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/35 transition hover:-translate-y-1 hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-amber-300/70"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-slate-900">
                    {item.image_link ? (
                      <DashboardImage
                        imageUrl={item.image_link}
                        alt={item.title || "MP Info image"}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full bg-slate-900" aria-hidden="true" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
                    <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
                      <span className="rounded-full bg-amber-400/20 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-amber-100">
                        MP Info
                      </span>
                      <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white">
                        {prettifyCategory(item.category)}
                      </span>
                    </div>
                  </div>

                  <div className="p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      {extractHost(item.source_url)}
                    </p>
                    <h3 className="mt-3 text-xl font-semibold leading-8 text-white">
                      {item.title || "Untitled story"}
                    </h3>
                    <div className="mt-5 flex items-center justify-between gap-4">
                      <p className="text-sm text-slate-400">{formatTimestamp(item.fetched_at)}</p>
                      <div className="flex flex-wrap justify-end gap-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openAiRewrite(item);
                          }}
                          disabled={aiState.loading}
                          className="rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-300/20 disabled:opacity-60"
                        >
                          Read Article
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[28px] border border-dashed border-white/20 bg-slate-950/20 p-10 text-center text-slate-300 lg:col-span-2">
                No MP Info stories saved yet. Use the “Test MP Info feed” button above to fetch and verify them.
              </div>
            )}
          </div>

          <div data-hero className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-100/80">Category Archive</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-white">
                Saved News By Category
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-300">
              Each section below is grouped from your MySQL database so the frontend mirrors how your news
              automation stores records category-wise.
            </p>
          </div>

          <div className="mt-8 space-y-10">
            {groupedRecords.length > 0 ? (
              groupedRecords.map((group) => (
                <section key={group.category} data-card>
                  <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Category</p>
                      <h3 className="mt-2 text-3xl font-semibold text-white">
                        {prettifyCategory(group.category)}
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-200">
                        {group.count} saved
                      </span>
                      <a
                        href={getDashboardProxyPath(`/news?category=${group.category}&limit=50`)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-amber-100 transition hover:bg-amber-300/20"
                      >
                        Open Category API
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          triggerSync(
                            getDashboardProxyPath(`/sync/cliff-news?category=${encodeURIComponent(group.category)}&limit=20&language=ENGLISH&rewrite=true`),
                            `${prettifyCategory(group.category)} synced. Reloading dashboard...`
                          )
                        }
                        disabled={syncState.loading}
                        className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white transition hover:bg-white/15"
                      >
                        Sync Category
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-2">
                    {group.records.map((item) => (
                      <article
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openAiRewrite(item)}
                        onMouseDownCapture={(event) => handleCardClick(item, event)}
                        onClickCapture={(event) => handleCardClick(item, event)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openAiRewrite(item);
                          }
                        }}
                        className="group cursor-pointer overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/35 transition hover:-translate-y-1 hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-amber-300/70"
                      >
                        <div className="relative aspect-[16/10] overflow-hidden bg-slate-900">
                          {item.image_link ? (
                            <DashboardImage
                              imageUrl={item.image_link}
                              alt={item.title || "News image"}
                              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-full bg-slate-900" aria-hidden="true" />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
                          <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
                            <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white">
                              {prettifyCategory(item.category)}
                            </span>
                            <span className="rounded-full bg-amber-400/20 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-amber-100">
                              {prettifyFeedSource(item.feed_source)}
                            </span>
                            <span className="rounded-full bg-black/30 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-100">
                              {item.image_source || "direct-image"}
                            </span>
                          </div>
                        </div>

                        <div className="p-5">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                            {extractHost(item.source_url)}
                          </p>
                          <h4 className="mt-3 text-xl font-semibold leading-8 text-white">
                            {item.title || "Untitled story"}
                          </h4>
                          <div className="mt-5 flex items-center justify-between gap-4">
                            <p className="text-sm text-slate-400">{formatTimestamp(item.fetched_at)}</p>
                            <div className="flex flex-wrap justify-end gap-3">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openAiRewrite(item);
                                }}
                                disabled={aiState.loading}
                                className="rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-300/20 disabled:opacity-60"
                              >
                                Read Article
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className="rounded-[28px] border border-dashed border-white/20 bg-slate-950/20 p-10 text-center text-slate-300">
                No saved stories yet. Run `fetch-news/all?limit=5` from the backend and refresh this page.
              </div>
            )}
          </div>
        </section>

        {readerStory?.ui_hindi ? (
          <section
            id="article-reader"
            className="mt-8 overflow-hidden rounded-[32px] border border-amber-300/20 bg-slate-950/55 backdrop-blur-xl"
          >
            <div className="grid gap-0 lg:grid-cols-[380px_minmax(0,1fr)]">
              <aside className="border-b border-white/10 bg-slate-950/50 lg:border-b-0 lg:border-r lg:border-white/10">
                <div className="relative aspect-[16/10] overflow-hidden bg-slate-900 lg:aspect-auto lg:h-full lg:min-h-[520px]">
                  {readerStory.image_link ? (
                    <DashboardImage
                      imageUrl={readerStory.image_link}
                      alt={readerStory.ui_hindi.title || readerStory.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-full bg-slate-900" aria-hidden="true" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-amber-400/20 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-amber-100">
                        {readerStory.ui_hindi.state || prettifyCategory(readerStory.category)}
                      </span>
                      <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white">
                        {readerStory.ui_hindi.category || prettifyCategory(readerStory.category)}
                      </span>
                    </div>
                  </div>
                </div>
              </aside>

              <article className="px-6 py-8 md:px-8 md:py-10">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-amber-100/80">
                      Published Hindi Article
                    </p>
                    <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl leading-tight text-white md:text-5xl">
                      {readerStory.ui_hindi.title || readerStory.title}
                    </h2>
                    <p className="mt-4 text-sm text-slate-400">
                      {prettifyFeedSource(readerStory.feed_source)} · {formatTimestamp(readerStory.fetched_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReaderStory(null)}
                    className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Source</p>
                    <p className="mt-2 text-sm text-slate-100">{readerStory.ui_hindi.source || readerStory.feed_source}</p>
                  </div>
                  <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">State</p>
                    <p className="mt-2 text-sm text-slate-100">{readerStory.ui_hindi.state || "राष्ट्रीय"}</p>
                  </div>
                  <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Image</p>
                    <p className="mt-2 text-sm text-slate-100">{readerStory.image_link ? "Ready" : "Missing"}</p>
                  </div>
                </div>

                <div className="mt-8 space-y-8">
                  <section>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-100">250 Words</h3>
                    <p className="mt-3 text-base leading-8 text-slate-100">{readerStory.ui_hindi.short_100}</p>
                  </section>
                  <section>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-100">500 Words</h3>
                    <div className="mt-3 space-y-4">
                      {splitUiStoryParagraphs(readerStory.ui_hindi.medium_300).map((paragraph, index) => (
                        <p key={`medium-${index}-${paragraph.slice(0, 20)}`} className="text-base leading-8 text-slate-100">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-100">1000 Words</h3>
                    <div className="mt-3 space-y-4">
                      {splitUiStoryParagraphs(readerStory.ui_hindi.long_500).map((paragraph, index) => (
                        <p key={`long-${index}-${paragraph.slice(0, 20)}`} className="text-base leading-8 text-slate-100">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </section>
                </div>

                <div className="mt-8 flex flex-col gap-4 border-t border-white/10 pt-6 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {(readerStory.ui_hindi.keywords || []).map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-slate-100"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                  <a
                    href={readerStory.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                  >
                    Open Original
                  </a>
                </div>
              </article>
            </div>
          </section>
        ) : null}

        {aiRewrite ? (
          <section className="mt-8 overflow-hidden rounded-[32px] border border-amber-300/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] backdrop-blur-xl">
            <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,186,73,0.18),transparent_38%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(15,23,42,0.82))] px-6 py-8 md:px-8 md:py-10">
              <div data-hero className="max-w-4xl">
                <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-slate-300">
                  <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-amber-100">
                    AI Article
                  </span>
                  <span>{prettifyCategory(aiState.article?.news?.category)}</span>
                  <span>{formatTimestamp(aiState.article?.news?.fetched_at)}</span>
                  <span>{prettifyFeedSource(aiState.article?.news?.feed_source)}</span>
                </div>
                <h2 className="mt-5 max-w-5xl font-[family-name:var(--font-display)] text-4xl leading-tight text-white md:text-5xl">
                  {cleanAiText(aiLanguageBlock?.headline) || "Generated Story"}
                </h2>
                <p className="mt-5 max-w-3xl text-base leading-8 text-slate-200">
                  {cleanAiText(aiLanguageBlock?.short_description) || "No short description generated yet."}
                </p>
              </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="border-b border-white/10 bg-slate-950/45 p-6 lg:sticky lg:top-6 lg:h-fit lg:border-b-0 lg:border-r lg:border-white/10 lg:p-8">
                <div className="overflow-hidden rounded-[24px] border border-white/10 bg-slate-900/70">
                  <div className="relative aspect-[16/11] overflow-hidden bg-slate-900">
                    {aiState.article?.news?.image_link ? (
                      <DashboardImage
                        imageUrl={aiState.article.news.image_link}
                        alt={aiState.article?.news?.title || "AI article image"}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full bg-slate-900" aria-hidden="true" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-200">
                        {cleanAiText(aiState.article?.news?.title) || "Saved source story"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Top Summary</p>
                  <div className="mt-4">
                    {renderSummaryBullets((aiLanguageBlock?.top_summary || []).map(cleanAiText))}
                  </div>
                </div>

                <div className="mt-8 rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-100/80">What To Watch Next</p>
                  <p className="mt-3 text-sm leading-7 text-amber-50">
                    {cleanAiText(aiLanguageBlock?.what_to_watch_next) || "No watch-next section generated yet."}
                  </p>
                </div>
              </aside>

              <article className="px-6 py-8 md:px-8 md:py-10">
                <div className="mx-auto max-w-3xl">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Full Story</p>
                  <div className="mt-6 space-y-5">
                    {splitAiParagraphs(aiLanguageBlock?.long_description).map((paragraph, index) => (
                      <p key={`${index}-${paragraph.slice(0, 20)}`} className="text-base leading-8 text-slate-100 md:text-[17px]">
                        {paragraph}
                      </p>
                    ))}
                    {!splitAiParagraphs(aiLanguageBlock?.long_description).length ? (
                      <p className="text-base leading-8 text-slate-400">
                        No long-form rewrite generated yet.
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

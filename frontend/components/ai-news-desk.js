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

function prettifyCategory(value) {
  return (value || "uncategorized")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getDashboardProxyPath(path) {
  const normalized = String(path || "").startsWith("/") ? path : `/${path}`;
  return `/api/dashboard${normalized}`;
}

function getDisplayImageUrl(imageUrl) {
  if (!imageUrl) {
    return null;
  }

  try {
    const proxyUrl = new URL(getDashboardProxyPath("/image-proxy"), window.location.origin);
    proxyUrl.searchParams.set("url", imageUrl);
    return proxyUrl.toString();
  } catch {
    return imageUrl;
  }
}

function cleanAiText(value) {
  return String(value || "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
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

function buildCardFeed(groups) {
  return groups.flatMap((group) =>
    (group.records || []).map((record) => ({
      ...record,
      groupCategory: group.category,
    }))
  );
}

export default function AiNewsDesk({ aiPayload, aiCronPayload }) {
  const shellRef = useRef(null);
  const articlePanelRef = useRef(null);
  const [liveAiPayload, setLiveAiPayload] = useState(aiPayload);
  const [liveAiCronPayload, setLiveAiCronPayload] = useState(aiCronPayload);
  const groupedRecords = liveAiPayload?.grouped_records || [];
  const flatRecords = useMemo(() => buildCardFeed(groupedRecords), [groupedRecords]);
  const [selectedStoryId, setSelectedStoryId] = useState(null);
  const [activeLanguage, setActiveLanguage] = useState("english");
  const aiScheduler = liveAiCronPayload?.scheduler || null;

  const selectedStory =
    flatRecords.find((item) => item.id === selectedStoryId) || null;
  const englishBlock = selectedStory?.english || null;
  const hindiBlock = selectedStory?.hindi || null;
  const languageBlock = activeLanguage === "hindi" ? hindiBlock : englishBlock;

  useEffect(() => {
    if (!shellRef.current) {
      return undefined;
    }

    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-ai-hero]",
        { autoAlpha: 0, y: 30 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.08,
        }
      );

      gsap.fromTo(
        "[data-ai-card]",
        { autoAlpha: 0, y: 18, scale: 0.985 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.65,
          ease: "power2.out",
          stagger: 0.03,
          delay: 0.1,
        }
      );
    }, shellRef);

    return () => context.revert();
  }, [flatRecords.length]);

  useEffect(() => {
    if (!articlePanelRef.current) {
      return;
    }

    gsap.fromTo(
      articlePanelRef.current,
      { autoAlpha: 0, y: 28 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.55,
        ease: "power3.out",
      }
    );
  }, [selectedStoryId, activeLanguage]);

  useEffect(() => {
    if (!selectedStoryId) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [selectedStoryId]);

  async function refreshAiDesk() {
    try {
      const [newsResponse, cronResponse] = await Promise.all([
        fetch(getDashboardProxyPath("/ai/news/grouped?limit=100"), { cache: "no-store" }),
        fetch(getDashboardProxyPath("/ai/cron/status"), { cache: "no-store" }),
      ]);

      const [newsPayload, cronPayloadNext] = await Promise.all([
        newsResponse.json(),
        cronResponse.json(),
      ]);

      if (newsResponse.ok && newsPayload.status !== "Error") {
        setLiveAiPayload(newsPayload);
      }

      if (cronResponse.ok && cronPayloadNext.status !== "Error") {
        setLiveAiCronPayload(cronPayloadNext);
      }
    } catch {
      // Keep the last rendered AI state visible while the backend reconnects.
    }
  }

  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState !== "visible") {
        return;
      }

      startTransition(() => {
        void refreshAiDesk();
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
  }, []);

  return (
    <main
      ref={shellRef}
      className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.22),transparent_28%),radial-gradient(circle_at_86%_0%,rgba(56,189,248,0.18),transparent_24%),linear-gradient(180deg,#0b1020_0%,#101828_45%,#060b17_100%)]"
    >
      <section className="mx-auto max-w-7xl px-6 pb-14 pt-8 md:px-10 lg:px-12">
        <div
          data-ai-hero
          className="mb-8 flex flex-col gap-6 rounded-[34px] border border-white/10 bg-white/6 p-6 shadow-panel backdrop-blur-xl md:flex-row md:items-end md:justify-between md:p-8"
        >
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex items-center rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-1 text-xs uppercase tracking-[0.3em] text-amber-100">
              The Cliff News AI Desk
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-5xl leading-none text-white md:text-7xl">
              Rewrite Edition
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200 md:text-base">
              Compact AI story cards for fast scanning. Click any card to open the full rewritten article in both English and Hindi.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:min-w-[340px]">
            <a
              href="/"
              className="rounded-2xl bg-amber-400 px-4 py-3 text-center text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-300"
            >
              Open Main Desk
            </a>
            <a
              href={getDashboardProxyPath("/ai/news/grouped?limit=100")}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/15"
            >
              Open AI API
            </a>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <article data-ai-hero className="rounded-[28px] border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-300">AI Stories</p>
            <p className="mt-3 text-4xl font-semibold text-white">{String(flatRecords.length).padStart(2, "0")}</p>
          </article>
          <article data-ai-hero className="rounded-[28px] border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-300">AI Categories</p>
            <p className="mt-3 text-4xl font-semibold text-white">{String(groupedRecords.length).padStart(2, "0")}</p>
          </article>
          <article data-ai-hero className="rounded-[28px] border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-300">AI Scheduler</p>
            <p className="mt-3 text-lg font-semibold text-white">
              {aiScheduler?.enabled ? `Every ${aiScheduler.frequency_minutes} min` : "Disabled"}
            </p>
          </article>
          <article data-ai-hero className="rounded-[28px] border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Last AI Run</p>
            <p className="mt-3 text-sm font-semibold leading-6 text-white">
              {aiScheduler?.lastRunAt ? formatTimestamp(aiScheduler.lastRunAt) : "No AI rewrite cycle yet"}
            </p>
          </article>
        </div>

        <div className="mt-8 rounded-[28px] border border-dashed border-white/20 bg-slate-950/20 p-10 text-center text-slate-300">
          Click any AI card below to open the full rewritten article in both English and Hindi.
        </div>

        <section className="mt-8 rounded-[34px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl md:p-8">
          <div data-ai-hero className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-100/80">AI Story Cards</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-white">
                Compact Rewrite Cards
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-300">
              Cards stay intentionally tight: image, headline, and short description only. Click any one to open the complete rewritten article above.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {flatRecords.map((item) => {
              const cardLanguage = item.english || {};
              const isActive = item.id === selectedStoryId;

              return (
                <button
                  key={item.id}
                  type="button"
                  data-ai-card
                  onClick={() => {
                    setSelectedStoryId(item.id);
                    setActiveLanguage("english");
                  }}
                  className={`group overflow-hidden rounded-[30px] border text-left transition ${
                    isActive
                      ? "border-amber-300/40 bg-amber-300/10 shadow-[0_20px_60px_rgba(245,158,11,0.08)]"
                      : "border-white/10 bg-slate-950/35 hover:-translate-y-1 hover:border-white/20"
                  }`}
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-slate-900">
                    {item.news?.image_link ? (
                      <img
                        src={getDisplayImageUrl(item.news.image_link)}
                        alt={cardLanguage.headline || item.news?.title}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">
                        No image available
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/15 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="h-px bg-gradient-to-r from-amber-300 via-white/60 to-transparent" />
                    </div>
                  </div>

                  <div className="space-y-4 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-100">
                        {prettifyCategory(item.news?.category)}
                      </span>
                      <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        {formatTimestamp(item.updated_at)}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-[family-name:var(--font-display)] text-2xl leading-tight text-white">
                        {cleanAiText(cardLanguage.headline) || item.news?.title || "Generated Story"}
                      </h3>
                      <p className="mt-3 line-clamp-4 text-sm leading-7 text-slate-300">
                        {cleanAiText(cardLanguage.short_description) || "No short description available."}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </section>

      {selectedStory ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md">
          <div
            ref={articlePanelRef}
            className="relative max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[34px] border border-amber-300/20 bg-[#09101d] shadow-[0_30px_120px_rgba(0,0,0,0.45)]"
          >
            <button
              type="button"
              onClick={() => setSelectedStoryId(null)}
              className="absolute right-5 top-5 z-10 rounded-full border border-white/15 bg-black/30 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white transition hover:border-amber-300 hover:text-amber-200"
            >
              Close
            </button>
            <div className="absolute right-28 top-5 z-10 flex gap-2">
              {["english", "hindi"].map((language) => (
                <button
                  key={language}
                  type="button"
                  onClick={() => setActiveLanguage(language)}
                  className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] transition ${
                    activeLanguage === language
                      ? "bg-amber-300 text-slate-950"
                      : "border border-white/15 bg-black/30 text-white hover:border-amber-300 hover:text-amber-200"
                  }`}
                >
                  {language}
                </button>
              ))}
            </div>

            <div className="grid max-h-[92vh] overflow-y-auto lg:grid-cols-[0.85fr_1.15fr]">
              <article className="border-b border-white/10 bg-slate-950/40 lg:border-b-0 lg:border-r">
                <div className="relative aspect-[16/10] overflow-hidden bg-slate-900">
                  {selectedStory.news?.image_link ? (
                    <img
                      src={getDisplayImageUrl(selectedStory.news.image_link)}
                      alt={englishBlock?.headline || selectedStory.news?.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      No image available
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                </div>

                <div className="space-y-5 p-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-amber-400/20 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-amber-100">
                      {prettifyCategory(selectedStory.news?.category)}
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-100">
                      {formatTimestamp(selectedStory.updated_at)}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Top Summary</p>
                    <div className="mt-3">
                      {renderSummaryBullets((languageBlock?.top_summary || []).map(cleanAiText))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Short Description</p>
                    <p className="mt-3 text-sm leading-7 text-slate-100">
                      {cleanAiText(languageBlock?.short_description) || "No short description available."}
                    </p>
                  </div>
                </div>
              </article>

              <article className="p-6 md:p-8">
                <p className="text-xs uppercase tracking-[0.22em] text-amber-100/80">
                  {activeLanguage}
                </p>
                <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-tight text-white md:text-5xl">
                  {cleanAiText(languageBlock?.headline) || selectedStory.news?.title || "Generated Story"}
                </h2>

                <div className="mt-8 space-y-5">
                  {splitAiParagraphs(languageBlock?.long_description).map((paragraph, index) => (
                    <p
                      key={`${activeLanguage}-${index}-${paragraph.slice(0, 28)}`}
                      className="text-[15px] leading-8 text-slate-100 md:text-base"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>

                <div className="mt-8 rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-100/80">What To Watch Next</p>
                  <p className="mt-3 text-sm leading-7 text-amber-50">
                    {cleanAiText(languageBlock?.what_to_watch_next) || "No watch-next section available."}
                  </p>
                </div>
              </article>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

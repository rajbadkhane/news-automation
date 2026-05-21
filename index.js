require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const puppeteer = require("puppeteer");
const sharp = require("sharp");
const {
  createDatabasePool,
  detectDialect,
  isDuplicateColumnError,
} = require("./db");
const {
  createOrUpdateRewriteForRecord,
  findDeliveredAiRewrite,
  initializeAiRewriteStorage,
  listAiRewrites,
  listDeliveredAiRewrites,
  registerAiRewriteRoutes,
  runAiRewriteCycleForCategories,
  setAiRewritePublicationStatus,
} = require("./ai-rewrites");
const {
  loadRetentionConfig,
  runDatabaseRetentionCleanup,
} = require("./retention");
const {
  EDITORIAL_DAILY_LIMIT,
  initializeEditorialStorage,
  listEditorials,
  syncEditorials,
} = require("./editorials");
const {
  initializeRashifalStorage,
  listRashifal,
  syncRashifal,
} = require("./rashifal");
const {
  fetchGoogleRssFeed,
  extractBestImageFromArticle: extractBestImageFromArticleHttp,
} = require("./google-rss-feed-fetcher");
const { createMpInfoRoutes } = require("./routes/mpinfo.routes");
const { crawlLatest } = require("./services/mpinfo-scraper.service");
const {
  DEFAULT_UNIFIED_CATEGORY,
  UNIFIED_NEWS_CATEGORIES,
  createUnifiedNewsArticle,
  getCategoryDisplayName: getUnifiedCategoryDisplayName,
  getCategorySearchQuery,
  normalizeCategory: normalizeUnifiedCategory,
} = require("./config/news-categories");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
const NODE_ENV = process.env.NODE_ENV || "development";
const TRUST_PROXY_ENABLED = !["false", "0", "no"].includes(
  String(process.env.TRUST_PROXY_ENABLED || "true").toLowerCase()
);
if (TRUST_PROXY_ENABLED) {
  app.set("trust proxy", true);
}
const PORT = process.env.PORT || 3000;
const IMAGE_PROXY_MAX_WIDTH = Math.max(320, Number.parseInt(process.env.IMAGE_PROXY_MAX_WIDTH || "1280", 10) || 1280);
const IMAGE_PROXY_WEBP_QUALITY = Math.max(40, Math.min(Number.parseInt(process.env.IMAGE_PROXY_WEBP_QUALITY || "82", 10) || 82, 95));
const IMAGE_PROXY_JPEG_QUALITY = Math.max(40, Math.min(Number.parseInt(process.env.IMAGE_PROXY_JPEG_QUALITY || "88", 10) || 88, 95));
const IMAGE_PROXY_HIGH_MAX_WIDTH = Math.max(IMAGE_PROXY_MAX_WIDTH, Number.parseInt(process.env.IMAGE_PROXY_HIGH_MAX_WIDTH || "1920", 10) || 1920);
const IMAGE_PROXY_HIGH_WEBP_QUALITY = Math.max(80, Math.min(Number.parseInt(process.env.IMAGE_PROXY_HIGH_WEBP_QUALITY || "92", 10) || 92, 95));
const IMAGE_PROXY_HIGH_JPEG_QUALITY = Math.max(80, Math.min(Number.parseInt(process.env.IMAGE_PROXY_HIGH_JPEG_QUALITY || "94", 10) || 94, 95));
const IMAGE_PROXY_TIMEOUT_MS = Math.max(
  3_000,
  Number.parseInt(process.env.IMAGE_PROXY_TIMEOUT_MS || "12000", 10) || 12_000
);
const IMAGE_PROXY_EXTRA_HOSTS = new Set(
  String(
    process.env.IMAGE_PROXY_EXTRA_HOSTS ||
      "c.ndtvimg.com,drop.ndtv.com,images.ctfassets.net,island.lk,www.island.lk,thecliffnews.in,www.thecliffnews.in,cliff-news-backend.onrender.com,static-cdn.toi-media.com,dailypioneer.com,www.dailypioneer.com,pxl-tcdie.terminalfour.net,thehindu.com,www.thehindu.com,cdn.britannica.com"
  )
    .split(",")
    .map((host) => host.trim().toLowerCase().replace(/^www\./, ""))
    .filter(Boolean)
);
const IMAGE_PROXY_EXTRA_HOST_SUFFIXES = String(
  process.env.IMAGE_PROXY_EXTRA_HOST_SUFFIXES ||
    "ndtvimg.com,ctfassets.net,island.lk,thecliffnews.in,toi-media.com,dailypioneer.com,terminalfour.net,thehindu.com,britannica.com,espncdn.com,upstox.com,weforum.org,nvidia.com,arcpublishing.com,buzzrx.com,cnet.com,cpr.org,dailyfarmer.in,financialexpressdigital.com,gizbot.com,icc-cricket.com,moneycontrol.com,theconversation.com,jagranimages.com,kotaku.com,livemint.com,economictimes.com,futurism.com,geographical.co.uk,imgix.net,cnn.com,licdn.com,medicaldialogues.in,theverge.com,yimg.com,ytimg.com,b-cdn.net,91mobiles.com,thenewsmill.com,cgtn.com,cfr.org,wikimedia.org,aljazeera.com"
)
  .split(",")
  .map((host) => host.trim().toLowerCase().replace(/^www\./, ""))
  .filter(Boolean);
const DB_HOST = process.env.DB_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "gautam_news_bot";
const DB_DIALECT = detectDialect();
const BROWSER_EXECUTABLE_PATH = process.env.BROWSER_EXECUTABLE_PATH || null;
const SCHEDULER_ENABLED = !["false", "0", "no"].includes(
  String(process.env.SCHEDULER_ENABLED || "true").toLowerCase()
);
const AI_SCHEDULER_ENABLED = !["false", "0", "no"].includes(
  String(process.env.AI_SCHEDULER_ENABLED || "true").toLowerCase()
);
const SCHEDULER_GOOGLE_RSS_ENABLED = !["false", "0", "no"].includes(
  String(process.env.SCHEDULER_GOOGLE_RSS_ENABLED || "true").toLowerCase()
);
const MPINFO_DISTRICT_SCHEDULER_ENABLED = !["false", "0", "no"].includes(
  String(process.env.MPINFO_DISTRICT_SCHEDULER_ENABLED || "false").toLowerCase()
);
const MPINFO_DISTRICT_BROWSER_ENABLED = ["true", "1", "yes"].includes(
  String(process.env.MPINFO_DISTRICT_BROWSER_ENABLED || "").toLowerCase()
);
const LEGACY_PUBLIC_ROUTES_ENABLED = ["true", "1", "yes"].includes(
  String(process.env.LEGACY_PUBLIC_ROUTES_ENABLED || "").toLowerCase()
);
const API_VERSION = "v1";
const API_BASE_PATH = `/api/${API_VERSION}`;
const API_KEYS = String(process.env.API_KEYS || "local-dev-key")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const MASTER_API_KEY = String(process.env.MASTER_API_KEY || API_KEYS[0] || "").trim();
const LEGACY_API_KEYS_AS_MASTER_ENABLED = NODE_ENV !== "production" || ["true", "1", "yes"].includes(
  String(process.env.LEGACY_API_KEYS_AS_MASTER_ENABLED || "").toLowerCase()
);
const API_CORS_ORIGINS = String(process.env.API_CORS_ORIGINS || "*")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const REDIS_URL = String(
  process.env.REDIS_URL
  || process.env.UPSTASH_REDIS_REST_URL
  || process.env.UPSTASH_REDIS_URL
  || ""
).trim();
const DASHBOARD_CACHE_TTL_SECONDS = Math.max(5, Number.parseInt(process.env.DASHBOARD_CACHE_TTL_SECONDS, 10) || 30);
const STATUS_CACHE_TTL_SECONDS = Math.max(5, Number.parseInt(process.env.STATUS_CACHE_TTL_SECONDS, 10) || 10);
const RSS_FEED_CACHE_TTL_SECONDS = Math.max(30, Number.parseInt(process.env.RSS_FEED_CACHE_TTL_SECONDS, 10) || 300);
const RSS_REQUEST_TIMEOUT_MS = Math.max(
  5_000,
  Number.parseInt(process.env.RSS_REQUEST_TIMEOUT_MS, 10) || 15_000
);
const ARTICLE_METADATA_TIMEOUT_MS = Math.max(
  RSS_REQUEST_TIMEOUT_MS,
  Number.parseInt(process.env.ARTICLE_METADATA_TIMEOUT_MS, 10) || 30_000
);
const ARTICLE_IMAGE_RENDER_WAIT_MS = Math.max(
  1_000,
  Number.parseInt(process.env.ARTICLE_IMAGE_RENDER_WAIT_MS, 10) || 6_000
);
const CLIFF_NEWS_API_URL = String(
  process.env.CLIFF_NEWS_API_URL || "https://cliff-news-backend.onrender.com/api/articles"
).trim();
const CLIFF_NEWS_PUBLIC_BASE_URL = String(
  process.env.CLIFF_NEWS_PUBLIC_BASE_URL || "https://www.thecliffnews.in"
).trim().replace(/\/+$/, "");
const CLIFF_NEWS_LANGUAGE = String(process.env.CLIFF_NEWS_LANGUAGE || "ENGLISH").trim().toUpperCase();
const CLIFF_NEWS_PRIMARY_ENABLED = !["false", "0", "no"].includes(
  String(process.env.CLIFF_NEWS_PRIMARY_ENABLED || "true").toLowerCase()
);
const CLIFF_NEWS_DEFAULT_LIMIT = Math.max(
  1,
  Math.min(Number.parseInt(process.env.CLIFF_NEWS_DEFAULT_LIMIT || "100", 10) || 100, 500)
);
const NEWS_MAX_AGE_HOURS = Math.max(
  1,
  Math.min(Number.parseInt(process.env.NEWS_MAX_AGE_HOURS || "24", 10) || 24, 168)
);
const NEWS_REQUIRE_PUBLISHED_DATE = !["false", "0", "no"].includes(
  String(process.env.NEWS_REQUIRE_PUBLISHED_DATE || "true").toLowerCase()
);
const CLIFF_NEWS_REQUEST_TIMEOUT_MS = Math.max(
  5_000,
  Number.parseInt(process.env.CLIFF_NEWS_REQUEST_TIMEOUT_MS, 10) || RSS_REQUEST_TIMEOUT_MS
);
const CLIFF_NEWS_CATEGORY_ENDPOINTS = String(process.env.CLIFF_NEWS_CATEGORY_ENDPOINTS || "")
  .split(",")
  .map((endpoint) => endpoint.trim())
  .filter(Boolean);
const THENEWSAPI_CATEGORIES = String(
  process.env.THENEWSAPI_CATEGORIES ||
    "general,science,sports,business,health,entertainment,tech,politics,food,travel"
)
  .split(",")
  .map((category) => category.trim())
  .filter(Boolean);
const ARTICLE_CANDIDATE_MULTIPLIER = Math.max(1, Number.parseInt(process.env.ARTICLE_CANDIDATE_MULTIPLIER, 10) || 2);
const ARTICLE_CANDIDATE_CAP = Math.max(4, Number.parseInt(process.env.ARTICLE_CANDIDATE_CAP, 10) || 10);
const FEED_QUEUE_MULTIPLIER = Math.max(1, Number.parseInt(process.env.FEED_QUEUE_MULTIPLIER, 10) || 1);
const FEED_QUEUE_CAP = Math.max(3, Number.parseInt(process.env.FEED_QUEUE_CAP, 10) || 6);
const EXPENSIVE_SOURCE_MIN_INTERVAL_MS = Math.max(
  60_000,
  Number.parseInt(process.env.EXPENSIVE_SOURCE_MIN_INTERVAL_MS, 10) || 30 * 60 * 1000
);
const EXPENSIVE_SOURCE_BLOCK_COOLDOWN_MS = Math.max(
  5 * 60_000,
  Number.parseInt(process.env.EXPENSIVE_SOURCE_BLOCK_COOLDOWN_MS, 10) || 2 * 60 * 60 * 1000
);
const parsedExpensiveSourcePerRunLimit = Number.parseInt(process.env.EXPENSIVE_SOURCE_PER_RUN_LIMIT, 10);
const EXPENSIVE_SOURCE_PER_RUN_LIMIT = Math.max(
  0,
  Number.isFinite(parsedExpensiveSourcePerRunLimit) ? parsedExpensiveSourcePerRunLimit : 1
);
const API_RATE_LIMIT_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60_000);
const API_RATE_LIMIT_MAX = Number(process.env.API_RATE_LIMIT_MAX || 120);
const MAIN_SCHEDULER_LOCK_NAME = `${DB_NAME}:main-scheduler`;
const AI_SCHEDULER_LOCK_NAME = `${DB_NAME}:ai-scheduler`;
const MPINFO_DISTRICT_SCHEDULER_LOCK_NAME = `${DB_NAME}:mpinfo-district-scheduler`;
const INGESTION_WORKER_LOCK_NAME = `${DB_NAME}:ingestion-worker`;
const RETENTION_CLEANUP_LOCK_NAME = `${DB_NAME}:retention-cleanup`;
const AVAILABLE_API_SCOPES = [
  "news:read",
  "delivery:read",
  "feeds:read",
  "sync:write",
  "cron:read",
  "cron:write",
  "ai:read",
  "ai:write",
  "logs:read",
  "admin:clients",
];
const DEFAULT_CATEGORY = DEFAULT_UNIFIED_CATEGORY;
const MPINFO_DISTRICT_CATEGORY = normalizeUnifiedCategory(
  process.env.MPINFO_DISTRICT_CATEGORY || "Madhyapradesh"
);
const INDIA_TIMEZONE = "Asia/Kolkata";
const EXPENSIVE_NEWS_SOURCES = new Set();
const GOVERNMENT_NEWS_SOURCES = new Set(["dd", "pib", "mpinfo"]);
const PRIMARY_RSS_SOURCES = ["dd", "mpinfo"];
const PRIMARY_NEWS_SOURCE_STRATEGY = ["cliff-news", "google-rss", ...PRIMARY_RSS_SOURCES];
const STATE_GOV_SOURCE_ALLOWLIST = new Set(
  String(process.env.STATE_GOV_SOURCE_ALLOWLIST || "kerala-gov,haryana-gov,cg-gov")
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean)
);
const RAW_STATE_GOV_SOURCES = [
  { state: "उत्तर प्रदेश", source: "up-gov", url: "https://information.up.gov.in/en" },
  { state: "महाराष्ट्र", source: "maharashtra-gov", url: "https://dgipr.maharashtra.gov.in/" },
  { state: "गुजरात", source: "gujarat-gov", url: "https://gujaratindia.gov.in" },
  { state: "राजस्थान", source: "rajasthan-gov", url: "https://dipr.rajasthan.gov.in/" },
  { state: "बिहार", source: "bihar-gov", url: "https://state.bihar.gov.in/prdbihar/" },
  { state: "पश्चिम बंगाल", source: "wb-gov", url: "https://www.wb.gov.in/press-release.aspx" },
  { state: "तमिलनाडु", source: "tn-gov", url: "https://tn.gov.in" },
  { state: "कर्नाटक", source: "karnataka-gov", url: "https://karnataka.gov.in" },
  { state: "केरल", source: "kerala-gov", url: "https://kerala.gov.in" },
  { state: "तेलंगाना", source: "telangana-gov", url: "https://www.telangana.gov.in/news/press-releases/" },
  { state: "आंध्र प्रदेश", source: "ap-gov", url: "https://ipr.ap.gov.in/" },
  { state: "पंजाब", source: "punjab-gov", url: "https://punjab.gov.in" },
  { state: "हरियाणा", source: "haryana-gov", url: "https://lokbhavan.haryana.gov.in/" },
  { state: "छत्तीसगढ़", source: "cg-gov", url: "https://jansampark.cg.gov.in/" },
  { state: "ओडिशा", source: "odisha-gov", url: "https://odisha.gov.in/en/state-news" },
];
const STATE_GOV_SOURCES = RAW_STATE_GOV_SOURCES
  .filter((item) => STATE_GOV_SOURCE_ALLOWLIST.has("all") || STATE_GOV_SOURCE_ALLOWLIST.has(item.source))
  .map((item) => ({ ...item, type: "state-gov", source_category: "state", source_state: item.state }));

const RSS_SOURCE_FEEDS = [
  { source: "pib", url: "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1", source_category: "national" },
  { source: "mpinfo", url: "https://mpinfo.org/RSSFeed/RSSFeed_News.xml", source_category: "mpinfo" },
  { source: "dd", url: "https://ddnews.gov.in/en/category/national/feed/" },
  { source: "dd", url: "https://ddnews.gov.in/en/category/top-stories/feed/" },
  { source: "dd", url: "https://ddnews.gov.in/en/category/international/feed/" },
  { source: "dd", url: "https://ddnews.gov.in/en/category/business-economy/feed/" },
  { source: "dd", url: "https://ddnews.gov.in/en/category/sports/feed/" },
  ...STATE_GOV_SOURCES,
];

function extractSourceCategoryFromUrl(feedUrl) {
  try {
    const parsed = new URL(feedUrl);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment).trim())
      .filter(Boolean);
    const categoryIndex = segments.findIndex((segment) => segment.toLowerCase() === "category");
    if (categoryIndex >= 0 && segments[categoryIndex + 1]) {
      return segments[categoryIndex + 1];
    }

    const signal = segments.find((segment) => /news|national|international|business|economy|sports|entertainment|state|top/i.test(segment));
    return signal || "";
  } catch {
    return "";
  }
}

function getFeedSourceCategory(feedConfig) {
  return String(
    feedConfig?.source_category ||
      feedConfig?.category ||
      extractSourceCategoryFromUrl(feedConfig?.url) ||
      feedConfig?.source ||
      DEFAULT_CATEGORY
  ).trim();
}

function buildRssFeedsByCategory(feedConfigs = RSS_SOURCE_FEEDS) {
  return feedConfigs.reduce((accumulator, feedConfig) => {
    const sourceCategory = getFeedSourceCategory(feedConfig);
    const normalizedCategory = normalizeUnifiedCategory(sourceCategory, {
      source: feedConfig?.source || "rss",
      logger: console,
    });
    if (!accumulator[normalizedCategory]) {
      accumulator[normalizedCategory] = [];
    }

    accumulator[normalizedCategory].push({
      ...feedConfig,
      source_category: sourceCategory,
      normalized_category: normalizedCategory,
    });
    return accumulator;
  }, Object.fromEntries(UNIFIED_NEWS_CATEGORIES.map((category) => [category, []])));
}

const RSS_FEEDS = buildRssFeedsByCategory();
const CATEGORY_FEED_GROUPS = Object.fromEntries(UNIFIED_NEWS_CATEGORIES.map((category) => [category, []]));
const DELIVERY_CATEGORY_ORDER = UNIFIED_NEWS_CATEGORIES;
const RSS_REQUEST_PROFILES = [
  {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-IN,en;q=0.9",
    Referer: "https://www.google.com/",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },
  {
    "User-Agent":
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://news.google.com/",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },
];
const sourceThrottleState = new Map();
function isExpensiveNewsSource(feedConfig) {
  return EXPENSIVE_NEWS_SOURCES.has(feedConfig?.source);
}

function getFeedThrottleKey(feedConfig) {
  return `${feedConfig?.source || "unknown"}:${feedConfig?.url || ""}`;
}

function getFeedThrottleState(feedConfig) {
  const key = getFeedThrottleKey(feedConfig);
  if (!sourceThrottleState.has(key)) {
    sourceThrottleState.set(key, {
      lastAttemptAt: 0,
      cooldownUntil: 0,
      lastStatus: null,
    });
  }

  return sourceThrottleState.get(key);
}

function getFeedThrottleReason(feedConfig) {
  if (!isExpensiveNewsSource(feedConfig)) {
    return null;
  }

  const now = Date.now();
  const state = getFeedThrottleState(feedConfig);
  if (state.cooldownUntil > now) {
    return `cooldown for ${Math.ceil((state.cooldownUntil - now) / 60_000)}m after ${state.lastStatus || "block"}`;
  }

  const nextAllowedAt = state.lastAttemptAt + EXPENSIVE_SOURCE_MIN_INTERVAL_MS;
  if (nextAllowedAt > now) {
    return `rate limit for ${Math.ceil((nextAllowedAt - now) / 60_000)}m`;
  }

  return null;
}

function markFeedAttempt(feedConfig) {
  if (!isExpensiveNewsSource(feedConfig)) {
    return;
  }

  const state = getFeedThrottleState(feedConfig);
  state.lastAttemptAt = Date.now();
}

function markFeedSuccess(feedConfig) {
  if (!isExpensiveNewsSource(feedConfig)) {
    return;
  }

  const state = getFeedThrottleState(feedConfig);
  state.cooldownUntil = 0;
  state.lastStatus = "ok";
}

function markFeedBlocked(feedConfig, status) {
  if (!isExpensiveNewsSource(feedConfig)) {
    return;
  }

  const state = getFeedThrottleState(feedConfig);
  state.cooldownUntil = Date.now() + EXPENSIVE_SOURCE_BLOCK_COOLDOWN_MS;
  state.lastStatus = status ? `status ${status}` : "network error";
}

function getExpensiveSourceThrottlePayload() {
  return {
    sources: Array.from(EXPENSIVE_NEWS_SOURCES),
    min_interval_ms: EXPENSIVE_SOURCE_MIN_INTERVAL_MS,
    block_cooldown_ms: EXPENSIVE_SOURCE_BLOCK_COOLDOWN_MS,
    per_run_limit: EXPENSIVE_SOURCE_PER_RUN_LIMIT,
    active_state: Object.fromEntries(
      Array.from(sourceThrottleState.entries()).map(([key, state]) => [
        key,
        {
          last_attempt_at: state.lastAttemptAt ? new Date(state.lastAttemptAt).toISOString() : null,
          cooldown_until: state.cooldownUntil ? new Date(state.cooldownUntil).toISOString() : null,
          last_status: state.lastStatus,
        },
      ])
    ),
  };
}

function getFeedPriority(feedConfig) {
  const source = String(feedConfig?.source || "").toLowerCase();

  if (source === "dd") {
    return 0;
  }

  if (source === "mpinfo") {
    return 1;
  }

  if (source === "pib") {
    return 2;
  }

  if (feedConfig?.type === "state-gov") {
    return 3;
  }

  if (isExpensiveNewsSource(feedConfig)) {
    return 5;
  }

  return 4;
}

function sortFeedsByPriority(feedConfigs) {
  return [...feedConfigs].sort((left, right) => {
    const priorityDiff = getFeedPriority(left) - getFeedPriority(right);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return String(left?.source || "").localeCompare(String(right?.source || ""));
  });
}

function normalizeFeedSourceList(values = []) {
  return Array.isArray(values)
    ? values
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
    : [];
}

function buildEmptyCategoryFetchResult(category) {
  return {
    category,
    fetched_count: 0,
    saved_count: 0,
    failed_count: 0,
    skipped_count: 0,
    results: [],
  };
}

function buildFetchStepErrorResult(category, feedSource, error) {
  return {
    category,
    fetched_count: 0,
    saved_count: 0,
    failed_count: 1,
    skipped_count: 0,
    results: [
      {
        status: "Error",
        category,
        feed_source: feedSource,
        feed_url: null,
        source: null,
        message: error.message,
      },
    ],
  };
}

function compactText(value = "") {
  return decodeHtmlEntities(String(value || ""))
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeArticleBodyText(value = "") {
  return compactText(value)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_`>]+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateForStorage(value, maxLength) {
  const text = compactText(value);
  if (!maxLength || text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength).trim();
}

function parseNullableDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeStoredSourceUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    for (const key of Array.from(parsed.searchParams.keys())) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.startsWith("utm_") ||
        ["fbclid", "gclid", "gbraid", "wbraid", "mc_cid", "mc_eid", "ref", "ref_src"].includes(normalizedKey)
      ) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.href;
  } catch {
    return raw.replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

function normalizeNewsTitleSignature(value) {
  const normalized = normalizeRssText(value)
    .toLowerCase()
    .replace(/\s*[-|:]\s*(breaking news|latest news|live updates?|news|the cliff news|google news)\s*$/gi, "")
    .replace(/['"`’‘“”]/g, "")
    .replace(/[^a-z0-9\u0900-\u097f]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length >= 24 ? normalized.slice(0, 220) : "";
}

function isFreshPublishedDate(value, maxAgeHours = NEWS_MAX_AGE_HOURS) {
  const publishedAt = value instanceof Date ? value : parseNullableDate(value);
  if (!publishedAt) {
    return {
      fresh: !NEWS_REQUIRE_PUBLISHED_DATE,
      publishedAt: null,
      known: false,
      ageHours: null,
      reason: NEWS_REQUIRE_PUBLISHED_DATE ? "missing-published-date" : null,
    };
  }

  const ageMs = Date.now() - publishedAt.getTime();
  if (ageMs < 0) {
    return { fresh: true, publishedAt, known: true };
  }

  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  return {
    fresh: ageMs <= maxAgeMs,
    publishedAt,
    known: true,
    ageHours: Math.floor(ageMs / (60 * 60 * 1000)),
  };
}

function buildFreshnessSkipMessage(freshness) {
  if (!freshness?.known) {
    return `Article skipped because it has no publish date; latest-only mode requires a date within ${NEWS_MAX_AGE_HOURS}h.`;
  }

  return `Old article skipped (${freshness.ageHours}h old; max ${NEWS_MAX_AGE_HOURS}h).`;
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function sanitizeArticleImageUrl(value) {
  const normalized = String(value || "").trim();
  if (!normalized || !isHttpUrl(normalized) || isLikelyDecorativeImageUrl(normalized)) {
    return null;
  }

  return normalized;
}

function getBlockedArticleImageReason(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  if (
    normalized.includes("overlay-base64=") ||
    normalized.includes("overlay-width=") ||
    normalized.includes("overlay-align=") ||
    normalized.includes("/overlays/") ||
    normalized.includes("tg-live.png") ||
    /(?:^|[/?&_.-])(?:live|logo|watermark|brand|branding)(?:[/?&_.=-]|$)/.test(normalized)
  ) {
    return "logo/watermark overlay image";
  }

  return "";
}

function isBlockedArticleImageUrl(value) {
  return Boolean(getBlockedArticleImageReason(value));
}

function getNestedString(source, paths = []) {
  for (const path of paths) {
    const value = path
      .split(".")
      .reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), source);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function getNestedValue(source, paths = []) {
  for (const path of paths) {
    const value = path
      .split(".")
      .reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), source);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function extractImageUrlValue(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const imageUrl = extractImageUrlValue(item);
      if (imageUrl) {
        return imageUrl;
      }
    }
    return "";
  }

  if (typeof value === "object") {
    return extractImageUrlValue(
      value.url
        || value.src
        || value.secure_url
        || value.imageUrl
        || value.image
        || value.original
        || value.large
        || value.medium
        || value.thumbnail
    );
  }

  return "";
}

function normalizeCliffNewsCategory(article) {
  const rawCategory = getNestedString(article, [
    "category.slug",
    "category.name",
    "categoryName",
    "categorySlug",
    "category",
  ]);
  return normalizeUnifiedCategory(rawCategory, { source: "cliff-news", logger: console });
}

function shouldIncludeCliffNewsArticle(article, requestedCategory) {
  if (!requestedCategory) {
    return true;
  }

  const articleCategory = normalizeCliffNewsCategory(article);
  return articleCategory === requestedCategory;
}

function getCliffNewsArticleUrl(article) {
  const directUrl = getNestedString(article, [
    "url",
    "link",
    "canonicalUrl",
    "sourceUrl",
    "publicUrl",
  ]);
  if (isHttpUrl(directUrl)) {
    return directUrl;
  }

  const slug = getNestedString(article, ["slug", "articleSlug"]);
  if (slug && CLIFF_NEWS_PUBLIC_BASE_URL) {
    const languageSegment = String(article?.language || CLIFF_NEWS_LANGUAGE).toUpperCase() === "HINDI" ? "hi" : "en";
    return `${CLIFF_NEWS_PUBLIC_BASE_URL}/${languageSegment}/article/${encodeURIComponent(slug)}`;
  }

  const articleId = getNestedString(article, ["id", "_id"]);
  return articleId ? `${CLIFF_NEWS_API_URL.replace(/\/+$/, "")}/${encodeURIComponent(articleId)}` : "";
}

function getCliffNewsImageUrl(article) {
  const imageValue = getNestedValue(article, [
    "featuredImage",
    "ogImage",
    "meta.ogImage",
    "meta.image",
    "seo.ogImage",
    "seo.image",
    "image",
    "imageUrl",
    "coverImage",
    "cover.image",
    "heroImage",
    "hero.image",
    "thumbnail",
    "media.image",
    "media.url",
    "media",
    "images",
  ]);
  const imageUrl = extractImageUrlValue(imageValue);

  return sanitizeArticleImageUrl(imageUrl) || "";
}

function normalizeCliffNewsArticle(article) {
  const title = getNestedString(article, ["title", "headline", "name"]);
  const articleUrl = getCliffNewsArticleUrl(article);
  if (!title || !articleUrl) {
    return null;
  }

  const contentText = normalizeArticleBodyText(
    getNestedString(article, ["content", "body", "article", "markdown", "description"])
  );
  const explicitExcerpt = getNestedString(article, [
    "excerpt",
    "summary",
    "metaDescription",
    "description",
    "shortDescription",
  ]);
  const excerpt = truncateForStorage(explicitExcerpt || contentText, 1000);
  const category = normalizeCliffNewsCategory(article);
  const imageUrl = getCliffNewsImageUrl(article);
  const publishedAt = parseNullableDate(
    getNestedString(article, [
      "publishedAt",
      "published_at",
      "publishDate",
      "publish_date",
      "publishedDate",
      "published_date",
      "publishedOn",
      "published_on",
      "date",
      "createdAt",
      "created_at",
    ])
  );

  return {
    sourceId: getNestedString(article, ["id", "_id", "sourceArticleId", "slug"]),
    category,
    title,
    articleUrl,
    imageUrl,
    imageSource: imageUrl ? (article?.featuredImage ? "cliff-featured-image" : article?.ogImage ? "cliff-og-image" : "cliff-image") : null,
    excerpt,
    contentText,
    publishedAt,
  };
}

function normalizeCliffNewsPage(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

function buildCliffNewsApiRequestUrl({ limit = CLIFF_NEWS_DEFAULT_LIMIT, language = CLIFF_NEWS_LANGUAGE, page = 1 } = {}) {
  const requestUrl = new URL(CLIFF_NEWS_API_URL);
  requestUrl.searchParams.set("limit", String(Math.max(1, Math.min(Number.parseInt(limit, 10) || CLIFF_NEWS_DEFAULT_LIMIT, 500))));
  requestUrl.searchParams.set("page", String(normalizeCliffNewsPage(page)));
  if (language) {
    requestUrl.searchParams.set("language", String(language).trim().toUpperCase());
  }

  return requestUrl.href;
}

async function fetchCliffNewsApiArticles({ limit = CLIFF_NEWS_DEFAULT_LIMIT, language = CLIFF_NEWS_LANGUAGE, page = 1 } = {}) {
  const requestUrl = buildCliffNewsApiRequestUrl({ limit, language, page });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLIFF_NEWS_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Cliff News API request failed with status ${response.status}.`);
    }

    const payload = await response.json();
    const articles = Array.isArray(payload?.articles)
      ? payload.articles
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];

    return {
      request_url: requestUrl,
      payload_count: articles.length,
      pagination: payload?.pagination || null,
      articles,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildCliffCategoryEndpointCandidates() {
  if (CLIFF_NEWS_CATEGORY_ENDPOINTS.length) {
    return CLIFF_NEWS_CATEGORY_ENDPOINTS;
  }

  try {
    const apiUrl = new URL(CLIFF_NEWS_API_URL);
    const basePath = apiUrl.pathname.replace(/\/articles\/?$/i, "").replace(/\/+$/, "");
    return [
      new URL(`${basePath}/categories`, apiUrl.origin).href,
      new URL(`${basePath}/category`, apiUrl.origin).href,
      new URL(`${basePath}/article-categories`, apiUrl.origin).href,
    ];
  } catch {
    return [];
  }
}

function extractSourceCategoryStrings(value, output = new Set()) {
  if (!value) {
    return output;
  }

  if (typeof value === "string") {
    if (value.trim()) {
      output.add(value.trim());
    }
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractSourceCategoryStrings(item, output);
    }
    return output;
  }

  if (typeof value === "object") {
    const directValue = value.slug || value.name || value.category || value.categorySlug || value.categoryName;
    if (typeof directValue === "string" && directValue.trim()) {
      output.add(directValue.trim());
    }

    for (const key of ["categories", "data", "items", "results", "articles"]) {
      if (value[key]) {
        extractSourceCategoryStrings(value[key], output);
      }
    }
  }

  return output;
}

async function fetchJsonWithTimeout(url, timeoutMs = CLIFF_NEWS_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Category endpoint returned status ${response.status}.`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverCliffNewsSourceCategories() {
  const discovered = new Set();
  const endpoints = buildCliffCategoryEndpointCandidates();
  const endpointResults = [];

  for (const endpoint of endpoints) {
    try {
      const payload = await fetchJsonWithTimeout(endpoint);
      extractSourceCategoryStrings(payload, discovered);
      endpointResults.push({ endpoint, status: "Success" });
      if (discovered.size > 0) {
        break;
      }
    } catch (error) {
      endpointResults.push({ endpoint, status: "Error", message: error.message });
    }
  }

  if (discovered.size === 0) {
    try {
      const sample = await fetchCliffNewsApiArticles({
        limit: Math.min(CLIFF_NEWS_DEFAULT_LIMIT, 100),
        language: CLIFF_NEWS_LANGUAGE,
        page: 1,
      });
      for (const article of sample.articles || []) {
        extractSourceCategoryStrings(
          getNestedValue(article, [
            "category.slug",
            "category.name",
            "categoryName",
            "categorySlug",
            "category",
          ]),
          discovered
        );
      }
      endpointResults.push({ endpoint: sample.request_url, status: "SampledArticles", count: discovered.size });
    } catch (error) {
      endpointResults.push({ endpoint: CLIFF_NEWS_API_URL, status: "Error", message: error.message });
    }
  }

  return {
    source: "cliff-news",
    endpoint_results: endpointResults,
    source_categories: Array.from(discovered).sort((left, right) => left.localeCompare(right)),
  };
}

function buildSourceCategoryEntry(source, sourceCategory, detail = {}) {
  return {
    source,
    source_category: sourceCategory,
    normalized_category: normalizeUnifiedCategory(sourceCategory, { source }),
    ...detail,
  };
}

async function buildCategoryCatalogPayload() {
  const rssEntries = RSS_SOURCE_FEEDS.map((feed) => buildSourceCategoryEntry(
    feed.source || "rss",
    getFeedSourceCategory(feed),
    { feed_url: feed.url || null, source_state: feed.source_state || null }
  ));
  const theNewsEntries = THENEWSAPI_CATEGORIES.map((category) => buildSourceCategoryEntry("thenewsapi", category));
  const cliffDiscovery = await discoverCliffNewsSourceCategories();
  const cliffEntries = cliffDiscovery.source_categories.map((category) => buildSourceCategoryEntry("cliff-news", category));
  const sourceCategories = [...rssEntries, ...theNewsEntries, ...cliffEntries];
  const grouped = Object.fromEntries(UNIFIED_NEWS_CATEGORIES.map((category) => [category, []]));

  for (const item of sourceCategories) {
    grouped[item.normalized_category].push({
      source: item.source,
      source_category: item.source_category,
      feed_url: item.feed_url || null,
      source_state: item.source_state || null,
    });
  }

  return {
    status: "Success",
    final_categories: UNIFIED_NEWS_CATEGORIES,
    default_category: DEFAULT_CATEGORY,
    grouped_source_categories: grouped,
    source_categories: sourceCategories,
    discovery: {
      cliff_news: cliffDiscovery,
      thenewsapi: {
        source: "thenewsapi",
        note: "TheNewsAPI exposes supported categories as API filter values; configure THENEWSAPI_CATEGORIES to override.",
        source_categories: THENEWSAPI_CATEGORIES,
      },
      rss: {
        source: "rss",
        source_categories: rssEntries,
      },
    },
  };
}

let dbPool;
const DEFAULT_ARTICLE_LIMIT = 5;
const MAX_ARTICLE_LIMIT = 500;
const DEFAULT_TOTAL_LIMIT = 200;
const MAX_TOTAL_LIMIT = 5000;
const DAILY_NEWS_FETCH_LIMIT = Math.max(
  1,
  Math.min(Number.parseInt(process.env.DAILY_NEWS_FETCH_LIMIT || "450", 10) || 450, 1000)
);
const SCHEDULER_ACTIVE_START_HOUR = Math.max(
  0,
  Math.min(Number.parseInt(process.env.SCHEDULER_ACTIVE_START_HOUR || "0", 10) || 0, 23)
);
const SCHEDULER_ACTIVE_END_HOUR = Math.max(
  0,
  Math.min(Number.parseInt(process.env.SCHEDULER_ACTIVE_END_HOUR || "0", 10) || 0, 23)
);
const QUIET_HOUR_START = SCHEDULER_ACTIVE_END_HOUR;
const QUIET_HOUR_END = SCHEDULER_ACTIVE_START_HOUR;
const SCHEDULER_PEAK_WINDOWS = [
  { startHour: 9, endHour: 15 },
  { startHour: 18, endHour: 24 },
];
const SCHEDULER_PEAK_WEIGHT = Math.max(1, Number.parseFloat(process.env.SCHEDULER_PEAK_WEIGHT || "4") || 4);
const SCHEDULER_TICK_MS = 30 * 1000;
const AI_SCHEDULER_TICK_MS = 30 * 1000;
const SCHEDULER_CATEGORY_TIMEOUT_MS = Math.max(
  60_000,
  Number.parseInt(process.env.SCHEDULER_CATEGORY_TIMEOUT_MS, 10) || 4 * 60 * 1000
);
const SCHEDULER_ARTICLES_PER_CATEGORY_RUN = Math.max(
  1,
  Math.min(Number.parseInt(process.env.SCHEDULER_ARTICLES_PER_CATEGORY_RUN, 10) || 5, 5)
);
const SCHEDULER_PRIMARY_SOURCE_LIMIT = Math.max(
  1,
  Math.min(Number.parseInt(process.env.SCHEDULER_PRIMARY_SOURCE_LIMIT, 10) || 3, 5)
);
const STALE_SCHEDULER_RUN_MS = Math.max(
  5 * 60_000,
  Number.parseInt(process.env.STALE_SCHEDULER_RUN_MS, 10) || 5 * 60 * 1000
);
const SCHEDULER_HEALTH_THRESHOLD_MS = 2 * SCHEDULER_TICK_MS + 15 * 1000;
const AI_SCHEDULER_HEALTH_THRESHOLD_MS = 2 * AI_SCHEDULER_TICK_MS + 15 * 1000;
const MPINFO_DISTRICT_SCHEDULER_INTERVAL_MS = Math.max(
  15 * 60 * 1000,
  Number.parseInt(process.env.MPINFO_DISTRICT_SCHEDULER_INTERVAL_MS, 10) || 60 * 60 * 1000
);
const MPINFO_DISTRICT_SCHEDULER_TIMEOUT_MS = Math.max(
  5 * 60 * 1000,
  Number.parseInt(process.env.MPINFO_DISTRICT_SCHEDULER_TIMEOUT_MS, 10) || 20 * 60 * 1000
);
const MPINFO_DISTRICT_SCHEDULER_LIMIT = Math.max(
  1,
  Math.min(Number.parseInt(process.env.MPINFO_DISTRICT_SCHEDULER_LIMIT, 10) || 1, 3)
);
const MPINFO_DISTRICT_SCHEDULER_SCAN_LIMIT = Math.max(
  1,
  Math.min(Number.parseInt(process.env.MPINFO_DISTRICT_SCHEDULER_SCAN_LIMIT, 10) || 1, 55)
);
const MPINFO_DISTRICT_SCHEDULER_REWRITE = !["false", "0", "no"].includes(
  String(process.env.MPINFO_DISTRICT_SCHEDULER_REWRITE || "true").toLowerCase()
);
const MPINFO_DISTRICT_SCHEDULER_STARTUP_RUN = ["true", "1", "yes"].includes(
  String(process.env.MPINFO_DISTRICT_SCHEDULER_STARTUP_RUN || "").toLowerCase()
);
const WATCHDOG_TICK_MS = 60 * 1000;
const apiRateLimitStore = new Map();
const quotaStore = new Map();

let schedulerInterval = null;
let schedulerRunning = false;
let aiSchedulerInterval = null;
let aiSchedulerRunning = false;
let mpInfoDistrictSchedulerInterval = null;
let mpInfoDistrictSchedulerRunning = false;
let schedulerWatchdogInterval = null;
let schedulerHeartbeatInterval = null;
let aiSchedulerHeartbeatInterval = null;
let retentionCleanupInterval = null;
let retentionCleanupRunning = false;
let serverInstance = null;
const RETENTION_CONFIG = loadRetentionConfig();
const retentionState = {
  enabled: RETENTION_CONFIG.enabled,
  intervalMs: RETENTION_CONFIG.intervalMs,
  lastTickAt: null,
  lastRunAt: null,
  lastStatus: "Waiting",
  lastError: null,
  lastResult: null,
};
const schedulerState = {
  enabled: SCHEDULER_ENABLED,
  lastTickAt: null,
  lastRunAt: null,
  lastWindowKey: null,
  manualRun: {
    inProgress: false,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastRequestedLimit: null,
    lastResult: null,
    lastError: null,
  },
  quietHours: {
    timezone: INDIA_TIMEZONE,
    startHour: QUIET_HOUR_START,
    endHour: QUIET_HOUR_END,
  },
  coordination: {
    activeWorker: null,
    activeSince: null,
    lastBusyAt: null,
    lastBusyReason: null,
  },
  categories: {},
};
const aiSchedulerState = {
  enabled: AI_SCHEDULER_ENABLED,
  lastTickAt: null,
  lastRunAt: null,
  lastWindowKey: null,
  lastStatus: "Waiting",
  lastError: null,
  frequency_minutes: 15,
  categories: {},
};
const mpInfoDistrictSchedulerState = {
  enabled: MPINFO_DISTRICT_SCHEDULER_ENABLED && MPINFO_DISTRICT_BROWSER_ENABLED,
  browserEnabled: MPINFO_DISTRICT_BROWSER_ENABLED,
  intervalMs: MPINFO_DISTRICT_SCHEDULER_INTERVAL_MS,
  limit: MPINFO_DISTRICT_SCHEDULER_LIMIT,
  districtScanLimit: MPINFO_DISTRICT_SCHEDULER_SCAN_LIMIT,
  rewrite: MPINFO_DISTRICT_SCHEDULER_REWRITE,
  nextDistrictIndex: 0,
  lastTickAt: null,
  lastRunAt: null,
  lastStatus: "Waiting",
  lastError: null,
  lastResult: null,
};
const processState = {
  startedAt: new Date().toISOString(),
  shuttingDown: false,
  lastUncaughtException: null,
  lastUnhandledRejection: null,
};
const memoryCache = new Map();
let redisClientPromise = null;

function getCachePrefixes() {
  return [
    "cache:news:",
    "cache:scheduler:",
    "cache:cron:",
    "cache:rss-feeds",
  ];
}

async function getRedisClient() {
  if (!REDIS_URL) {
    return null;
  }

  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      try {
        const { createClient } = require("redis");
        const client = createClient({ url: REDIS_URL });
        client.on("error", (error) => {
          console.error("Redis cache error:", error.message);
        });
        await client.connect();
        console.log("Redis cache connected.");
        return client;
      } catch (error) {
        console.error("Redis cache initialization failed:", error.message);
        return null;
      }
    })();
  }

  return redisClientPromise;
}

function getMemoryCacheValue(key) {
  const entry = memoryCache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value;
}

function setMemoryCacheValue(key, value, ttlSeconds) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + (ttlSeconds * 1000),
  });
}

async function cacheGetJson(key) {
  const memoryValue = getMemoryCacheValue(key);
  if (memoryValue !== null) {
    return memoryValue;
  }

  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  try {
    const raw = await client.get(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    setMemoryCacheValue(key, parsed, 5);
    return parsed;
  } catch (error) {
    console.error("Redis cache read failed:", error.message);
    return null;
  }
}

async function recoverStaleSchedulerRuns(triggerSource = "startup") {
  if (!dbPool) {
    return 0;
  }

  const staleSeconds = Math.ceil(STALE_SCHEDULER_RUN_MS / 1000);
  const staleMessage = `Recovered stale Running scheduler row during ${triggerSource}; previous process likely stopped before finalizing this run.`;
  const [result] = await dbPool.execute(
    dbPool.dialect === "postgres"
      ? `
          UPDATE scheduler_runs
          SET
            status = 'Abandoned',
            failed_count = CASE WHEN failed_count = 0 THEN 1 ELSE failed_count END,
            message = COALESCE(message, ?),
            error_message = COALESCE(error_message, ?),
            completed_at = CURRENT_TIMESTAMP,
            duration_ms = FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) * 1000)
          WHERE status = 'Running'
            AND started_at < CURRENT_TIMESTAMP - (? * INTERVAL '1 second')
        `
      : `
          UPDATE scheduler_runs
          SET
            status = 'Abandoned',
            failed_count = IF(failed_count = 0, 1, failed_count),
            message = COALESCE(message, ?),
            error_message = COALESCE(error_message, ?),
            completed_at = CURRENT_TIMESTAMP,
            duration_ms = TIMESTAMPDIFF(SECOND, started_at, CURRENT_TIMESTAMP) * 1000
          WHERE status = 'Running'
            AND started_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? SECOND)
        `,
    [staleMessage, staleMessage, staleSeconds]
  );

  const affectedRows = result?.affectedRows || result?.rowCount || 0;
  if (affectedRows > 0) {
    console.warn(`Recovered ${affectedRows} stale scheduler run(s) left in Running state.`);
  }

  return affectedRows;
}

async function cacheSetJson(key, value, ttlSeconds) {
  setMemoryCacheValue(key, value, ttlSeconds);

  const client = await getRedisClient();
  if (!client) {
    return;
  }

  try {
    await client.set(key, JSON.stringify(value), {
      EX: ttlSeconds,
    });
  } catch (error) {
    console.error("Redis cache write failed:", error.message);
  }
}

async function withJsonCache(key, ttlSeconds, loader) {
  const cached = await cacheGetJson(key);
  if (cached !== null) {
    return cached;
  }

  const value = await loader();
  await cacheSetJson(key, value, ttlSeconds);
  return value;
}

function getMemoryCounterValue(store, key) {
  const entry = store.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }

  return entry;
}

function setMemoryCounterValue(store, key, value, ttlMs) {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

async function incrementCounter({
  key,
  windowMs,
  memoryStore,
}) {
  const client = await getRedisClient();
  if (client) {
    const count = await client.incr(key);
    let ttlMs = await client.pTTL(key);

    if (ttlMs < 0) {
      await client.pExpire(key, windowMs);
      ttlMs = windowMs;
    }

    return {
      count,
      resetAt: Date.now() + ttlMs,
    };
  }

  const current = getMemoryCounterValue(memoryStore, key);
  if (!current) {
    setMemoryCounterValue(memoryStore, key, 1, windowMs);
    return {
      count: 1,
      resetAt: Date.now() + windowMs,
    };
  }

  current.value += 1;
  return {
    count: current.value,
    resetAt: current.expiresAt,
  };
}

async function invalidateCachePrefixes(prefixes = []) {
  if (!prefixes.length) {
    return;
  }

  for (const prefix of prefixes) {
    for (const key of Array.from(memoryCache.keys())) {
      if (key.startsWith(prefix)) {
        memoryCache.delete(key);
      }
    }
  }
}

async function invalidateDashboardCaches() {
  await invalidateCachePrefixes(getCachePrefixes());
}

async function normalizeStoredCategoryColumns(pool) {
  const targets = [
    { table: "fetched_news", column: "category" },
    { table: "ai_news_rewrites", column: "ui_category" },
  ];

  for (const target of targets) {
    try {
      const [rows] = await pool.query(`
        SELECT DISTINCT ${target.column} AS category
        FROM ${target.table}
        WHERE ${target.column} IS NOT NULL AND ${target.column} <> ''
      `);

      for (const row of rows || []) {
        const originalCategory = row.category;
        const normalizedCategory = normalizeUnifiedCategory(originalCategory, {
          source: `${target.table}.${target.column}`,
          logger: console,
        });

        if (normalizedCategory === originalCategory) {
          continue;
        }

        await pool.execute(
          `UPDATE ${target.table} SET ${target.column} = ? WHERE ${target.column} = ?`,
          [normalizedCategory, originalCategory]
        );
      }
    } catch (error) {
      console.warn(
        `[category-normalizer] Could not normalize stored categories for ${target.table}.${target.column}: ${error.message}`
      );
    }
  }
}

async function backfillFetchedNewsSignatures(pool) {
  try {
    const [rows] = await pool.query(`
      SELECT id, title, source_url
      FROM fetched_news
      WHERE source_url_signature IS NULL OR source_url_signature = '' OR title_signature IS NULL OR title_signature = ''
      ORDER BY id DESC
      LIMIT 5000
    `);

    for (const row of rows || []) {
      const sourceUrlSignature = normalizeStoredSourceUrl(row.source_url);
      const titleSignature = normalizeNewsTitleSignature(row.title) || null;
      await pool.execute(
        `
          UPDATE fetched_news
          SET source_url_signature = ?, title_signature = ?
          WHERE id = ?
            AND (source_url_signature IS NULL OR source_url_signature = '' OR title_signature IS NULL OR title_signature = '')
        `,
        [sourceUrlSignature || null, titleSignature, row.id]
      );
    }
  } catch (error) {
    console.warn(`[news-dedupe] Could not backfill fetched_news signatures: ${error.message}`);
  }
}

async function initializeDatabase() {
  dbPool = await createDatabasePool();

  if (dbPool.dialect === "postgres") {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS fetched_news (
        id BIGSERIAL PRIMARY KEY,
        category VARCHAR(100),
        feed_source VARCHAR(100),
        feed_url TEXT,
        search_query VARCHAR(500) NOT NULL,
        title TEXT,
        source_url TEXT NOT NULL UNIQUE,
        source_url_signature TEXT NULL,
        title_signature VARCHAR(255) NULL,
        image_link TEXT,
        image_source VARCHAR(100),
        source_excerpt TEXT,
        source_content TEXT,
        source_published_at TIMESTAMPTZ NULL,
        fetched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } else {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS fetched_news (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category VARCHAR(100),
        feed_source VARCHAR(100),
        feed_url TEXT,
        search_query VARCHAR(500) NOT NULL,
        title TEXT,
        source_url TEXT NOT NULL,
        source_url_signature TEXT NULL,
        title_signature VARCHAR(255) NULL,
        image_link TEXT,
        image_source VARCHAR(100),
        source_excerpt MEDIUMTEXT,
        source_content LONGTEXT,
        source_published_at TIMESTAMP NULL DEFAULT NULL,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  try {
    await dbPool.query("ALTER TABLE fetched_news ADD COLUMN category VARCHAR(100)");
  } catch (error) {
    if (!isDuplicateColumnError(error, dbPool.dialect)) {
      throw error;
    }
  }

  try {
    await dbPool.query("ALTER TABLE fetched_news ADD COLUMN feed_source VARCHAR(100)");
  } catch (error) {
    if (!isDuplicateColumnError(error, dbPool.dialect)) {
      throw error;
    }
  }

  try {
    await dbPool.query("ALTER TABLE fetched_news ADD COLUMN feed_url TEXT");
  } catch (error) {
    if (!isDuplicateColumnError(error, dbPool.dialect)) {
      throw error;
    }
  }

  const fetchedNewsSourceColumnStatements = dbPool.dialect === "postgres"
    ? [
        "ALTER TABLE fetched_news ADD COLUMN source_excerpt TEXT",
        "ALTER TABLE fetched_news ADD COLUMN source_content TEXT",
        "ALTER TABLE fetched_news ADD COLUMN source_published_at TIMESTAMPTZ NULL",
        "ALTER TABLE fetched_news ADD COLUMN source_url_signature TEXT NULL",
        "ALTER TABLE fetched_news ADD COLUMN title_signature VARCHAR(255) NULL",
      ]
    : [
        "ALTER TABLE fetched_news ADD COLUMN source_excerpt MEDIUMTEXT",
        "ALTER TABLE fetched_news ADD COLUMN source_content LONGTEXT",
        "ALTER TABLE fetched_news ADD COLUMN source_published_at TIMESTAMP NULL DEFAULT NULL",
        "ALTER TABLE fetched_news ADD COLUMN source_url_signature TEXT NULL",
        "ALTER TABLE fetched_news ADD COLUMN title_signature VARCHAR(255) NULL",
      ];

  for (const statement of fetchedNewsSourceColumnStatements) {
    try {
      await dbPool.query(statement);
    } catch (error) {
      if (!isDuplicateColumnError(error, dbPool.dialect)) {
        throw error;
      }
    }
  }

  if (dbPool.dialect === "postgres") {
    await dbPool.query("CREATE INDEX IF NOT EXISTS idx_fetched_news_url_signature ON fetched_news (source_url_signature)");
    await dbPool.query("CREATE INDEX IF NOT EXISTS idx_fetched_news_title_signature ON fetched_news (title_signature)");
  } else {
    for (const statement of [
      "CREATE INDEX idx_fetched_news_url_signature ON fetched_news (source_url_signature(255))",
      "CREATE INDEX idx_fetched_news_title_signature ON fetched_news (title_signature)",
    ]) {
      try {
        await dbPool.query(statement);
      } catch (error) {
        if (!String(error?.message || "").toLowerCase().includes("duplicate")) {
          throw error;
        }
      }
    }
  }

  await initializeAiRewriteStorage(dbPool);
  await initializeEditorialStorage(dbPool);
  await initializeRashifalStorage(dbPool);
  await normalizeStoredCategoryColumns(dbPool);
  await backfillFetchedNewsSignatures(dbPool);

  if (dbPool.dialect === "postgres") {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS scheduler_runs (
        id BIGSERIAL PRIMARY KEY,
        scheduler_name VARCHAR(50) NOT NULL,
        run_type VARCHAR(50) NOT NULL,
        trigger_source VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Running',
        category VARCHAR(100) NULL,
        window_key VARCHAR(50) NULL,
        requested_limit INT NULL,
        saved_count INT NOT NULL DEFAULT 0,
        skipped_count INT NOT NULL DEFAULT 0,
        failed_count INT NOT NULL DEFAULT 0,
        title TEXT NULL,
        message TEXT NULL,
        error_message TEXT NULL,
        details_json TEXT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMPTZ NULL DEFAULT NULL,
        duration_ms INT NULL
      )
    `);
    await dbPool.query("CREATE INDEX IF NOT EXISTS idx_scheduler_runs_scheduler_started ON scheduler_runs (scheduler_name, started_at)");
    await dbPool.query("CREATE INDEX IF NOT EXISTS idx_scheduler_runs_category_started ON scheduler_runs (category, started_at)");

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS api_clients (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        key_hash VARCHAR(128) NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        allowed_origins_json TEXT NULL,
        allowed_scopes_json TEXT NULL,
        quota_limit INT NULL,
        quota_window VARCHAR(20) NULL,
        notes TEXT NULL,
        last_used_at TIMESTAMPTZ NULL DEFAULT NULL,
        last_used_origin VARCHAR(255) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } else {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS scheduler_runs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        scheduler_name VARCHAR(50) NOT NULL,
        run_type VARCHAR(50) NOT NULL,
        trigger_source VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Running',
        category VARCHAR(100) NULL,
        window_key VARCHAR(50) NULL,
        requested_limit INT NULL,
        saved_count INT NOT NULL DEFAULT 0,
        skipped_count INT NOT NULL DEFAULT 0,
        failed_count INT NOT NULL DEFAULT 0,
        title TEXT NULL,
        message TEXT NULL,
        error_message TEXT NULL,
        details_json LONGTEXT NULL,
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL DEFAULT NULL,
        duration_ms INT NULL,
        INDEX idx_scheduler_runs_scheduler_started (scheduler_name, started_at),
        INDEX idx_scheduler_runs_category_started (category, started_at)
      )
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS api_clients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        key_hash VARCHAR(128) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        allowed_origins_json LONGTEXT NULL,
        allowed_scopes_json LONGTEXT NULL,
        quota_limit INT NULL,
        quota_window VARCHAR(20) NULL,
        notes TEXT NULL,
        last_used_at TIMESTAMP NULL DEFAULT NULL,
        last_used_origin VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_api_clients_key_hash (key_hash)
      )
    `);
  }

  try {
    await dbPool.query("ALTER TABLE api_clients ADD COLUMN quota_limit INT NULL");
  } catch (error) {
    if (!isDuplicateColumnError(error, dbPool.dialect)) {
      throw error;
    }
  }

  try {
    await dbPool.query("ALTER TABLE api_clients ADD COLUMN quota_window VARCHAR(20) NULL");
  } catch (error) {
    if (!isDuplicateColumnError(error, dbPool.dialect)) {
      throw error;
    }
  }

  if (dbPool.dialect === "postgres") {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS api_usage_logs (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT NULL,
        client_name VARCHAR(150) NULL,
        auth_type VARCHAR(20) NOT NULL,
        method VARCHAR(10) NOT NULL,
        path VARCHAR(255) NOT NULL,
        origin VARCHAR(255) NULL,
        ip_address VARCHAR(100) NULL,
        status_code INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await dbPool.query("CREATE INDEX IF NOT EXISTS idx_api_usage_client_created ON api_usage_logs (client_id, created_at)");
    await dbPool.query("CREATE INDEX IF NOT EXISTS idx_api_usage_path_created ON api_usage_logs (path, created_at)");

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id BIGSERIAL PRIMARY KEY,
        actor_type VARCHAR(20) NOT NULL,
        actor_label VARCHAR(150) NULL,
        action VARCHAR(100) NOT NULL,
        target_type VARCHAR(50) NOT NULL,
        target_id VARCHAR(100) NULL,
        details_json TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await dbPool.query("CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs (created_at)");
    await dbPool.query("CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_logs (action)");
  } else {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS api_usage_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NULL,
        client_name VARCHAR(150) NULL,
        auth_type VARCHAR(20) NOT NULL,
        method VARCHAR(10) NOT NULL,
        path VARCHAR(255) NOT NULL,
        origin VARCHAR(255) NULL,
        ip_address VARCHAR(100) NULL,
        status_code INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_api_usage_client_created (client_id, created_at),
        INDEX idx_api_usage_path_created (path, created_at)
      )
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        actor_type VARCHAR(20) NOT NULL,
        actor_label VARCHAR(150) NULL,
        action VARCHAR(100) NOT NULL,
        target_type VARCHAR(50) NOT NULL,
        target_id VARCHAR(100) NULL,
        details_json LONGTEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_admin_audit_created (created_at),
        INDEX idx_admin_audit_action (action)
      )
    `);
  }

  await recoverStaleSchedulerRuns("startup");
}

async function saveNewsRecord({
  category,
  feedSource,
  feedUrl,
  query,
  title,
  articleUrl,
  imageLink,
  imageSource,
  sourceExcerpt = null,
  sourceContent = null,
  sourcePublishedAt = null,
}) {
  if (!dbPool) {
    throw new Error("Database pool is not initialized.");
  }

  const sourceFreshness = isFreshPublishedDate(sourcePublishedAt);
  if (!sourceFreshness.fresh) {
    return null;
  }

  const dailyQuota = await getDailyNewsQuota();
  if (dailyQuota.remaining <= 0) {
    return null;
  }

  const normalizedSourceUrl = normalizeStoredSourceUrl(articleUrl);
  const titleSignature = normalizeNewsTitleSignature(title);
  const safeImageLink = sanitizeArticleImageUrl(imageLink);
  const safeImageSource = safeImageLink ? imageSource : null;
  const unifiedArticle = createUnifiedNewsArticle({
    title,
    description: sourceExcerpt || "",
    source: feedSource,
    category,
    publishedAt: sourcePublishedAt || "",
    url: articleUrl,
    image: safeImageLink || "",
  });
  const normalizedCategory = unifiedArticle.normalizedCategory;

  const duplicateRecord = await findNewsRecordDuplicate({
    articleUrl,
    sourceUrlSignature: normalizedSourceUrl,
    titleSignature,
  });
  if (duplicateRecord) {
    return null;
  }

  const [result] = await dbPool.execute(
    dbPool.dialect === "postgres"
      ? `
          INSERT INTO fetched_news (
            category, feed_source, feed_url, search_query, title, source_url, source_url_signature, title_signature, image_link, image_source,
            source_excerpt, source_content, source_published_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (source_url) DO NOTHING
          RETURNING id
        `
      : `
          INSERT INTO fetched_news (
            category, feed_source, feed_url, search_query, title, source_url, source_url_signature, title_signature, image_link, image_source,
            source_excerpt, source_content, source_published_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          FROM DUAL
          WHERE NOT EXISTS (
            SELECT 1
            FROM fetched_news
            WHERE source_url = ?
              OR (source_url_signature IS NOT NULL AND source_url_signature <> '' AND source_url_signature = ?)
              OR (title_signature IS NOT NULL AND title_signature <> '' AND title_signature = ?)
          )
        `,
    dbPool.dialect === "postgres"
      ? [
          normalizedCategory,
          feedSource,
          feedUrl,
          query,
          title,
          articleUrl,
          normalizedSourceUrl,
          titleSignature || null,
          safeImageLink,
          safeImageSource,
          sourceExcerpt,
          sourceContent,
          sourcePublishedAt,
        ]
      : [
          normalizedCategory,
          feedSource,
          feedUrl,
          query,
          title,
          articleUrl,
          normalizedSourceUrl,
          titleSignature || null,
          safeImageLink,
          safeImageSource,
          sourceExcerpt,
          sourceContent,
          sourcePublishedAt,
          articleUrl,
          normalizedSourceUrl,
          titleSignature || null,
        ]
  );

  if (dbPool.dialect === "postgres" && result.rows?.[0]?.id) {
    await invalidateDashboardCaches();
    return result.rows[0].id;
  }

  if (result.affectedRows > 0) {
    await invalidateDashboardCaches();
    return result.insertId;
  }

  return null;
}

async function findNewsRecordByUrl(articleUrl) {
  if (!dbPool) {
    throw new Error("Database pool is not initialized.");
  }

  const normalizedSourceUrl = normalizeStoredSourceUrl(articleUrl);
  const [rows] = await dbPool.execute(
    `
      SELECT id, category, source_url, fetched_at
      FROM fetched_news
      WHERE source_url = ?
        OR (source_url_signature IS NOT NULL AND source_url_signature <> '' AND source_url_signature = ?)
      LIMIT 1
    `,
    [articleUrl, normalizedSourceUrl]
  );

  return rows[0] || null;
}

async function findNewsRecordDuplicate({ articleUrl, sourceUrlSignature, titleSignature }) {
  if (!dbPool) {
    throw new Error("Database pool is not initialized.");
  }

  const conditions = ["source_url = ?"];
  const params = [articleUrl];
  const normalizedSourceUrl = sourceUrlSignature || normalizeStoredSourceUrl(articleUrl);

  if (normalizedSourceUrl) {
    conditions.push("(source_url_signature IS NOT NULL AND source_url_signature <> '' AND source_url_signature = ?)");
    params.push(normalizedSourceUrl);
  }

  if (titleSignature) {
    conditions.push("(title_signature IS NOT NULL AND title_signature <> '' AND title_signature = ?)");
    params.push(titleSignature);
  }

  const [rows] = await dbPool.execute(
    `
      SELECT id, category, title, source_url, fetched_at
      FROM fetched_news
      WHERE ${conditions.join(" OR ")}
      LIMIT 1
    `,
    params
  );

  return rows[0] || null;
}

async function findFullNewsRecordById(newsId) {
  if (!dbPool) {
    throw new Error("Database pool is not initialized.");
  }

  const [rows] = await dbPool.execute(
    `
      SELECT
        id, category, feed_source, feed_url, search_query, title, source_url, image_link, image_source,
        source_excerpt, source_content, source_published_at, fetched_at
      FROM fetched_news
      WHERE id = ?
      LIMIT 1
    `,
    [newsId]
  );

  return rows[0] || null;
}

async function findFullNewsRecordByUrl(articleUrl) {
  if (!dbPool) {
    throw new Error("Database pool is not initialized.");
  }

  const normalizedSourceUrl = normalizeStoredSourceUrl(articleUrl);
  const [rows] = await dbPool.execute(
    `
      SELECT
        id, category, feed_source, feed_url, search_query, title, source_url, image_link, image_source,
        source_excerpt, source_content, source_published_at, fetched_at
      FROM fetched_news
      WHERE source_url = ?
        OR (source_url_signature IS NOT NULL AND source_url_signature <> '' AND source_url_signature = ?)
      LIMIT 1
    `,
    [articleUrl, normalizedSourceUrl]
  );

  return rows[0] || null;
}

async function backfillNewsRecordImage(newsId, imageLink, imageSource) {
  if (!dbPool || !newsId) {
    return false;
  }

  const safeImageLink = sanitizeArticleImageUrl(imageLink);
  if (!safeImageLink) {
    return false;
  }

  const safeImageSource = imageSource || "article-image";
  const [result] = await dbPool.execute(
    `
      UPDATE fetched_news
      SET image_link = ?, image_source = ?
      WHERE id = ?
        AND (image_link IS NULL OR image_link = '')
    `,
    [safeImageLink, safeImageSource, newsId]
  );

  await dbPool.execute(
    `
      UPDATE ai_news_rewrites
      SET ui_image_url = NULL, ui_image_prompt = NULL
      WHERE news_id = ?
    `,
    [newsId]
  );

  if ((result.affectedRows || result.rowCount || 0) > 0) {
    await invalidateDashboardCaches();
    return true;
  }

  return false;
}

async function replaceNewsRecordImage(newsId, imageLink, imageSource) {
  if (!dbPool || !newsId) {
    return false;
  }

  const safeImageLink = sanitizeArticleImageUrl(imageLink);
  if (!safeImageLink) {
    return false;
  }

  const safeImageSource = imageSource || "article-image";
  const [result] = await dbPool.execute(
    `
      UPDATE fetched_news
      SET image_link = ?, image_source = ?
      WHERE id = ?
        AND (image_link IS NULL OR image_link = '' OR image_link <> ? OR image_source IS NULL OR image_source = '')
    `,
    [safeImageLink, safeImageSource, newsId, safeImageLink]
  );

  await dbPool.execute(
    `
      UPDATE ai_news_rewrites
      SET ui_image_url = NULL, ui_image_prompt = NULL
      WHERE news_id = ?
    `,
    [newsId]
  );

  if ((result.affectedRows || result.rowCount || 0) > 0) {
    await invalidateDashboardCaches();
    return true;
  }

  return false;
}

async function createSchedulerRunLog({
  schedulerName,
  runType,
  triggerSource,
  category = null,
  windowKey = null,
  requestedLimit = null,
  title = null,
  message = null,
}) {
  if (!dbPool) {
    return null;
  }

  const [result] = await dbPool.execute(
    dbPool.dialect === "postgres"
      ? `
          INSERT INTO scheduler_runs (
            scheduler_name, run_type, trigger_source, status, category, window_key,
            requested_limit, title, message
          )
          VALUES (?, ?, ?, 'Running', ?, ?, ?, ?, ?)
          RETURNING id
        `
      : `
          INSERT INTO scheduler_runs (
            scheduler_name, run_type, trigger_source, status, category, window_key,
            requested_limit, title, message
          )
          VALUES (?, ?, ?, 'Running', ?, ?, ?, ?, ?)
        `,
    [schedulerName, runType, triggerSource, category, windowKey, requestedLimit, title, message]
  );

  return result.insertId;
}

async function finalizeSchedulerRunLog(
  logId,
  {
    status,
    savedCount = 0,
    skippedCount = 0,
    failedCount = 0,
    title = null,
    message = null,
    errorMessage = null,
    details = null,
  }
) {
  if (!dbPool || !logId) {
    return;
  }

  await dbPool.execute(
    dbPool.dialect === "postgres"
      ? `
          UPDATE scheduler_runs
          SET
            status = ?,
            saved_count = ?,
            skipped_count = ?,
            failed_count = ?,
            title = COALESCE(?, title),
            message = ?,
            error_message = ?,
            details_json = ?,
            completed_at = CURRENT_TIMESTAMP,
            duration_ms = FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) * 1000)
          WHERE id = ?
        `
      : `
          UPDATE scheduler_runs
          SET
            status = ?,
            saved_count = ?,
            skipped_count = ?,
            failed_count = ?,
            title = COALESCE(?, title),
            message = ?,
            error_message = ?,
            details_json = ?,
            completed_at = CURRENT_TIMESTAMP,
            duration_ms = TIMESTAMPDIFF(SECOND, started_at, CURRENT_TIMESTAMP) * 1000
          WHERE id = ?
        `,
    [
      status,
      savedCount,
      skippedCount,
      failedCount,
      title,
      message,
      errorMessage,
      details ? JSON.stringify(details) : null,
      logId,
    ]
  );

  await invalidateDashboardCaches();
}

async function listSchedulerRuns({ schedulerName = null, limit = 50 } = {}) {
  if (!dbPool) {
    return [];
  }

  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 50, 200));
  const [rows] = schedulerName
    ? await dbPool.query(
        `
          SELECT *
          FROM scheduler_runs
          WHERE scheduler_name = ?
          ORDER BY id DESC
          LIMIT ?
        `,
        [schedulerName, safeLimit]
      )
    : await dbPool.query(
        `
          SELECT *
          FROM scheduler_runs
          ORDER BY id DESC
          LIMIT ?
        `,
        [safeLimit]
      );

  return rows.map((row) => ({
    ...row,
    details: row.details_json ? JSON.parse(row.details_json) : null,
  }));
}

async function getCachedRssFeedsPayload() {
  return withJsonCache("cache:rss-feeds", RSS_FEED_CACHE_TTL_SECONDS, async () => {
    const categoryCatalog = await buildCategoryCatalogPayload();
    return {
      status: "Success",
      source: "Configured RSS feeds",
      count: Object.keys(RSS_FEEDS).length,
      final_categories: UNIFIED_NEWS_CATEGORIES,
      feeds: RSS_FEEDS,
      source_category_catalog: categoryCatalog,
      expensive_source_throttle: getExpensiveSourceThrottlePayload(),
      category_feed_pools: Object.fromEntries(
        UNIFIED_NEWS_CATEGORIES.map((category) => [
          category,
          {
            direct_feeds: RSS_FEEDS[category] || [],
            related_categories: CATEGORY_FEED_GROUPS[category] || [],
            combined_feed_pool: getCategoryFeedPool(category),
          },
        ])
      ),
    };
  });
}

async function getCachedCategoryCatalogPayload() {
  return withJsonCache("cache:source-category-catalog", RSS_FEED_CACHE_TTL_SECONDS, buildCategoryCatalogPayload);
}

async function getCachedGroupedNewsPayload(limit = 500) {
  return withJsonCache(`cache:news:grouped:${limit}`, DASHBOARD_CACHE_TTL_SECONDS, async () => {
    const rows = await listNewsRecords({ limit });
    const grouped = groupRecordsByCategory(rows);

    return {
      status: "Success",
      database: DB_NAME,
      count: rows.length,
      category_count: grouped.length,
      categories: grouped.map((item) => item.category),
      message:
        rows.length === 0
          ? "No category records saved yet. Run the category fetch endpoints first."
          : "Saved news records loaded category-wise.",
      grouped_records: grouped,
    };
  });
}

async function getCachedCronStatusPayload() {
  return withJsonCache("cache:cron:status", STATUS_CACHE_TTL_SECONDS, async () => {
    const dailyQuota = await getDailyNewsQuota();
    return {
      status: "Success",
      scheduler: {
        enabled: schedulerState.enabled,
        timezone: INDIA_TIMEZONE,
        tick_ms: SCHEDULER_TICK_MS,
        primary_sources: PRIMARY_NEWS_SOURCE_STRATEGY,
        primary_source_limit: SCHEDULER_PRIMARY_SOURCE_LIMIT,
        daily_quota: dailyQuota,
        latest_only: {
          max_age_hours: NEWS_MAX_AGE_HOURS,
          require_published_date: NEWS_REQUIRE_PUBLISHED_DATE,
        },
        active_hours: {
          start_hour: SCHEDULER_ACTIVE_START_HOUR,
          end_hour: SCHEDULER_ACTIVE_END_HOUR,
          peak_windows: SCHEDULER_PEAK_WINDOWS,
          peak_weight: SCHEDULER_PEAK_WEIGHT,
        },
        quiet_hours: schedulerState.quietHours,
        last_tick_at: schedulerState.lastTickAt,
        last_run_at: schedulerState.lastRunAt,
        last_window_key: schedulerState.lastWindowKey,
        manual_run: schedulerState.manualRun,
        coordination: schedulerState.coordination,
        categories: schedulerState.categories,
        schedule: schedulerState.schedule || getCategorySchedule(),
        mpinfo_districts: getMpInfoDistrictSchedulerHealthSnapshot(),
        retention_cleanup: getRetentionCleanupHealthSnapshot(),
      },
    };
  });
}

async function getCachedSchedulerLogsPayload({ schedulerName = null, limit = 20 } = {}) {
  return withJsonCache(
    `cache:scheduler:${schedulerName || "all"}:${limit}`,
    STATUS_CACHE_TTL_SECONDS,
    async () => {
      const logs = await listSchedulerRuns({
        schedulerName,
        limit,
      });

      return {
        status: "Success",
        count: logs.length,
        scheduler: schedulerName,
        records: logs,
      };
    }
  );
}

function buildApiDocs() {
  return {
    name: "Gautam News Bot API",
    version: API_VERSION,
    base_path: API_BASE_PATH,
    authentication: {
      header: "x-api-key",
      alternate_header: "authorization: Bearer <key>",
      required_for: `${API_BASE_PATH}/* except /health and /docs`,
    },
    cors: {
      allowed_origins: API_CORS_ORIGINS,
    },
    endpoints: [
      { method: "GET", path: `${API_BASE_PATH}/health`, description: "Service, database, and scheduler health." },
      { method: "GET", path: `${API_BASE_PATH}/docs`, description: "Machine-readable API overview." },
      { method: "GET", path: `${API_BASE_PATH}/news`, description: "List saved news records." },
      { method: "GET", path: `${API_BASE_PATH}/news/grouped`, description: "List saved news grouped by category." },
      { method: "GET", path: `${API_BASE_PATH}/delivery/news`, description: "List published AI-written articles for client websites." },
      { method: "GET", path: `${API_BASE_PATH}/delivery/news/grouped`, description: "List published AI-written articles grouped by category." },
      { method: "GET", path: `${API_BASE_PATH}/delivery/news/:idOrSlug`, description: "Fetch one published AI-written article by id or slug." },
      { method: "GET", path: `${API_BASE_PATH}/delivery/feed`, description: "Cron-aware published news feed for client websites." },
      { method: "GET", path: `${API_BASE_PATH}/rss-feeds`, description: "Configured RSS feed catalog." },
      { method: "GET", path: `${API_BASE_PATH}/categories`, description: "Dynamic source category catalog merged into final categories." },
      { method: "POST", path: `${API_BASE_PATH}/sync/rss`, description: "Fetch RSS stories for one category." },
      { method: "POST", path: `${API_BASE_PATH}/sync/rss/all`, description: "Fetch RSS stories for all categories." },
      { method: "POST", path: `${API_BASE_PATH}/sync/cliff-news`, description: "Fetch English stories from the Cliff News API and optionally create 100/300/600-word AI rewrites." },
      { method: "POST", path: `${API_BASE_PATH}/sync/sources-ai`, description: "Fetch Google RSS plus configured news sources and optionally create 100/300/600-word AI rewrites." },
      { method: "POST", path: `${API_BASE_PATH}/sync/mpinfo`, description: "Fetch MP Info stories." },
      { method: "POST", path: `${API_BASE_PATH}/sync/mpinfo-districts`, description: "Fetch MP Info district stories." },
      { method: "GET", path: `${API_BASE_PATH}/cron/status`, description: "Main scheduler status." },
      { method: "POST", path: `${API_BASE_PATH}/cron/run-now`, description: "Trigger main scheduler manually." },
      { method: "GET", path: `${API_BASE_PATH}/ai/news`, description: "List AI rewrite records." },
      { method: "GET", path: `${API_BASE_PATH}/ai/news/grouped`, description: "List AI rewrite records grouped by category." },
      { method: "GET", path: `${API_BASE_PATH}/ai/cron/status`, description: "AI scheduler status." },
      { method: "POST", path: `${API_BASE_PATH}/ai/cron/run-now`, description: "Trigger AI scheduler manually." },
      { method: "GET", path: `${API_BASE_PATH}/scheduler/logs`, description: "Recent scheduler audit trail." },
      { method: "GET", path: `${API_BASE_PATH}/admin/ai/rewrites`, description: "List AI rewrites with publication status." },
      { method: "POST", path: `${API_BASE_PATH}/admin/ai/rewrites/:rewriteId/publish`, description: "Approve and publish an AI rewrite for client delivery." },
      { method: "POST", path: `${API_BASE_PATH}/admin/ai/rewrites/:rewriteId/unpublish`, description: "Remove an AI rewrite from client delivery." },
    ],
  };
}

function buildOpenApiSpec(req) {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const exampleNewsRecord = {
    id: 48,
    category: "Entertainment",
    search_query: "Entertainment",
    title: "Sample entertainment headline",
    source_url: "https://example.com/story",
    image_link: "https://example.com/image.jpg",
    image_source: "og:image",
    fetched_at: "2026-04-04T16:46:26.000Z",
    feed_source: "dd",
    feed_url: "https://ddnews.gov.in/en/category/top-stories/feed/",
  };
  const exampleAiRecord = {
    id: 44,
    news_id: 44,
    model_name: "gemini-2.5-flash-lite",
    prompt_version: "the-cliff-news-v1",
    source_url: "https://example.com/story",
    source_title: "Sample source title",
    source_excerpt: "Sample source excerpt",
    english: {
      headline: "English AI headline",
      top_summary: ["Point one", "Point two", "Point three"],
      short_description: "Short English description",
      long_description: "Full English AI article body",
      what_to_watch_next: "Next thing to watch",
    },
    hindi: {
      headline: "हिंदी एआई हेडलाइन",
      top_summary: ["बिंदु एक", "बिंदु दो", "बिंदु तीन"],
      short_description: "संक्षिप्त हिंदी विवरण",
      long_description: "पूरा हिंदी एआई लेख",
      what_to_watch_next: "आगे क्या देखें",
    },
    created_at: "2026-04-04T16:32:13.000Z",
    updated_at: "2026-04-04T16:32:13.000Z",
    news: exampleNewsRecord,
  };
  const exampleDeliveredArticle = {
    id: 44,
    slug: "english-ai-headline-44",
    category: "Entertainment",
    publication_status: "published",
    published_at: "2026-04-04T18:00:00.000Z",
    updated_at: "2026-04-04T18:00:00.000Z",
    news_id: 44,
    language: "english",
    source: {
      title: "Sample source title",
      url: "https://example.com/story",
      feed_source: "dd",
      feed_url: "https://ddnews.gov.in/en/category/top-stories/feed/",
      fetched_at: "2026-04-04T16:46:26.000Z",
    },
    media: {
      image_link: "https://example.com/image.jpg",
      image_source: "og:image",
    },
    article: {
      headline: "English AI headline",
      top_summary: ["Point one", "Point two", "Point three"],
      short_description: "Short English description",
      long_description: "Full English AI article body",
      what_to_watch_next: "Next thing to watch",
    },
  };
  const securedPaths = {
    [`${API_BASE_PATH}/news`]: {
      get: {
        summary: "List saved news records",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 100, minimum: 1, maximum: 500 } },
        ],
        responses: {
          200: {
            description: "Saved news records.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiSuccessNewsList" },
                examples: {
                  default: {
                    value: {
                      success: true,
                      data: [exampleNewsRecord],
                      meta: { version: "v1", timestamp: "2026-04-04T16:47:50.695Z", count: 1, category: null, limit: 1 },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
        },
      },
    },
    [`${API_BASE_PATH}/news/grouped`]: {
      get: {
        summary: "List saved news records grouped by category",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 500, minimum: 1, maximum: 1000 } },
        ],
        responses: { 200: { description: "Grouped saved news records.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccessGroupedNewsList" } } } } },
      },
    },
    [`${API_BASE_PATH}/delivery/news`]: {
      get: {
        summary: "List published AI-written articles for client delivery",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "language", in: "query", schema: { type: "string", enum: ["english", "hindi", "both"], default: "both" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50, minimum: 1, maximum: 200 } },
        ],
        responses: {
          200: {
            description: "Published AI article feed.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiSuccessDeliveryList" },
                examples: {
                  default: {
                    value: {
                      success: true,
                      data: [exampleDeliveredArticle],
                      meta: { version: "v1", timestamp: "2026-04-04T18:00:00.000Z", count: 1, category: null, language: "english", limit: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    [`${API_BASE_PATH}/delivery/news/grouped`]: {
      get: {
        summary: "List published AI-written articles grouped by category",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "language", in: "query", schema: { type: "string", enum: ["english", "hindi", "both"], default: "both" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 100, minimum: 1, maximum: 300 } },
        ],
        responses: {
          200: {
            description: "Published AI articles grouped by category.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiSuccessGeneric" },
              },
            },
          },
        },
      },
    },
    [`${API_BASE_PATH}/delivery/news/{idOrSlug}`]: {
      get: {
        summary: "Get one published AI-written article by id or slug",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "idOrSlug", in: "path", required: true, schema: { type: "string" } },
          { name: "language", in: "query", schema: { type: "string", enum: ["english", "hindi", "both"], default: "both" } },
        ],
        responses: {
          200: { description: "Published AI article.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccessDeliveryItem" } } } },
          404: { description: "Not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
        },
      },
    },
    [`${API_BASE_PATH}/delivery/feed`]: {
      get: {
        summary: "Get cron-aware published delivery feed for client websites",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "language", in: "query", schema: { type: "string", enum: ["english", "hindi", "both"], default: "both" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 24, minimum: 1, maximum: 200 } },
          { name: "grouped", in: "query", schema: { type: "boolean", default: true } },
        ],
        responses: {
          200: {
            description: "Cron-aware published feed with scheduler freshness.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiSuccessGeneric" },
              },
            },
          },
        },
      },
    },
    [`${API_BASE_PATH}/rss-feeds`]: {
      get: {
        summary: "Get configured RSS feeds",
        security: [{ ApiKeyAuth: [] }],
        responses: { 200: { description: "Feed catalog.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccessGeneric" } } } } },
      },
    },
    [`${API_BASE_PATH}/categories`]: {
      get: {
        summary: "Get dynamic source category catalog",
        security: [{ ApiKeyAuth: [] }],
        responses: { 200: { description: "Source categories merged into final categories.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccessGeneric" } } } } },
      },
    },
    [`${API_BASE_PATH}/sync/rss`]: {
      post: {
        summary: "Fetch RSS stories for a single category",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 5, minimum: 1, maximum: 500 } },
        ],
        responses: { 200: { description: "RSS sync result.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccessGeneric" } } } } },
      },
    },
    [`${API_BASE_PATH}/sync/rss/all`]: {
      post: {
        summary: "Fetch RSS stories for all categories",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 5, minimum: 1, maximum: 500 } },
          { name: "total", in: "query", schema: { type: "integer", minimum: 1, maximum: 5000 } },
        ],
        responses: { 200: { description: "Bulk RSS sync result.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccessGeneric" } } } } },
      },
    },
    [`${API_BASE_PATH}/sync/mpinfo`]: {
      post: {
        summary: "Fetch MP Info stories",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "category", in: "query", schema: { type: "string", default: DEFAULT_CATEGORY } },
          { name: "limit", in: "query", schema: { type: "integer", default: 5, minimum: 1, maximum: 500 } },
        ],
        responses: { 200: { description: "MP Info sync result.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccessGeneric" } } } } },
      },
    },
    [`${API_BASE_PATH}/cron/status`]: {
      get: {
        summary: "Get main scheduler status",
        security: [{ ApiKeyAuth: [] }],
        responses: { 200: { description: "Main scheduler status.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccessGeneric" } } } } },
      },
    },
    [`${API_BASE_PATH}/cron/run-now`]: {
      post: {
        summary: "Trigger main scheduler manually",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 1, minimum: 1, maximum: 500 } },
          { name: "wait", in: "query", schema: { type: "boolean", default: false } },
        ],
        responses: {
          200: { description: "Immediate result.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccessGeneric" } } } },
          202: { description: "Accepted background run.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccessGeneric" } } } },
        },
      },
    },
    [`${API_BASE_PATH}/ai/news`]: {
      get: {
        summary: "List AI rewrite records",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 100, minimum: 1, maximum: 200 } },
        ],
        responses: {
          200: {
            description: "AI rewrite records.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiSuccessAiList" },
                examples: {
                  default: {
                    value: {
                      success: true,
                      data: [exampleAiRecord],
                      meta: { version: "v1", timestamp: "2026-04-04T16:45:23.501Z", count: 1, category: null, limit: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    [`${API_BASE_PATH}/ai/news/grouped`]: {
      get: {
        summary: "List AI rewrite records grouped by category",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 100, minimum: 1, maximum: 200 } },
        ],
        responses: { 200: { description: "Grouped AI rewrite records.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccessGroupedAiList" } } } } },
      },
    },
    [`${API_BASE_PATH}/ai/cron/status`]: {
      get: {
        summary: "Get AI scheduler status",
        security: [{ ApiKeyAuth: [] }],
        responses: { 200: { description: "AI scheduler status.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccessGeneric" } } } } },
      },
    },
    [`${API_BASE_PATH}/ai/cron/run-now`]: {
      post: {
        summary: "Trigger AI scheduler manually",
        security: [{ ApiKeyAuth: [] }],
        responses: { 200: { description: "AI scheduler result.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccessGeneric" } } } } },
      },
    },
    [`${API_BASE_PATH}/scheduler/logs`]: {
      get: {
        summary: "List recent scheduler logs",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "scheduler", in: "query", schema: { type: "string", enum: ["main", "ai"] } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50, minimum: 1, maximum: 200 } },
        ],
        responses: { 200: { description: "Scheduler audit trail.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccessGeneric" } } } } },
      },
    },
    [`${API_BASE_PATH}/health`]: {
      get: {
        summary: "Public API health check",
        responses: {
          200: { description: "Healthy.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccessGeneric" } } } },
          503: { description: "Degraded.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
        },
      },
    },
    [`${API_BASE_PATH}/docs`]: {
      get: {
        summary: "Simple machine-readable API docs",
        responses: { 200: { description: "Basic API docs." } },
      },
    },
    [`${API_BASE_PATH}/openapi.json`]: {
      get: {
        summary: "OpenAPI specification",
        responses: { 200: { description: "OpenAPI JSON." } },
      },
    },
    [`${API_BASE_PATH}/swagger`]: {
      get: {
        summary: "Swagger UI documentation",
        responses: { 200: { description: "Interactive Swagger UI." } },
      },
    },
  };

  return {
    openapi: "3.0.3",
    info: {
      title: "Gautam News Bot API",
      version: API_VERSION,
      description: "Reusable multi-site API for news ingestion, AI rewrites, cron orchestration, and scheduler monitoring.",
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "Use `x-api-key` or `Authorization: Bearer <key>` for protected routes.",
        },
      },
      schemas: {
        ApiMeta: {
          type: "object",
          properties: {
            version: { type: "string", example: "v1" },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        ApiError: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                code: { type: "string", example: "UNAUTHORIZED" },
                message: { type: "string", example: "A valid API key is required." },
                details: { nullable: true },
              },
            },
            meta: { $ref: "#/components/schemas/ApiMeta" },
          },
        },
        NewsRecord: {
          type: "object",
          properties: {
            id: { type: "integer", example: 48 },
            category: { type: "string", example: "Entertainment" },
            search_query: { type: "string", example: "Entertainment" },
            title: { type: "string", example: "Sample entertainment headline" },
            source_url: { type: "string", format: "uri" },
            image_link: { type: "string", format: "uri", nullable: true },
            image_source: { type: "string", nullable: true },
            fetched_at: { type: "string", format: "date-time" },
            feed_source: { type: "string", nullable: true },
            feed_url: { type: "string", nullable: true },
          },
        },
        GroupedNewsRecord: {
          type: "object",
          properties: {
            category: { type: "string", example: "Entertainment" },
            count: { type: "integer", example: 1 },
            records: {
              type: "array",
              items: { $ref: "#/components/schemas/NewsRecord" },
            },
          },
        },
        AiLanguageBlock: {
          type: "object",
          properties: {
            headline: { type: "string" },
            top_summary: { type: "array", items: { type: "string" } },
            short_description: { type: "string" },
            long_description: { type: "string" },
            what_to_watch_next: { type: "string" },
          },
        },
        AiRewriteRecord: {
          type: "object",
          properties: {
            id: { type: "integer" },
            news_id: { type: "integer" },
            model_name: { type: "string" },
            prompt_version: { type: "string" },
            source_url: { type: "string", format: "uri" },
            source_title: { type: "string", nullable: true },
            source_excerpt: { type: "string", nullable: true },
            english: { $ref: "#/components/schemas/AiLanguageBlock" },
            hindi: { $ref: "#/components/schemas/AiLanguageBlock" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
            news: { $ref: "#/components/schemas/NewsRecord" },
          },
        },
        DeliveredArticle: {
          type: "object",
          properties: {
            id: { type: "integer" },
            slug: { type: "string", nullable: true },
            category: { type: "string" },
            publication_status: { type: "string", example: "published" },
            published_at: { type: "string", format: "date-time", nullable: true },
            updated_at: { type: "string", format: "date-time", nullable: true },
            news_id: { type: "integer" },
            language: { type: "string", enum: ["english", "hindi", "both"] },
            source: {
              type: "object",
              properties: {
                title: { type: "string", nullable: true },
                url: { type: "string", format: "uri", nullable: true },
                feed_source: { type: "string", nullable: true },
                feed_url: { type: "string", nullable: true },
                fetched_at: { type: "string", format: "date-time", nullable: true },
              },
            },
            media: {
              type: "object",
              properties: {
                image_link: { type: "string", format: "uri", nullable: true },
                image_source: { type: "string", nullable: true },
              },
            },
            article: {
              oneOf: [
                { $ref: "#/components/schemas/AiLanguageBlock" },
                {
                  type: "object",
                  properties: {
                    english: { $ref: "#/components/schemas/AiLanguageBlock" },
                    hindi: { $ref: "#/components/schemas/AiLanguageBlock" },
                  },
                },
              ],
            },
          },
        },
        GroupedAiRewriteRecord: {
          type: "object",
          properties: {
            category: { type: "string" },
            count: { type: "integer" },
            records: {
              type: "array",
              items: { $ref: "#/components/schemas/AiRewriteRecord" },
            },
          },
        },
        ApiSuccessGeneric: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {},
            meta: { $ref: "#/components/schemas/ApiMeta" },
          },
        },
        ApiSuccessNewsList: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/NewsRecord" },
            },
            meta: { $ref: "#/components/schemas/ApiMeta" },
          },
        },
        ApiSuccessGroupedNewsList: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/GroupedNewsRecord" },
            },
            meta: { $ref: "#/components/schemas/ApiMeta" },
          },
        },
        ApiSuccessAiList: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/AiRewriteRecord" },
            },
            meta: { $ref: "#/components/schemas/ApiMeta" },
          },
        },
        ApiSuccessGroupedAiList: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/GroupedAiRewriteRecord" },
            },
            meta: { $ref: "#/components/schemas/ApiMeta" },
          },
        },
        ApiSuccessDeliveryList: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/DeliveredArticle" },
            },
            meta: { $ref: "#/components/schemas/ApiMeta" },
          },
        },
        ApiSuccessDeliveryItem: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: { $ref: "#/components/schemas/DeliveredArticle" },
            meta: { $ref: "#/components/schemas/ApiMeta" },
          },
        },
      },
    },
    paths: securedPaths,
  };
}

function sendApiSuccess(res, data, meta = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    meta: {
      version: API_VERSION,
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
}

function sendApiError(res, code, message, statusCode, details = null) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      version: API_VERSION,
      timestamp: new Date().toISOString(),
    },
  });
}

function getApiRequesterKey(req) {
  const headerKey = req.headers["x-api-key"];
  const authHeader = req.headers.authorization;
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }

  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  return null;
}

function isClientOriginAllowed(client, origin) {
  const normalizedOrigin = normalizeOriginValue(origin);
  if (!normalizedOrigin) {
    return true;
  }

  const allowedOrigins = parseJsonArray(client.allowed_origins_json)
    .map((value) => normalizeOriginValue(value))
    .filter(Boolean);
  if (!allowedOrigins.length) {
    return true;
  }

  if (allowedOrigins.includes("*")) {
    return true;
  }

  return allowedOrigins.includes(normalizedOrigin);
}

function isOriginAllowed(origin) {
  const normalizedOrigin = normalizeOriginValue(origin);
  if (!normalizedOrigin) {
    return true;
  }

  const allowedOrigins = API_CORS_ORIGINS
    .map((value) => normalizeOriginValue(value))
    .filter(Boolean);

  if (allowedOrigins.includes("*")) {
    return true;
  }

  return allowedOrigins.includes(normalizedOrigin);
}

function applyApiCors(req, res, next) {
  const origin = req.headers.origin;

  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", API_CORS_ORIGINS.includes("*") ? "*" : origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return next();
}

app.use(applyApiCors);

async function enforceApiKey(req, res, next) {
  if (req.path === "/health" || req.path === "/docs" || req.path === "/openapi.json" || req.path === "/swagger") {
    return next();
  }

  const apiKey = getApiRequesterKey(req);
  if (!apiKey) {
    return sendApiError(res, "UNAUTHORIZED", "A valid API key is required.", 401);
  }

  if (MASTER_API_KEY && apiKey === MASTER_API_KEY) {
    req.apiKey = apiKey;
    req.apiAuth = {
      type: "master",
      scopes: AVAILABLE_API_SCOPES,
      client: null,
    };
    return next();
  }

  if (LEGACY_API_KEYS_AS_MASTER_ENABLED && API_KEYS.includes(apiKey)) {
    req.apiKey = apiKey;
    req.apiAuth = {
      type: "legacy",
      scopes: AVAILABLE_API_SCOPES,
      client: null,
    };
    return next();
  }

  try {
    const client = await findApiClientByKey(apiKey);
    if (!client || !client.is_active) {
      return sendApiError(res, "UNAUTHORIZED", "This client key is invalid or inactive.", 401);
    }

    const origin = req.headers.origin;
    if (!isClientOriginAllowed(client, origin)) {
      return sendApiError(res, "ORIGIN_NOT_ALLOWED", "This origin is not permitted for the client.", 403);
    }

    await updateApiClientLastUsed(client.id, origin);
    req.apiKey = apiKey;
    req.apiAuth = {
      type: "client",
      scopes: parseJsonArray(client.allowed_scopes_json),
      client: formatApiClientRecord(client),
    };
    return next();
  } catch (error) {
    return sendApiError(res, "AUTH_LOOKUP_FAILED", error.message, 500);
  }
}

function enforceApiRateLimit(req, res, next) {
  if (req.path === "/health" || req.path === "/docs" || req.path === "/openapi.json" || req.path === "/swagger") {
    return next();
  }

  const bucketKey = `rate:${req.apiKey || req.ip || "anonymous"}`;

  return incrementCounter({
    key: bucketKey,
    windowMs: API_RATE_LIMIT_WINDOW_MS,
    memoryStore: apiRateLimitStore,
  })
    .then((current) => {
      res.setHeader("X-RateLimit-Limit", API_RATE_LIMIT_MAX);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, API_RATE_LIMIT_MAX - current.count));
      res.setHeader("X-RateLimit-Reset", current.resetAt);

      if (current.count > API_RATE_LIMIT_MAX) {
        return sendApiError(
          res,
          "RATE_LIMITED",
          "Rate limit exceeded. Please retry later.",
          429,
          { retry_after_ms: Math.max(0, current.resetAt - Date.now()) }
        );
      }

      return next();
    })
    .catch((error) => sendApiError(res, "RATE_LIMIT_FAILED", error.message, 500));
}

function requireApiScope(scope) {
  return (req, res, next) => {
    const auth = req.apiAuth;
    if (!auth) {
      return sendApiError(res, "UNAUTHORIZED", "API authentication context is missing.", 401);
    }

    if (auth.type === "master" || auth.type === "legacy") {
      return next();
    }

    if (!auth.scopes.includes(scope)) {
      return sendApiError(res, "FORBIDDEN", `This client does not have the required scope: ${scope}`, 403);
    }

    return next();
  };
}

function requireMasterApiKey(req, res, next) {
  if (req.apiAuth?.type === "master") {
    return next();
  }

  return sendApiError(res, "FORBIDDEN", "Master API key is required for this action.", 403);
}

async function enforceClientQuota(req, res, next) {
  const auth = req.apiAuth;
  if (!auth || auth.type !== "client") {
    return next();
  }

  const quotaLimit = auth.client?.quota_limit;
  const quotaWindow = auth.client?.quota_window;
  if (!quotaLimit || !quotaWindow) {
    return next();
  }

  try {
    const usage = await incrementClientQuotaUsage(auth.client.id, quotaWindow);
    if (usage.count > quotaLimit) {
      return sendApiError(
        res,
        "QUOTA_EXCEEDED",
        `Client quota exceeded for ${quotaWindow}.`,
        429,
        {
          quota_limit: quotaLimit,
          quota_window: quotaWindow,
          used: usage.count,
        }
      );
    }

    res.setHeader("X-Quota-Limit", quotaLimit);
    res.setHeader("X-Quota-Remaining", Math.max(0, quotaLimit - usage.count));
    res.setHeader("X-Quota-Window", quotaWindow);

    req.apiQuota = {
      limit: quotaLimit,
      window: quotaWindow,
      used: usage.count,
      remaining: Math.max(0, quotaLimit - usage.count),
    };
    return next();
  } catch (error) {
    return sendApiError(res, "QUOTA_CHECK_FAILED", error.message, 500);
  }
}

function attachApiUsageLogger(req, res, next) {
  res.on("finish", () => {
    void logApiUsage(req, res.statusCode);
  });

  return next();
}

function normalizeApiLimit(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function isTruthyQueryValue(value) {
  return ["1", "true", "yes"].includes(String(value || "").trim().toLowerCase());
}

function getSchedulerHealthSnapshot() {
  return {
    main: {
      enabled: schedulerState.enabled,
      healthy: !schedulerState.enabled || !isTimestampStale(schedulerState.lastTickAt, SCHEDULER_HEALTH_THRESHOLD_MS),
      tick_ms: SCHEDULER_TICK_MS,
      primary_sources: PRIMARY_NEWS_SOURCE_STRATEGY,
      primary_source_limit: SCHEDULER_PRIMARY_SOURCE_LIMIT,
      last_tick_at: schedulerState.lastTickAt,
      last_run_at: schedulerState.lastRunAt,
      last_window_key: schedulerState.lastWindowKey,
      quiet_hours: schedulerState.quietHours,
    },
    ai: {
      enabled: aiSchedulerState.enabled,
      healthy: !aiSchedulerState.enabled || !isTimestampStale(aiSchedulerState.lastTickAt, AI_SCHEDULER_HEALTH_THRESHOLD_MS),
      tick_ms: AI_SCHEDULER_TICK_MS,
      last_tick_at: aiSchedulerState.lastTickAt,
      last_run_at: aiSchedulerState.lastRunAt,
      last_window_key: aiSchedulerState.lastWindowKey,
      frequency_minutes: aiSchedulerState.frequency_minutes,
    },
    mpinfo_districts: getMpInfoDistrictSchedulerHealthSnapshot(),
    retention: getRetentionCleanupHealthSnapshot(),
  };
}

function buildDeliveryCategoryState(category) {
  const mainState = schedulerState.categories[category] || {};
  const aiState = aiSchedulerState.categories[category] || {};

  return {
    category,
    category_display_name: getCategoryDisplayName(category),
    main_cron: {
      scheduled_offset_seconds: mainState.scheduledOffsetSeconds ?? null,
      last_run_at: mainState.lastRunAt || null,
      last_status: mainState.lastStatus || null,
      saved_count: mainState.savedCount ?? 0,
      skipped_count: mainState.skippedCount ?? 0,
      failed_count: mainState.failedCount ?? 0,
      last_headline: mainState.lastHeadline || null,
    },
    ai_cron: {
      last_run_at: aiState.lastRunAt || null,
      last_status: aiState.lastStatus || null,
      news_id: aiState.newsId || null,
      title: aiState.title || null,
      message: aiState.message || null,
    },
  };
}

function groupDeliveryRecordsByCategory(records) {
  return Object.entries(
    records.reduce((accumulator, record) => {
      const key = normalizeCategory(record.ui_hindi?.category || record.category || DEFAULT_CATEGORY);
      if (!accumulator[key]) {
        accumulator[key] = [];
      }

      accumulator[key].push({
        ...record,
        category: key,
        ui_hindi: record.ui_hindi ? { ...record.ui_hindi, category: key } : record.ui_hindi,
      });
      return accumulator;
    }, {})
  )
    .sort(([leftCategory], [rightCategory]) => compareCategories(leftCategory, rightCategory))
    .map(([category, items]) => ({
      ...buildDeliveryCategoryState(category),
      published_count: items.length,
      records: items,
    }));
}

function isFreshDeliveryRecord(record) {
  const sourceTime = record?.source?.fetched_at || record?.updated_at || record?.published_at;
  const deliveredImageUrl = record?.media?.image_link || record?.news?.image_link || record?.source?.image_link || "";
  if (isBlockedArticleImageUrl(deliveredImageUrl)) {
    return false;
  }

  return isFreshPublishedDate(sourceTime).fresh;
}

async function buildCronAwareDeliveryFeed({ category = null, language = "both", limit = 24, grouped = true } = {}) {
  const records = (await listDeliveredAiRewrites(dbPool, { category, language, limit: Math.min(limit * 3, 200) }))
    .filter(isFreshDeliveryRecord)
    .slice(0, limit);
  const categories = category
    ? [category]
    : Array.from(new Set(records.map((record) => record.ui_hindi?.category || record.category).filter(Boolean))).sort(compareCategories);

  return {
    delivery_mode: "cron_aligned_published_feed",
    generated_at: new Date().toISOString(),
    category_filter: category,
    language,
    limit,
    grouped,
    schedulers: getSchedulerHealthSnapshot(),
    categories: categories.map((item) => buildDeliveryCategoryState(item)),
    count: records.length,
    records: grouped ? undefined : records,
    grouped_records: grouped ? groupDeliveryRecordsByCategory(records) : undefined,
  };
}

async function listNewsRecords({ category = null, limit = 100 } = {}) {
  if (!dbPool) {
    throw new Error("Database pool is not initialized.");
  }

  const queryText = category
    ? `
      SELECT id, category, search_query, title, source_url, image_link, image_source, fetched_at, feed_source, feed_url
      , source_excerpt, source_published_at
      FROM fetched_news
      WHERE category = ?
      ORDER BY id DESC
      LIMIT ?
    `
    : `
      SELECT id, category, search_query, title, source_url, image_link, image_source, fetched_at, feed_source, feed_url
      , source_excerpt, source_published_at
      FROM fetched_news
      ORDER BY id DESC
      LIMIT ?
    `;

  const [rows] = await dbPool.query(queryText, category ? [category, limit] : [limit]);
  return rows.map((row) => ({
    ...row,
    category: normalizeCategory(row.category || DEFAULT_CATEGORY),
  }));
}

async function listGroupedNewsRecords(limit = 500) {
  const rows = await listNewsRecords({ limit });
  return groupRecordsByCategory(rows);
}

function hashApiKey(apiKey) {
  return crypto.createHash("sha256").update(String(apiKey || "")).digest("hex");
}

function generateApiKey() {
  return `gts_${crypto.randomBytes(24).toString("hex")}`;
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeOriginsList(values = []) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => normalizeOriginValue(value))
    .filter(Boolean);
}

function normalizeOriginValue(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (raw === "*") {
    return "*";
  }

  try {
    return new URL(raw).origin.toLowerCase();
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

function normalizeScopesList(values = []) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => String(value || "").trim())
    .filter((value) => AVAILABLE_API_SCOPES.includes(value));
}

function formatApiClientRecord(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    is_active: !!row.is_active,
    allowed_origins: parseJsonArray(row.allowed_origins_json),
    allowed_scopes: parseJsonArray(row.allowed_scopes_json),
    quota_limit: row.quota_limit,
    quota_window: row.quota_window,
    notes: row.notes,
    last_used_at: row.last_used_at,
    last_used_origin: row.last_used_origin,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeQuotaWindow(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["day", "month"].includes(normalized) ? normalized : null;
}

function getQuotaWindowStart(windowName) {
  const now = new Date();
  if (windowName === "month") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  }

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
}

function getQuotaWindowEnd(windowName) {
  const now = new Date();
  if (windowName === "month") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  }

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
}

function buildQuotaCounterKey(clientId, quotaWindow) {
  const windowStart = getQuotaWindowStart(quotaWindow);
  const windowToken = quotaWindow === "month"
    ? windowStart.toISOString().slice(0, 7)
    : windowStart.toISOString().slice(0, 10);

  return `quota:${clientId}:${quotaWindow}:${windowToken}`;
}

async function incrementClientQuotaUsage(clientId, quotaWindow) {
  const ttlMs = Math.max(1_000, getQuotaWindowEnd(quotaWindow).getTime() - Date.now());
  return incrementCounter({
    key: buildQuotaCounterKey(clientId, quotaWindow),
    windowMs: ttlMs,
    memoryStore: quotaStore,
  });
}

async function countApiUsageForClient(clientId, quotaWindow) {
  if (!dbPool || !clientId || !quotaWindow) {
    return 0;
  }

  const windowStart = getQuotaWindowStart(quotaWindow);
  const [rows] = await dbPool.execute(
    `
      SELECT COUNT(*) AS total
      FROM api_usage_logs
      WHERE client_id = ? AND created_at >= ?
    `,
    [clientId, windowStart]
  );

  return rows[0]?.total || 0;
}

async function logApiUsage(req, statusCode) {
  if (!dbPool) {
    return;
  }

  const auth = req.apiAuth;
  await dbPool.execute(
    `
      INSERT INTO api_usage_logs (
        client_id, client_name, auth_type, method, path, origin, ip_address, status_code
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      auth?.client?.id || null,
      auth?.client?.name || null,
      auth?.type || "anonymous",
      req.method,
      req.originalUrl || req.path,
      req.headers.origin || null,
      req.ip || null,
      statusCode,
    ]
  );
}

async function createAdminAuditLog(req, action, targetType, targetId, details = null) {
  if (!dbPool) {
    return;
  }

  await dbPool.execute(
    `
      INSERT INTO admin_audit_logs (actor_type, actor_label, action, target_type, target_id, details_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      req.apiAuth?.type || "unknown",
      req.apiAuth?.client?.name || "master",
      action,
      targetType,
      targetId ? String(targetId) : null,
      details ? JSON.stringify(details) : null,
    ]
  );
}

async function listAdminAuditLogs(limit = 100) {
  if (!dbPool) {
    throw new Error("Database pool is not initialized.");
  }

  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 100, 500));
  const [rows] = await dbPool.query(
    `
      SELECT *
      FROM admin_audit_logs
      ORDER BY id DESC
      LIMIT ?
    `,
    [safeLimit]
  );

  return rows.map((row) => ({
    ...row,
    details: row.details_json ? JSON.parse(row.details_json) : null,
  }));
}

async function findApiClientByKey(apiKey) {
  if (!dbPool) {
    throw new Error("Database pool is not initialized.");
  }

  const [rows] = await dbPool.execute(
    `
      SELECT *
      FROM api_clients
      WHERE key_hash = ?
      LIMIT 1
    `,
    [hashApiKey(apiKey)]
  );

  return rows[0] || null;
}

async function updateApiClientLastUsed(clientId, origin) {
  if (!dbPool || !clientId) {
    return;
  }

  await dbPool.execute(
    `
      UPDATE api_clients
      SET last_used_at = CURRENT_TIMESTAMP, last_used_origin = ?
      WHERE id = ?
    `,
    [origin || null, clientId]
  );
}

async function listApiClients() {
  if (!dbPool) {
    throw new Error("Database pool is not initialized.");
  }

  const [rows] = await dbPool.query(
    `
      SELECT *
      FROM api_clients
      ORDER BY id DESC
    `
  );

  return rows.map(formatApiClientRecord);
}

async function createApiClient({ name, allowedOrigins = [], allowedScopes = [], quotaLimit = null, quotaWindow = null, notes = "" }) {
  if (!dbPool) {
    throw new Error("Database pool is not initialized.");
  }

  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);
  const normalizedOrigins = normalizeOriginsList(allowedOrigins);
  const normalizedScopes = normalizeScopesList(allowedScopes);

  const normalizedQuotaLimit = Number.isFinite(Number(quotaLimit)) ? Number(quotaLimit) : null;
  const normalizedQuotaWindow = normalizeQuotaWindow(quotaWindow);
  const initialActiveValue = dbPool.dialect === "postgres" ? true : 1;

  const [result] = await dbPool.execute(
    dbPool.dialect === "postgres"
      ? `
          INSERT INTO api_clients (name, key_hash, is_active, allowed_origins_json, allowed_scopes_json, quota_limit, quota_window, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `
      : `
          INSERT INTO api_clients (name, key_hash, is_active, allowed_origins_json, allowed_scopes_json, quota_limit, quota_window, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
    [
      String(name || "").trim(),
      keyHash,
      initialActiveValue,
      JSON.stringify(normalizedOrigins),
      JSON.stringify(normalizedScopes),
      normalizedQuotaLimit,
      normalizedQuotaWindow,
      String(notes || "").trim() || null,
    ]
  );

  const clientId = result.insertId;
  let rows = [];

  if (clientId) {
    [rows] = await dbPool.execute("SELECT * FROM api_clients WHERE id = ? LIMIT 1", [clientId]);
  } else {
    [rows] = await dbPool.execute("SELECT * FROM api_clients WHERE key_hash = ? LIMIT 1", [keyHash]);
  }

  return {
    client: formatApiClientRecord(rows[0]),
    api_key: apiKey,
  };
}

async function updateApiClient(clientId, payload) {
  if (!dbPool) {
    throw new Error("Database pool is not initialized.");
  }

  const [existingRows] = await dbPool.execute("SELECT * FROM api_clients WHERE id = ? LIMIT 1", [clientId]);
  const existing = existingRows[0];

  if (!existing) {
    return null;
  }

  const nextName = payload.name !== undefined ? String(payload.name || "").trim() : existing.name;
  const nextActive = payload.is_active !== undefined
    ? (dbPool.dialect === "postgres" ? Boolean(payload.is_active) : (payload.is_active ? 1 : 0))
    : existing.is_active;
  const nextOrigins = payload.allowed_origins !== undefined
    ? JSON.stringify(normalizeOriginsList(payload.allowed_origins))
    : existing.allowed_origins_json;
  const nextScopes = payload.allowed_scopes !== undefined
    ? JSON.stringify(normalizeScopesList(payload.allowed_scopes))
    : existing.allowed_scopes_json;
  const nextQuotaLimit = payload.quota_limit !== undefined
    ? (Number.isFinite(Number(payload.quota_limit)) ? Number(payload.quota_limit) : null)
    : existing.quota_limit;
  const nextQuotaWindow = payload.quota_window !== undefined
    ? normalizeQuotaWindow(payload.quota_window)
    : existing.quota_window;
  const nextNotes = payload.notes !== undefined ? String(payload.notes || "").trim() || null : existing.notes;

  await dbPool.execute(
    `
      UPDATE api_clients
      SET name = ?, is_active = ?, allowed_origins_json = ?, allowed_scopes_json = ?, quota_limit = ?, quota_window = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [nextName, nextActive, nextOrigins, nextScopes, nextQuotaLimit, nextQuotaWindow, nextNotes, clientId]
  );

  const [rows] = await dbPool.execute("SELECT * FROM api_clients WHERE id = ? LIMIT 1", [clientId]);
  return formatApiClientRecord(rows[0]);
}

async function rotateApiClientKey(clientId) {
  if (!dbPool) {
    throw new Error("Database pool is not initialized.");
  }

  const apiKey = generateApiKey();
  const [result] = await dbPool.execute(
    `
      UPDATE api_clients
      SET key_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [hashApiKey(apiKey), clientId]
  );

  if (result.affectedRows < 1) {
    return null;
  }

  const [rows] = await dbPool.execute("SELECT * FROM api_clients WHERE id = ? LIMIT 1", [clientId]);
  return {
    client: formatApiClientRecord(rows[0]),
    api_key: apiKey,
  };
}

async function withDatabaseLock(lockName, callback) {
  if (!dbPool) {
    throw new Error("Database pool is not initialized.");
  }

  if (dbPool.dialect === "postgres") {
    const lockId = Math.abs(hashApiKey(lockName).slice(0, 15).split("").reduce((acc, char) => {
      return (acc * 31 + char.charCodeAt(0)) % 2147483647;
    }, 0));
    const [rows] = await dbPool.query("SELECT pg_try_advisory_lock(?) AS acquired", [lockId]);
    const acquired = Boolean(rows[0]?.acquired);

    if (!acquired) {
      return {
        acquired: false,
        result: null,
      };
    }

    try {
      const result = await callback();
      return {
        acquired: true,
        result,
      };
    } finally {
      await dbPool.query("SELECT pg_advisory_unlock(?)", [lockId]);
    }
  }

  const connection = await dbPool.getConnection();

  try {
    const [rows] = await connection.query("SELECT GET_LOCK(?, 0) AS acquired", [lockName]);
    const acquired = rows[0]?.acquired === 1;

    if (!acquired) {
      return {
        acquired: false,
        result: null,
      };
    }

    try {
      const result = await callback();
      return {
        acquired: true,
        result,
      };
    } finally {
      await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
    }
  } finally {
    connection.release();
  }
}

function markIngestionBusy(workerName, message) {
  schedulerState.coordination = {
    ...schedulerState.coordination,
    lastBusyAt: new Date().toISOString(),
    lastBusyReason: message || `${workerName} is busy.`,
  };
}

async function withIngestionWorkerLock(workerName, callback) {
  const locked = await withDatabaseLock(INGESTION_WORKER_LOCK_NAME, async () => {
    schedulerState.coordination = {
      ...schedulerState.coordination,
      activeWorker: workerName,
      activeSince: new Date().toISOString(),
    };

    try {
      return await callback();
    } finally {
      schedulerState.coordination = {
        ...schedulerState.coordination,
        activeWorker: null,
        activeSince: null,
      };
    }
  });

  if (!locked.acquired) {
    markIngestionBusy(workerName, `Skipped ${workerName}; another cron worker is already running.`);
  }

  return locked;
}

async function isIngestionWorkerBusy() {
  const locked = await withDatabaseLock(INGESTION_WORKER_LOCK_NAME, async () => true);
  return !locked.acquired;
}

function validateProductionConfig() {
  if (NODE_ENV !== "production") {
    return;
  }

  if (!MASTER_API_KEY || MASTER_API_KEY === "local-dev-key") {
    throw new Error("Production requires a strong MASTER_API_KEY value. Remove the default local-dev-key.");
  }

  if (MASTER_API_KEY.length < 16) {
    throw new Error("Production MASTER_API_KEY should be at least 16 characters long.");
  }

  if (API_CORS_ORIGINS.includes("*")) {
    throw new Error("Production requires explicit API_CORS_ORIGINS values. Do not use '*'.");
  }

  if (LEGACY_PUBLIC_ROUTES_ENABLED) {
    throw new Error("Production must keep LEGACY_PUBLIC_ROUTES_ENABLED disabled. Use only /api/v1/* endpoints.");
  }

  if (!REDIS_URL) {
    console.warn("Production is running without REDIS_URL. Rate limiting and quota control will fall back to per-instance memory.");
  }

  if (AI_SCHEDULER_ENABLED && !String(process.env.GEMINI_API_KEY || "").trim()) {
    throw new Error("AI_SCHEDULER_ENABLED is true, but GEMINI_API_KEY is missing.");
  }
}

function normalizeArticleLimit(value) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return DEFAULT_ARTICLE_LIMIT;
  }

  return Math.min(parsed, MAX_ARTICLE_LIMIT);
}

function normalizeTotalLimit(value) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return DEFAULT_TOTAL_LIMIT;
  }

  return Math.min(parsed, MAX_TOTAL_LIMIT);
}

function normalizeCategory(value) {
  return normalizeUnifiedCategory(value, { logger: console });
}

function normalizeDeliveryLanguage(value) {
  const normalized = String(value || "both").trim().toLowerCase();
  return ["english", "hindi", "both"].includes(normalized) ? normalized : "both";
}

function getCategoryDisplayName(category) {
  return getUnifiedCategoryDisplayName(category);
}

function getIndiaTimeParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now).reduce((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = part.value;
    }

    return accumulator;
  }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function isQuietHours(now = new Date()) {
  const indiaNow = getIndiaTimeParts(now);
  if (QUIET_HOUR_START === QUIET_HOUR_END) {
    return false;
  }

  if (QUIET_HOUR_START < QUIET_HOUR_END) {
    return indiaNow.hour >= QUIET_HOUR_START && indiaNow.hour < QUIET_HOUR_END;
  }

  return indiaNow.hour >= QUIET_HOUR_START || indiaNow.hour < QUIET_HOUR_END;
}

function buildWindowKey(now = new Date()) {
  const indiaNow = getIndiaTimeParts(now);
  const bucketMinute = indiaNow.minute < 30 ? "00" : "30";
  const month = String(indiaNow.month).padStart(2, "0");
  const day = String(indiaNow.day).padStart(2, "0");
  const hour = String(indiaNow.hour).padStart(2, "0");
  return `${indiaNow.year}-${month}-${day} ${hour}:${bucketMinute}`;
}

function buildAiWindowKey(now = new Date()) {
  const indiaNow = getIndiaTimeParts(now);
  const bucketMinute = String(Math.floor(indiaNow.minute / 15) * 15).padStart(2, "0");
  const month = String(indiaNow.month).padStart(2, "0");
  const day = String(indiaNow.day).padStart(2, "0");
  const hour = String(indiaNow.hour).padStart(2, "0");
  return `${indiaNow.year}-${month}-${day} ${hour}:${bucketMinute}`;
}

function getWindowSecond(now = new Date()) {
  const indiaNow = getIndiaTimeParts(now);
  const minuteInWindow = indiaNow.minute % 30;
  return minuteInWindow * 60 + indiaNow.second;
}

function indiaDateTimeToUtcDate({ year, month, day, hour = 0, minute = 0, second = 0 }) {
  return new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30, second));
}

function getSchedulerDailyWindow(now = new Date()) {
  const indiaNow = getIndiaTimeParts(now);
  let startAt = indiaDateTimeToUtcDate({
    year: indiaNow.year,
    month: indiaNow.month,
    day: indiaNow.day,
    hour: SCHEDULER_ACTIVE_START_HOUR,
  });

  if (indiaNow.hour < SCHEDULER_ACTIVE_START_HOUR) {
    startAt = new Date(startAt.getTime() - 24 * 60 * 60 * 1000);
  }

  return {
    startAt,
    endAt: new Date(startAt.getTime() + 24 * 60 * 60 * 1000),
  };
}

function getSchedulerActiveHours() {
  if (SCHEDULER_ACTIVE_END_HOUR > SCHEDULER_ACTIVE_START_HOUR) {
    return SCHEDULER_ACTIVE_END_HOUR - SCHEDULER_ACTIVE_START_HOUR;
  }

  return (24 - SCHEDULER_ACTIVE_START_HOUR) + SCHEDULER_ACTIVE_END_HOUR;
}

function isHourInPeakWindow(hour) {
  return SCHEDULER_PEAK_WINDOWS.some(({ startHour, endHour }) => (
    hour >= startHour && hour < endHour
  ));
}

function getSchedulerPaceBudget(now = new Date()) {
  const { startAt } = getSchedulerDailyWindow(now);
  const activeHours = getSchedulerActiveHours();
  const elapsedHours = Math.max(0, Math.min((now.getTime() - startAt.getTime()) / (60 * 60 * 1000), activeHours));
  const stepMinutes = 5;
  const elapsedSteps = Math.floor((elapsedHours * 60) / stepMinutes);
  const totalSteps = activeHours * (60 / stepMinutes);
  let elapsedWeight = 0;
  let totalWeight = 0;

  for (let step = 0; step < totalSteps; step += 1) {
    const relativeHour = (step * stepMinutes) / 60;
    const clockHour = (SCHEDULER_ACTIVE_START_HOUR + Math.floor(relativeHour)) % 24;
    const weight = isHourInPeakWindow(clockHour) ? SCHEDULER_PEAK_WEIGHT : 1;
    totalWeight += weight;
    if (step < elapsedSteps) {
      elapsedWeight += weight;
    }
  }

  if (elapsedSteps > 0 && elapsedSteps < totalSteps) {
    const partialMinutes = (elapsedHours * 60) - (elapsedSteps * stepMinutes);
    const relativeHour = (elapsedSteps * stepMinutes) / 60;
    const clockHour = (SCHEDULER_ACTIVE_START_HOUR + Math.floor(relativeHour)) % 24;
    elapsedWeight += (isHourInPeakWindow(clockHour) ? SCHEDULER_PEAK_WEIGHT : 1) * (partialMinutes / stepMinutes);
  }

  return Math.max(0, Math.min(DAILY_NEWS_FETCH_LIMIT, Math.floor((DAILY_NEWS_FETCH_LIMIT * elapsedWeight) / totalWeight)));
}

async function countSavedNewsInSchedulerWindow(now = new Date()) {
  if (!dbPool) {
    return 0;
  }

  const { startAt, endAt } = getSchedulerDailyWindow(now);
  const [rows] = await dbPool.execute(
    `
      SELECT COUNT(*) AS saved_count
      FROM fetched_news
      WHERE fetched_at >= ?
        AND fetched_at < ?
    `,
    [startAt, endAt]
  );
  return Number(rows?.[0]?.saved_count || 0);
}

async function getDailyNewsQuota(now = new Date()) {
  const savedCount = await countSavedNewsInSchedulerWindow(now);
  const paceBudget = getSchedulerPaceBudget(now);
  const { startAt, endAt } = getSchedulerDailyWindow(now);

  return {
    limit: DAILY_NEWS_FETCH_LIMIT,
    savedCount,
    remaining: Math.max(0, DAILY_NEWS_FETCH_LIMIT - savedCount),
    paceBudget,
    paceRemaining: Math.max(0, paceBudget - savedCount),
    windowStart: startAt.toISOString(),
    windowEnd: endAt.toISOString(),
    timezone: INDIA_TIMEZONE,
    activeStartHour: SCHEDULER_ACTIVE_START_HOUR,
    activeEndHour: SCHEDULER_ACTIVE_END_HOUR,
    peakWindows: SCHEDULER_PEAK_WINDOWS,
  };
}

function buildDailyQuotaSkippedFetchResult(category, source, quota) {
  return {
    category: category || "all",
    source,
    fetched_count: 0,
    matched_count: 0,
    saved_count: 0,
    existing_count: 0,
    failed_count: 0,
    skipped_count: 1,
    results: [
      {
        status: "Skipped",
        category: category || "all",
        feed_source: source,
        message: `Daily news limit reached (${quota.savedCount}/${quota.limit}).`,
      },
    ],
    rewriteCandidates: [],
    daily_quota: quota,
  };
}

function resolveBrowserExecutablePath() {
  const candidatePaths = [
    BROWSER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);

  const explicitPath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath));
  if (explicitPath) {
    return explicitPath;
  }

  try {
    const bundledPath = puppeteer.executablePath();
    if (bundledPath && fs.existsSync(bundledPath)) {
      return bundledPath;
    }
  } catch (error) {
    console.warn(`Puppeteer bundled browser path resolution failed: ${error.message}`);
  }

  return null;
}

function isTimestampStale(timestamp, thresholdMs) {
  if (!timestamp) {
    return true;
  }

  const value = new Date(timestamp).getTime();
  if (Number.isNaN(value)) {
    return true;
  }

  return Date.now() - value > thresholdMs;
}

async function withTimeout(promise, timeoutMs, label) {
  let timeoutId = null;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function waitForMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateSchedulerHeartbeat() {
  schedulerState.lastTickAt = new Date().toISOString();
}

function updateAiSchedulerHeartbeat() {
  aiSchedulerState.lastTickAt = new Date().toISOString();
}

function startHeartbeat(intervalRef, updateHeartbeat, intervalMs) {
  stopHeartbeat(intervalRef);
  updateHeartbeat();
  return setInterval(() => {
    updateHeartbeat();
  }, intervalMs);
}

function stopHeartbeat(intervalRef) {
  if (intervalRef) {
    clearInterval(intervalRef);
  }
}

function clearSchedulerIntervals() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }

  if (aiSchedulerInterval) {
    clearInterval(aiSchedulerInterval);
    aiSchedulerInterval = null;
  }

  if (mpInfoDistrictSchedulerInterval) {
    clearInterval(mpInfoDistrictSchedulerInterval);
    mpInfoDistrictSchedulerInterval = null;
  }

  if (retentionCleanupInterval) {
    clearInterval(retentionCleanupInterval);
    retentionCleanupInterval = null;
  }

  stopHeartbeat(schedulerHeartbeatInterval);
  schedulerHeartbeatInterval = null;
  stopHeartbeat(aiSchedulerHeartbeatInterval);
  aiSchedulerHeartbeatInterval = null;

  if (schedulerWatchdogInterval) {
    clearInterval(schedulerWatchdogInterval);
    schedulerWatchdogInterval = null;
  }
}

function updateRetentionCleanupHeartbeat() {
  retentionState.lastTickAt = new Date().toISOString();
}

function getRetentionCleanupHealthSnapshot() {
  return {
    enabled: retentionState.enabled,
    healthy: !retentionState.enabled
      || !isTimestampStale(retentionState.lastTickAt, (retentionState.intervalMs * 2) + 15_000),
    tick_ms: retentionState.intervalMs,
    last_tick_at: retentionState.lastTickAt,
    last_run_at: retentionState.lastRunAt,
    last_status: retentionState.lastStatus,
    last_error: retentionState.lastError,
    last_result: retentionState.lastResult,
  };
}

function updateMpInfoDistrictSchedulerHeartbeat() {
  mpInfoDistrictSchedulerState.lastTickAt = new Date().toISOString();
}

function getMpInfoDistrictSchedulerHealthSnapshot() {
  return {
    enabled: mpInfoDistrictSchedulerState.enabled,
    browser_enabled: mpInfoDistrictSchedulerState.browserEnabled,
    healthy: !mpInfoDistrictSchedulerState.enabled
      || !isTimestampStale(
        mpInfoDistrictSchedulerState.lastTickAt,
        (mpInfoDistrictSchedulerState.intervalMs * 2) + 60_000
      ),
      interval_ms: mpInfoDistrictSchedulerState.intervalMs,
      limit: mpInfoDistrictSchedulerState.limit,
      district_scan_limit: mpInfoDistrictSchedulerState.districtScanLimit,
      next_district_index: mpInfoDistrictSchedulerState.nextDistrictIndex,
      rewrite: mpInfoDistrictSchedulerState.rewrite,
    last_tick_at: mpInfoDistrictSchedulerState.lastTickAt,
    last_run_at: mpInfoDistrictSchedulerState.lastRunAt,
    last_status: mpInfoDistrictSchedulerState.lastStatus,
    last_error: mpInfoDistrictSchedulerState.lastError,
    last_result: mpInfoDistrictSchedulerState.lastResult,
  };
}

async function runRetentionCleanupCycle(triggerSource = "schedule") {
  if (!retentionState.enabled || retentionCleanupRunning || !dbPool) {
    return {
      skipped: true,
      status: "Skipped",
      message: "Retention cleanup is disabled or already running.",
    };
  }

  retentionCleanupRunning = true;
  updateRetentionCleanupHeartbeat();

  try {
    const locked = await withDatabaseLock(RETENTION_CLEANUP_LOCK_NAME, async () => (
      runDatabaseRetentionCleanup(dbPool, RETENTION_CONFIG)
    ));

    if (!locked.acquired) {
      retentionState.lastStatus = "Busy";
      retentionState.lastError = null;
      return {
        skipped: true,
        status: "Busy",
        message: "Another backend instance is already running retention cleanup.",
      };
    }

    const result = locked.result;
    retentionState.lastRunAt = new Date().toISOString();
    retentionState.lastStatus = result.deleted_total > 0 ? "Success" : "Idle";
    retentionState.lastError = null;
    retentionState.lastResult = {
      ...result,
      trigger_source: triggerSource,
    };

    return result;
  } catch (error) {
    retentionState.lastStatus = "Error";
    retentionState.lastError = error.message;
    console.error("Retention cleanup failed:", error.message);
    throw error;
  } finally {
    retentionCleanupRunning = false;
    updateRetentionCleanupHeartbeat();
  }
}

function startRetentionCleanupScheduler() {
  if (!retentionState.enabled || retentionCleanupInterval) {
    return;
  }

  retentionCleanupInterval = setInterval(() => {
    void runRetentionCleanupCycle("schedule").catch((error) => {
      console.error("Retention cleanup tick failed:", error.message);
    });
  }, retentionState.intervalMs);

  void runRetentionCleanupCycle("startup").catch((error) => {
    console.error("Retention cleanup startup run failed:", error.message);
  });
}

function getCategorySchedule() {
  const categories = Object.keys(RSS_FEEDS);
  return categories.map((category, index) => ({
    category,
    offsetSeconds: Math.floor((index * 1800) / categories.length),
  }));
}

function compareCategories(left, right) {
  const leftIndex = DELIVERY_CATEGORY_ORDER.indexOf(left);
  const rightIndex = DELIVERY_CATEGORY_ORDER.indexOf(right);

  if (leftIndex === -1 && rightIndex === -1) {
    return String(left).localeCompare(String(right));
  }

  if (leftIndex === -1) {
    return 1;
  }

  if (rightIndex === -1) {
    return -1;
  }

  return leftIndex - rightIndex;
}

function groupRecordsByCategory(records) {
  return Object.entries(
    records.reduce((accumulator, record) => {
      const key = normalizeCategory(record.ui_hindi?.category || record.category || DEFAULT_CATEGORY);
      if (!accumulator[key]) {
        accumulator[key] = [];
      }

      accumulator[key].push({
        ...record,
        category: key,
      });
      return accumulator;
    }, {})
  )
    .sort(([leftCategory], [rightCategory]) => compareCategories(leftCategory, rightCategory))
    .map(([category, items]) => ({
      category,
      count: items.length,
      records: items,
    }));
}

async function fetchTextWithProfiles(url, acceptHeader) {
  let response = null;
  let lastError = null;
  let lastStatus = null;

  for (const profile of RSS_REQUEST_PROFILES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, RSS_REQUEST_TIMEOUT_MS);

    try {
      response = await fetch(url, {
        headers: {
          ...profile,
          Accept: acceptHeader,
        },
        signal: controller.signal,
      });
      if (response.ok) {
        break;
      }

      lastStatus = response.status;
      lastError = new Error(`RSS feed request failed with status ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    response,
    lastError,
    lastStatus,
  };
}

function getFallbackSectionUrl(feedConfig, category) {
  if (feedConfig.type === "state-gov") {
    return feedConfig.url;
  }

  return null;
}

function isRejectedGovernmentUrl(candidateUrl) {
  const normalized = String(candidateUrl || "").toLowerCase();
  return (
    /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar)(?:[?#].*)?$/i.test(normalized) ||
    /tender|tenders|recruitment|vacancy|career|careers|jobs|admission|result|results|download|login|contact|sitemap|about|intro|introduction|history|profile/.test(normalized)
  );
}

function extractArticleUrlsFromHtml(html, baseUrl, predicate, limit) {
  const seen = new Set();
  const urls = [];

  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    let candidateUrl = null;

    try {
      candidateUrl = new URL(match[1], baseUrl).href;
    } catch {
      continue;
    }

    if (!predicate(candidateUrl) || seen.has(candidateUrl)) {
      continue;
    }

    seen.add(candidateUrl);
    urls.push(candidateUrl);

    if (urls.length >= limit) {
      break;
    }
  }

  return urls;
}

function createSectionUrlPredicate(feedConfig, sectionUrl) {
  const sectionHref = String(sectionUrl || "").replace(/\/+$/, "");

  if (feedConfig.type === "state-gov") {
    return (candidateUrl) => {
      try {
        const sectionHost = new URL(sectionUrl).hostname.toLowerCase().replace(/^www\./, "");
        const parsed = new URL(candidateUrl);
        const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
        const pathname = parsed.pathname.toLowerCase();
        const text = `${pathname} ${parsed.search.toLowerCase()}`;
        const hasNewsSignal = /news|press|release|latest|update|updates|announcement|article|story|समाचार|प्रेस|खबर/.test(text);

        return (
          hostname === sectionHost &&
          candidateUrl.replace(/\/+$/, "") !== sectionHref &&
          pathname.split("/").filter(Boolean).length >= 1 &&
          !isRejectedGovernmentUrl(candidateUrl) &&
          !/\.(jpg|jpeg|png|webp|gif|svg|css|js)(?:[?#].*)?$/i.test(pathname) &&
          hasNewsSignal
        );
      } catch {
        return false;
      }
    };
  }

  return () => false;
}

async function getArticleUrlsFromSectionFallback(feedConfig, category, limit) {
  const sectionUrl = getFallbackSectionUrl(feedConfig, category);
  if (!sectionUrl) {
    return [];
  }

  const throttleReason = getFeedThrottleReason(feedConfig);
  if (throttleReason) {
    console.log(`Skipping ${feedConfig.source} section fallback (${category}): ${throttleReason}.`);
    return [];
  }

  markFeedAttempt(feedConfig);

  const { response, lastError, lastStatus } = await fetchTextWithProfiles(
    sectionUrl,
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  );

  if (!response || !response.ok) {
    if (lastStatus === 403 || lastStatus === 429) {
      markFeedBlocked(feedConfig, lastStatus);
      return [];
    }

    throw lastError || new Error("Section fallback request failed.");
  }

  markFeedSuccess(feedConfig);

  const html = await response.text();
  const directUrls = extractArticleUrlsFromHtml(
    html,
    sectionUrl,
    createSectionUrlPredicate(feedConfig, sectionUrl),
    limit
  );

  if (feedConfig.type !== "state-gov" || directUrls.length >= limit) {
    return directUrls;
  }

  const seen = new Set(directUrls);
  const sectionUrls = extractArticleUrlsFromHtml(
    html,
    sectionUrl,
    (candidateUrl) => {
      try {
        const parsed = new URL(candidateUrl);
        const sectionHost = new URL(sectionUrl).hostname.toLowerCase().replace(/^www\./, "");
        const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
        const text = `${parsed.pathname.toLowerCase()} ${parsed.search.toLowerCase()}`;
        return (
          hostname === sectionHost &&
          !seen.has(candidateUrl) &&
          !isRejectedGovernmentUrl(candidateUrl) &&
          /news|press|release|latest|update|updates|announcement|समाचार|प्रेस|खबर/.test(text)
        );
      } catch {
        return false;
      }
    },
    4
  );

  for (const nestedSectionUrl of sectionUrls) {
    if (directUrls.length >= limit) {
      break;
    }

    try {
      const nestedResult = await fetchTextWithProfiles(
        nestedSectionUrl,
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      );
      if (!nestedResult.response?.ok) {
        continue;
      }

      const nestedHtml = await nestedResult.response.text();
      for (const articleUrl of extractArticleUrlsFromHtml(
        nestedHtml,
        nestedSectionUrl,
        createSectionUrlPredicate(feedConfig, nestedSectionUrl),
        limit
      )) {
        if (!seen.has(articleUrl)) {
          seen.add(articleUrl);
          directUrls.push(articleUrl);
        }

        if (directUrls.length >= limit) {
          break;
        }
      }
    } catch {
      // Keep the scraper best-effort for heterogeneous government portals.
    }
  }

  return directUrls;
}

async function getArticleUrlsFromFeed(feedConfig, category, limit) {
  if (feedConfig.type === "state-gov") {
    const fallbackUrls = await getArticleUrlsFromSectionFallback(feedConfig, category, limit);
    if (fallbackUrls.length > 0) {
      console.log(`Using state government scraper for ${feedConfig.state || feedConfig.source}.`);
    }
    return fallbackUrls;
  }

  const throttleReason = getFeedThrottleReason(feedConfig);
  if (throttleReason) {
    console.log(`Skipping ${feedConfig.source} RSS feed (${category}): ${throttleReason}.`);
    return [];
  }

  markFeedAttempt(feedConfig);

  const { response, lastError, lastStatus } = await fetchTextWithProfiles(
    feedConfig.url,
    "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
  );

  if (!response || !response.ok) {
    if (lastStatus === 403 || lastStatus === 429) {
      markFeedBlocked(feedConfig, lastStatus);
      return [];
    }

    const fallbackUrls = await getArticleUrlsFromSectionFallback(feedConfig, category, limit);
    if (fallbackUrls.length > 0) {
      console.log(
        `Using section fallback for ${feedConfig.source} (${category}) after RSS status ${lastStatus || "error"}.`
      );
      return fallbackUrls;
    }

    throw lastError || new Error("RSS feed request failed.");
  }

  markFeedSuccess(feedConfig);

  const xml = await response.text();
  const itemMatches = Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/gi));

  if (!itemMatches.length) {
    const fallbackUrls = await getArticleUrlsFromSectionFallback(feedConfig, category, limit);
    if (fallbackUrls.length > 0) {
      console.log(`Using section fallback for ${feedConfig.source} (${category}) because RSS had no items.`);
      return fallbackUrls;
    }

    throw new Error("No article links found in the RSS feed.");
  }

  const seen = new Set();
  const articles = [];

  for (const match of itemMatches) {
    const itemXml = match[0];
    const url = extractRssTagValue(itemXml, "link").replace(/&amp;/g, "&").trim();

    if (!url || !url.startsWith("http") || seen.has(url)) {
      continue;
    }

    seen.add(url);
    const rssImageUrl = extractRssImageUrl(itemXml, feedConfig.url);
    const publishedAt =
      extractRssTagValue(itemXml, "pubDate") ||
      extractRssTagValue(itemXml, "published") ||
      extractRssTagValue(itemXml, "updated") ||
      extractRssTagValue(itemXml, "dc:date");
    articles.push({
      url,
      title: extractRssTagValue(itemXml, "title"),
      image_link: rssImageUrl,
      image_source: rssImageUrl ? "rss-image" : null,
      published_at: publishedAt || null,
    });

    if (articles.length >= limit) {
      break;
    }
  }

  if (!articles.length) {
    const fallbackUrls = await getArticleUrlsFromSectionFallback(feedConfig, category, limit);
    if (fallbackUrls.length > 0) {
      console.log(`Using section fallback for ${feedConfig.source} (${category}) because RSS had no usable URLs.`);
      return fallbackUrls;
    }

    throw new Error("The RSS feed did not contain usable article URLs.");
  }

  return articles;
}

async function getArticleUrlsFromFeeds(feedConfigs, limit, options = {}) {
  const startIndex = Number.isInteger(options.startIndex) ? options.startIndex : 0;
  const perFeedLimit = Math.min(
    Math.max(limit * FEED_QUEUE_MULTIPLIER, 3),
    FEED_QUEUE_CAP
  );
  const seen = new Set();
  const results = [];
  const orderedFeedConfigs = feedConfigs.map((_, index) => feedConfigs[(startIndex + index) % feedConfigs.length]);
  const feedQueues = [];
  let expensiveAttempts = 0;

  for (const feedConfig of orderedFeedConfigs) {
    if (isExpensiveNewsSource(feedConfig)) {
      const throttleReason = getFeedThrottleReason(feedConfig);
      if (throttleReason) {
        console.log(`Skipping ${feedConfig.source} feed (${options.category || DEFAULT_CATEGORY}): ${throttleReason}.`);
        continue;
      }

      if (expensiveAttempts >= EXPENSIVE_SOURCE_PER_RUN_LIMIT) {
        console.log(
          `Skipping ${feedConfig.source} feed (${options.category || DEFAULT_CATEGORY}): expensive source run limit reached.`
        );
        continue;
      }

      expensiveAttempts += 1;
    }

    try {
      const articles = await getArticleUrlsFromFeed(feedConfig, options.category || DEFAULT_CATEGORY, perFeedLimit);
      if (Array.isArray(articles) && articles.length > 0) {
        feedQueues.push({
          feed_source: feedConfig.source,
          feed_url: feedConfig.url,
          articles,
        });
      }
    } catch (error) {
      console.warn(
        `Feed fetch failed for ${feedConfig.source} (${feedConfig.url}): ${error?.message || "Unknown error"}`
      );
    }
  }

  if (!feedQueues.length) {
    throw new Error(`All feed requests failed for the selected category pool.`);
  }

  const orderedQueues = feedQueues;

  let madeProgress = true;
  while (results.length < limit && madeProgress) {
    madeProgress = false;

    for (const queue of orderedQueues) {
      while (queue.articles.length > 0) {
        const article = queue.articles.shift();
        const url = typeof article === "string" ? article : article?.url;
        if (!url || seen.has(url)) {
          continue;
        }

        seen.add(url);
        results.push({
          url,
          feed_source: queue.feed_source,
          feed_url: queue.feed_url,
          title: typeof article === "object" ? article.title || null : null,
          image_link: typeof article === "object" ? article.image_link || null : null,
          image_source: typeof article === "object" ? article.image_source || null : null,
          published_at: typeof article === "object" ? article.published_at || null : null,
        });
        madeProgress = true;
        break;
      }

      if (results.length >= limit) {
        break;
      }
    }
  }

  return results;
}

function getCategoryFeedPool(category, options = {}) {
  const normalizedCategory = normalizeCategory(category);
  const directFeeds = RSS_FEEDS[normalizedCategory] || [];
  const relatedCategories = CATEGORY_FEED_GROUPS[normalizedCategory] || [];
  const includeSources = new Set(normalizeFeedSourceList(options.includeSources));
  const excludeSources = new Set(normalizeFeedSourceList(options.excludeSources));
  const seenFeeds = new Set();
  const feedPool = [];
  const shouldIncludeFeed = (feed) => {
    const source = String(feed?.source || "").trim().toLowerCase();
    if (excludeSources.has(source)) {
      return false;
    }

    if (includeSources.size > 0 && !includeSources.has(source)) {
      return false;
    }

    return true;
  };

  for (const feed of directFeeds) {
    if (!shouldIncludeFeed(feed)) {
      continue;
    }

    const key = `${feed.source}:${feed.url}`;
    if (!seenFeeds.has(key)) {
      seenFeeds.add(key);
      feedPool.push(feed);
    }
  }

  for (const relatedCategory of relatedCategories) {
    const relatedFeeds = RSS_FEEDS[relatedCategory] || [];
    for (const feed of relatedFeeds) {
      if (!shouldIncludeFeed(feed)) {
        continue;
      }

      const key = `${feed.source}:${feed.url}`;
      if (!seenFeeds.has(key)) {
        seenFeeds.add(key);
        feedPool.push(feed);
      }
    }
  }

  return sortFeedsByPriority(feedPool);
}

function getSchedulerSourceCount(category) {
  const fallbackRssSourceCount = getCategoryFeedPool(category, {
    excludeSources: PRIMARY_RSS_SOURCES,
  }).length;
  return Math.max(fallbackRssSourceCount, 1);
}

function normalizePrimarySourceLimit(value, fallback = SCHEDULER_PRIMARY_SOURCE_LIMIT) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, 5);
}

function isAllowedImageHost(value) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const protocol = parsed.protocol.toLowerCase();

    if (!["http:", "https:"].includes(protocol)) {
      return false;
    }

    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "metadata.google.internal" ||
      hostname === "169.254.169.254"
    ) {
      return false;
    }

    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
      const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
      const [first, second] = parts;
      const isPrivate =
        first === 10 ||
        first === 127 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 169 && second === 254) ||
        first === 0;

      if (isPrivate) {
        return false;
      }
    }

    if (hostname === "::1" || hostname.startsWith("[::1]")) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function shouldBypassImageCompression(contentType) {
  const normalized = String(contentType || "").toLowerCase();
  return normalized.includes("image/gif") || normalized.includes("image/svg");
}

async function optimizeImageBuffer(buffer, contentType, acceptHeader, options = {}) {
  if (shouldBypassImageCompression(contentType)) {
    return {
      buffer,
      contentType,
    };
  }

  const maxWidth = options.maxWidth || IMAGE_PROXY_MAX_WIDTH;
  const webpQuality = options.webpQuality || IMAGE_PROXY_WEBP_QUALITY;
  const jpegQuality = options.jpegQuality || IMAGE_PROXY_JPEG_QUALITY;
  const transformer = sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: maxWidth,
      withoutEnlargement: true,
      fit: "inside",
    });

  const normalizedType = String(contentType || "").toLowerCase();
  const acceptsWebp = String(acceptHeader || "").toLowerCase().includes("image/webp");

  if (acceptsWebp) {
    return {
      buffer: await transformer.webp({
        quality: webpQuality,
        effort: 4,
      }).toBuffer(),
      contentType: "image/webp",
    };
  }

  if (normalizedType.includes("image/png")) {
    return {
      buffer: await transformer.png({
        compressionLevel: 9,
        palette: !options.highQuality,
        effort: 7,
      }).toBuffer(),
      contentType: "image/png",
    };
  }

  return {
    buffer: await transformer.jpeg({
      quality: jpegQuality,
      mozjpeg: true,
      progressive: true,
    }).toBuffer(),
    contentType: "image/jpeg",
  };
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeRssText(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function extractAttributesFromTag(tag) {
  const attributes = {};
  const attributePattern = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;

  while ((match = attributePattern.exec(String(tag || "")))) {
    const key = match[1].toLowerCase();
    const value = match[3] || match[4] || match[5] || "";
    attributes[key] = decodeHtmlEntities(value.trim());
  }

  return attributes;
}

function extractRssTagValue(itemXml, tagName) {
  const escapedTag = String(tagName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, "i");
  const match = String(itemXml || "").match(pattern);
  return match ? normalizeRssText(match[1]) : "";
}

function extractRssImageUrl(itemXml, feedUrl) {
  const item = String(itemXml || "");
  const tagPatterns = [
    /<media:content\b[^>]*>/gi,
    /<media:thumbnail\b[^>]*>/gi,
    /<enclosure\b[^>]*>/gi,
  ];

  for (const pattern of tagPatterns) {
    const tags = item.match(pattern) || [];
    for (const tag of tags) {
      const attributes = extractAttributesFromTag(tag);
      const rawUrl = attributes.url || attributes.href || "";
      const type = String(attributes.type || "").toLowerCase();
      if (!rawUrl || (type && !type.startsWith("image/"))) {
        continue;
      }

      const resolvedUrl = (() => {
        try {
          return new URL(rawUrl, feedUrl).href;
        } catch {
          return rawUrl;
        }
      })();
      const safeImageUrl = sanitizeArticleImageUrl(resolvedUrl);
      if (safeImageUrl) {
        return safeImageUrl;
      }
    }
  }

  const imageTags = item.match(/<image\b[\s\S]*?<\/image>/gi) || [];
  for (const imageTag of imageTags) {
    const rawUrl = extractRssTagValue(imageTag, "url");
    if (rawUrl) {
      const resolvedUrl = (() => {
        try {
          return new URL(rawUrl, feedUrl).href;
        } catch {
          return rawUrl;
        }
      })();
      const safeImageUrl = sanitizeArticleImageUrl(resolvedUrl);
      if (safeImageUrl) {
        return safeImageUrl;
      }
    }
  }

  return "";
}

function extractMetaContentFromHtml(html, metaKey) {
  const metaTags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  const normalizedKey = String(metaKey || "").toLowerCase();

  for (const tag of metaTags) {
    const attributes = extractAttributesFromTag(tag);
    const property = String(attributes.property || "").toLowerCase();
    const name = String(attributes.name || "").toLowerCase();
    const content = attributes.content || "";

    if (content && (property === normalizedKey || name === normalizedKey)) {
      return content;
    }
  }

  return null;
}

function extractLinkHrefFromHtml(html, relValue) {
  const linkTags = String(html || "").match(/<link\b[^>]*>/gi) || [];
  const normalizedRelValue = String(relValue || "").toLowerCase();

  for (const tag of linkTags) {
    const attributes = extractAttributesFromTag(tag);
    const relTokens = String(attributes.rel || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    if (relTokens.includes(normalizedRelValue) && attributes.href) {
      return attributes.href;
    }
  }

  return null;
}

function pickBestSrcsetCandidate(srcset, articleUrl) {
  const candidates = String(srcset || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const pieces = part.split(/\s+/).filter(Boolean);
      const rawUrl = pieces.shift();
      const descriptor = pieces[0] || "";
      let score = 0;

      if (descriptor.endsWith("w")) {
        score = Number.parseInt(descriptor, 10) || 0;
      } else if (descriptor.endsWith("x")) {
        score = Math.round((Number.parseFloat(descriptor) || 0) * 1000);
      }

      return { rawUrl, score };
    })
    .filter((item) => item.rawUrl);

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => right.score - left.score);

  for (const candidate of candidates) {
    try {
      return new URL(candidate.rawUrl, articleUrl).href;
    } catch {
      continue;
    }
  }

  return null;
}

function extractTitleFromHtml(html) {
  const titleMatch = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch ? decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, " ").trim() : null;
}

function extractPreferredArticleImageFromHtml(html, articleUrl) {
  const sourceHtml = String(html || "");
  const preferredRegions = [
    /<figure\b[^>]*class\s*=\s*["'][^"']*(?:featured-media|post-thumbnail|wp-post-image)[^"']*["'][^>]*>[\s\S]*?<\/figure>/gi,
    /<div\b[^>]*class\s*=\s*["'][^"']*(?:featured-media|post-thumbnail|postTypeListItem)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
  ];

  for (const pattern of preferredRegions) {
    const regions = sourceHtml.match(pattern) || [];
    for (const region of regions) {
      const imageTags = region.match(/<img\b[^>]*>/gi) || [];
      for (const tag of imageTags) {
        const attributes = extractAttributesFromTag(tag);
        const srcsetCandidate = pickBestSrcsetCandidate(
          attributes.srcset
            || attributes["data-srcset"]
            || attributes["data-original-set"]
            || attributes["data-lazy-srcset"]
            || "",
          articleUrl
        );
        const rawSrc = srcsetCandidate
          || attributes.src
          || attributes["data-src"]
          || attributes["data-lazy-src"]
          || attributes["data-original"]
          || attributes["data-img-url"];

        if (!rawSrc) {
          continue;
        }

        try {
          const safeImageUrl = sanitizeArticleImageUrl(new URL(rawSrc, articleUrl).href);
          if (safeImageUrl) {
            return safeImageUrl;
          }
        } catch {
          continue;
        }
      }
    }
  }

  return null;
}

function isLikelyDecorativeImageUrl(value) {
  const normalized = String(value || "").toLowerCase();
  let hostname = "";

  try {
    hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    hostname = "";
  }

  const isSocialMediaImageHost =
    hostname.endsWith("cdninstagram.com") ||
    hostname.endsWith("fbcdn.net") ||
    hostname.endsWith("facebook.com") ||
    hostname.endsWith("instagram.com") ||
    hostname.endsWith("twimg.com") ||
    hostname.endsWith("x.com") ||
    hostname.endsWith("twitter.com");

  return (
    !normalized
    || isBlockedArticleImageUrl(normalized)
    || isSocialMediaImageHost
    || normalized.includes("logo")
    || normalized.includes("icon")
    || normalized.includes("favicon")
    || normalized.includes("/theme-assets/")
    || normalized.includes("img.etimg.com/photo/msid-")
    || normalized.includes("/attention/")
    || normalized.includes("attention.jpg")
    || normalized.includes("qrcode")
    || normalized.includes("qr-code")
    || normalized.includes("/qr/")
    || normalized.includes("wechat")
    || normalized.includes("weibo")
    || normalized.includes("share_icon")
    || normalized.includes("newsletter")
    || normalized.includes("subscription")
    || normalized.includes("sponsor")
    || normalized.includes("advertorial")
    || normalized.includes("rhs-banner")
    || normalized.includes("about-news")
    || normalized.includes("gwab")
    || normalized.includes("resource/default/img/icon")
    || normalized.includes("sprite")
    || normalized.includes("avatar")
    || normalized.includes("brand")
    || normalized.includes("branding")
    || normalized.includes("banner")
    || /(?:^|[/?&_.-])(?:ads?|advert|advertisement|advertorial)(?:[/?&_.=-]|$)/.test(normalized)
    || normalized.includes("fallback")
    || normalized.includes("youtube.svg")
    || normalized.includes("facebook")
    || normalized.includes("twitter")
    || normalized.includes("instagram")
    || normalized.includes("insta")
    || normalized.includes("cdninstagram")
    || normalized.includes("fbcdn")
    || normalized.includes("facebook.com")
    || normalized.includes("twitter.com")
    || normalized.includes("twimg")
    || normalized.includes("profile")
    || normalized.includes("insta-feed")
    || normalized.includes("google-play")
    || normalized.includes("play-store")
    || normalized.includes("app-store")
    || normalized.includes("appstore")
    || normalized.includes("get-it-on")
    || normalized.includes("download-app")
    || normalized.includes("mobile-app")
    || normalized.includes("app-badge")
    || normalized.includes("store-badge")
    || normalized.includes("badge-google")
    || normalized.includes("badge-app")
    || normalized.includes("tn-250921125347.jpg")
    || normalized.includes("follow-us")
    || normalized.includes("feed")
    || normalized.includes("yt-feed")
    || normalized.includes("placeholder")
    || normalized.includes("no-image")
    || normalized.includes("missing-image")
    || normalized.includes("image-not-available")
    || normalized.includes("default-image")
    || normalized.includes("default-img")
    || normalized.includes("default-photo")
    || normalized.includes("whatsapp")
    || normalized.endsWith(".svg")
  );
}

function scoreImageCandidate({ src, altText = "", className = "", width = 0, height = 0, inArticle = false }) {
  const normalizedSrc = String(src || "").toLowerCase();
  const normalizedAlt = String(altText || "").toLowerCase();
  const normalizedClass = String(className || "").toLowerCase();

  if (!normalizedSrc || isLikelyDecorativeImageUrl(normalizedSrc)) {
    return Number.NEGATIVE_INFINITY;
  }

  if (
    /logo|icon|favicon|share|social|avatar|author|profile|button|emoji|thumbnail|placeholder|default|fallback|brand|qr|qrcode|wechat|weibo|attention|follow|subscribe|advert|ads?|banner|rhs|promo|sponsor|newsletter|subscription|google play|play store|app store|download app|get it on/.test(normalizedAlt)
    || /logo|icon|favicon|share|social|avatar|author|profile|button|widget|thumb|thumbnail|gallery|placeholder|default|fallback|brand|qr|qrcode|wechat|weibo|attention|follow|subscribe|advert|ads?|banner|rhs|promo|sponsor|newsletter|subscription|google-play|play-store|app-store|download-app|mobile-app|store-badge|app-badge/.test(normalizedClass)
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  if ((width > 0 && width < 200) || (height > 0 && height < 120)) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  score += Math.min(width, 2200) * 0.02;
  score += Math.min(height, 1600) * 0.02;

  if (inArticle) {
    score += 250;
  }

  if (/feature|featured|hero|lead|story|article|post|news/.test(normalizedSrc)) {
    score += 120;
  }

  if (/wp-content\/uploads|\/uploads\//.test(normalizedSrc)) {
    score += 80;
  }

  if (/insta|feed|icon|logo|favicon|author|avatar|thumb|thumbnail|placeholder|default|fallback|attention|qrcode|qr-code|wechat|weibo|advert|ads?|banner|rhs|promo|sponsor|newsletter|subscription|youtube/.test(normalizedSrc)) {
    score -= 240;
  }

  return score;
}

function extractImageFromHtml(html, articleUrl) {
  const preferredImage = extractPreferredArticleImageFromHtml(html, articleUrl);
  if (preferredImage) {
    return preferredImage;
  }

  const imageTags = String(html || "").match(/<img\b[^>]*>/gi) || [];
  let bestCandidate = null;

  for (const tag of imageTags) {
    const attributes = extractAttributesFromTag(tag);
    const srcsetCandidate = pickBestSrcsetCandidate(
      attributes.srcset
        || attributes["data-srcset"]
        || attributes["data-original-set"]
        || attributes["data-lazy-srcset"]
        || "",
      articleUrl
    );

    const rawSrc = attributes.src
      || attributes["data-src"]
      || attributes["data-lazy-src"]
      || attributes["data-original"]
      || attributes["data-img-url"]
      || srcsetCandidate;
    if (!rawSrc) {
      continue;
    }

    const lowered = rawSrc.toLowerCase();
    const altText = String(attributes.alt || "").toLowerCase();
    const className = String(attributes.class || "").toLowerCase();
    const width = Number.parseInt(attributes.width, 10) || 0;
    const height = Number.parseInt(attributes.height, 10) || 0;
    const score = scoreImageCandidate({
      src: lowered,
      altText,
      className,
      width,
      height,
      inArticle: /article|story|post|content|featured|hero/.test(className),
    });

    if (!Number.isFinite(score)) {
      continue;
    }

    try {
      const absoluteUrl = new URL(rawSrc, articleUrl).href;
      const safeImageUrl = sanitizeArticleImageUrl(absoluteUrl);
      if (!safeImageUrl) {
        continue;
      }
      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { href: safeImageUrl, score };
      }
    } catch {
      continue;
    }
  }

  return bestCandidate?.href || null;
}

async function extractArticleMetadataFromHtml(articleUrl) {
  const { response } = await fetchTextWithProfiles(
    articleUrl,
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  );

  if (!response || !response.ok) {
    return null;
  }

  const html = await response.text();
  const title =
    extractMetaContentFromHtml(html, "og:title")
    || extractMetaContentFromHtml(html, "twitter:title")
    || extractTitleFromHtml(html);
  const imageCandidates = [
    {
      rawUrl:
        extractMetaContentFromHtml(html, "og:image") ||
        extractMetaContentFromHtml(html, "og:image:secure_url") ||
        extractMetaContentFromHtml(html, "og:image:url"),
      source: "og:image",
    },
    {
      rawUrl:
        extractMetaContentFromHtml(html, "twitter:image") ||
        extractMetaContentFromHtml(html, "twitter:image:src"),
      source: "twitter:image",
    },
    { rawUrl: extractLinkHrefFromHtml(html, "image_src"), source: "link[rel=image_src]" },
    { rawUrl: extractImageFromHtml(html, articleUrl), source: "html-image" },
  ];

  let featuredImage = null;
  let imageSource = null;
  for (const candidate of imageCandidates) {
    if (!candidate.rawUrl || isLikelyDecorativeImageUrl(candidate.rawUrl)) {
      continue;
    }

    const resolvedImage = (() => {
      try {
        return new URL(candidate.rawUrl, articleUrl).href;
      } catch {
        return candidate.rawUrl;
      }
    })();
    featuredImage = sanitizeArticleImageUrl(resolvedImage);

    if (featuredImage) {
      imageSource = candidate.source;
      break;
    }
  }

  return {
    title,
    featuredImage,
    imageSource,
  };
}

function isGoogleNewsPageUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase() === "news.google.com";
  } catch {
    return false;
  }
}

async function extractBestImageFromLoadedPage(page) {
  return page.evaluate(() => {
    const makeAbsolute = (value) => {
      if (!value) {
        return null;
      }

      try {
        return new URL(value, window.location.href).href;
      } catch {
        return null;
      }
    };

    const title =
      document.querySelector('meta[property="og:title"]')?.content ||
      document.querySelector("title")?.innerText ||
      document.title ||
      null;

    const isBlockedImage = (value) => {
      const normalized = String(value || "").toLowerCase();
      let hostname = "";

      try {
        hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
      } catch {
        hostname = "";
      }

      return (
        !normalized ||
        hostname.endsWith("cdninstagram.com") ||
        hostname.endsWith("fbcdn.net") ||
        hostname.endsWith("facebook.com") ||
        hostname.endsWith("instagram.com") ||
        hostname.endsWith("twimg.com") ||
        hostname.endsWith("x.com") ||
        hostname.endsWith("twitter.com") ||
        /logo|icon|favicon|theme-assets|img\.etimg\.com\/photo\/msid-|attention|qrcode|qr-code|wechat|weibo|share_icon|newsletter|subscription|sponsor|advertorial|rhs-banner|about-news|gwab|resource\/default\/img\/icon|sprite|avatar|youtube|insta|instagram|cdninstagram|fbcdn|facebook|twitter|twimg|social|feed|profile|placeholder|default-image|default-img|default-photo|default-thumbnail|fallback|og-image|brand|branding|no-image|missing-image|image-not-available|google-play|play-store|app-store|appstore|get-it-on|download-app|mobile-app|app-badge|store-badge|badge-google|badge-app|(?:^|[/?&_.-])(?:ads?|advert|advertisement)(?:[/?&_.=-]|$)|banner|rhs|promo|sponsor/.test(normalized)
      );
    };

    const metaCandidates = [
      {
        src: makeAbsolute(
          document.querySelector('meta[property="og:image"], meta[property="og:image:secure_url"], meta[property="og:image:url"]')?.content
        ),
        source: "og:image",
      },
      {
        src: makeAbsolute(
          document.querySelector('meta[name="twitter:image"], meta[name="twitter:image:src"]')?.content
        ),
        source: "twitter:image",
      },
      {
        src: makeAbsolute(
          document.querySelector('link[rel="image_src"]')?.href || document.querySelector('link[rel="image_src"]')?.getAttribute("href")
        ),
        source: "link[rel=image_src]",
      },
    ].filter((candidate) => candidate.src && !isBlockedImage(candidate.src));

    const preferredArticleImages = Array.from(
      document.querySelectorAll(
        "figure.featured-media img, .featured-media img, .post-thumbnail img, .postTypeListItem img, img.wp-post-image"
      )
    )
      .map((img) => ({
        src: makeAbsolute(
          img.currentSrc ||
            img.getAttribute("src") ||
            img.getAttribute("data-src") ||
            img.getAttribute("data-lazy-src")
        ),
        source: "featured-media",
      }))
      .filter((candidate) => candidate.src && !isBlockedImage(candidate.src));

    const imageCandidates = Array.from(document.images)
      .map((img) => {
        const src = makeAbsolute(
          img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src")
        );
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        const area = width * height;
        const inArticle = Boolean(img.closest("article, main, [role='main'], .article, .story"));
        const loading = img.getAttribute("loading");

        return {
          src,
          width,
          height,
          area,
          inArticle,
          loading,
          altText: img.getAttribute("alt") || "",
          className: img.getAttribute("class") || "",
        };
      })
      .map((img) => ({
        ...img,
        score: (() => {
          const normalizedSrc = String(img.src || "").toLowerCase();
          const normalizedAlt = String(img.altText || "").toLowerCase();
          const normalizedClass = String(img.className || "").toLowerCase();

          if (
            !normalizedSrc ||
            !normalizedSrc.startsWith("http") ||
            isBlockedImage(normalizedSrc) ||
            /logo|icon|favicon|share|social|avatar|author|profile|button|thumbnail|placeholder|default|fallback|brand|qr|qrcode|wechat|weibo|attention|follow|subscribe|(?:^|[/?&_. -])(?:ads?|advert|advertisement)(?:[/?&_. =-]|$)|banner|rhs|promo|sponsor|newsletter|subscription|google play|play store|app store|download app|get it on/.test(normalizedAlt) ||
            /logo|icon|favicon|share|social|avatar|author|profile|button|widget|thumbnail|gallery|placeholder|default|fallback|brand|qr|qrcode|wechat|weibo|attention|follow|subscribe|(?:^|[/?&_. -])(?:ads?|advert|advertisement)(?:[/?&_. =-]|$)|banner|rhs|promo|sponsor|newsletter|subscription|instagram|insta|google-play|play-store|app-store|download-app|mobile-app|store-badge|app-badge/.test(normalizedClass) ||
            img.width < 320 ||
            img.height < 180
          ) {
            return Number.NEGATIVE_INFINITY;
          }

          let score = img.area;
          if (img.inArticle) {
            score += 500000;
          }
          if (/feature|featured|hero|lead|story|article|post|news/.test(normalizedSrc)) {
            score += 250000;
          }
          if (/wp-content\/uploads|\/uploads\//.test(normalizedSrc)) {
            score += 120000;
          }
          if (img.loading === "eager") {
            score += 50000;
          }
          return score;
        })(),
      }))
      .filter((img) => Number.isFinite(img.score))
      .sort((left, right) => {
        return right.score - left.score;
      });

    return {
      title,
      featuredImage: preferredArticleImages[0]?.src || metaCandidates[0]?.src || imageCandidates[0]?.src || null,
      imageSource: preferredArticleImages[0]
        ? preferredArticleImages[0].source
        : metaCandidates[0]
          ? metaCandidates[0].source
          : imageCandidates[0]
            ? "article-image"
            : null,
    };
  });
}

async function extractBestImageFromArticle(page, articleUrl) {
  let htmlMetadata = null;

  try {
    htmlMetadata = await extractArticleMetadataFromHtml(articleUrl);
    if (htmlMetadata?.featuredImage && htmlMetadata.imageSource !== "html-image") {
      return htmlMetadata;
    }
  } catch (error) {
    console.warn(`HTML-first extraction failed for ${articleUrl}: ${error.message}`);
  }

  await page.goto(articleUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForSelector("body", { timeout: 8008 });
  try {
    await page.waitForFunction(
      () => Array.from(document.images || []).some((img) => {
        const src = String(img.currentSrc || img.src || img.getAttribute("src") || "").toLowerCase();
        const label = `${src} ${img.alt || ""} ${img.className || ""}`.toLowerCase();
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        return (
          width >= 300 &&
          height >= 160 &&
          src.startsWith("http") &&
          !/logo|icon|favicon|theme-assets|img\.etimg\.com\/photo\/msid-|attention|qrcode|qr-code|wechat|weibo|share_icon|newsletter|subscription|sponsor|advertorial|rhs-banner|about-news|gwab|resource\/default\/img\/icon|sprite|avatar|youtube|insta|instagram|cdninstagram|fbcdn|facebook|twitter|twimg|social|feed|profile|placeholder|default-image|default-img|default-photo|default-thumbnail|fallback|og-image|brand|branding|no-image|missing-image|image-not-available|google-play|play-store|app-store|appstore|get-it-on|download-app|mobile-app|app-badge|store-badge|badge-google|badge-app|(?:^|[/?&_. -])(?:ads?|advert|advertisement)(?:[/?&_. =-]|$)|banner|rhs|promo|sponsor/.test(label)
        );
      }),
      { timeout: ARTICLE_IMAGE_RENDER_WAIT_MS }
    );
  } catch {
    await waitForMs(1200);
  }
  const pageMetadata = await extractBestImageFromLoadedPage(page);

  const pageImage = sanitizeArticleImageUrl(pageMetadata?.featuredImage);
  if (pageImage) {
    return {
      ...pageMetadata,
      featuredImage: pageImage,
    };
  }

  return htmlMetadata || pageMetadata;
}

async function openGoogleRssArticleAndExtract(page, googleUrl, fallbackArticleUrl = null) {
  const fallbackUrl = fallbackArticleUrl && !isGoogleNewsPageUrl(fallbackArticleUrl)
    ? fallbackArticleUrl
    : null;
  let fallbackMetadata = null;

  if (fallbackUrl) {
    try {
      fallbackMetadata = await extractArticleMetadataFromHtml(fallbackUrl);
    } catch (error) {
      console.warn(`Google RSS fallback metadata extraction failed for ${fallbackUrl}: ${error.message}`);
    }
  }

  const openPage = async (url) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForSelector("body", { timeout: 8008 });
  };

  const initialUrl = googleUrl || fallbackUrl;
  if (!initialUrl) {
    return {
      articleUrl: null,
      title: fallbackMetadata?.title || null,
      featuredImage: fallbackMetadata?.featuredImage || null,
      imageSource: fallbackMetadata?.imageSource || null,
    };
  }

  try {
    await openPage(initialUrl);
  } catch (error) {
    if (!fallbackUrl || fallbackUrl === initialUrl) {
      throw error;
    }

    await openPage(fallbackUrl);
  }

  try {
    await page.waitForFunction(() => !window.location.hostname.includes("news.google.com"), { timeout: 10000 });
  } catch {
    // Some Google News links do not auto-redirect. Fall back to the resolved publisher URL below.
  }

  let finalUrl = page.url() || fallbackUrl || googleUrl;
  if (isGoogleNewsPageUrl(finalUrl) && fallbackUrl) {
    await openPage(fallbackUrl);
    finalUrl = page.url() || fallbackUrl;
  }

  await waitForMs(1500);
  const pageMetadata = await extractBestImageFromLoadedPage(page);

  return {
    articleUrl: finalUrl,
    title: pageMetadata?.title || fallbackMetadata?.title || null,
    featuredImage: pageMetadata?.featuredImage || fallbackMetadata?.featuredImage || null,
    imageSource: pageMetadata?.featuredImage ? pageMetadata.imageSource : fallbackMetadata?.imageSource || null,
  };
}

async function fetchArticlesForCategory(page, category, limit, options = {}) {
  const dailyQuota = await getDailyNewsQuota();
  if (dailyQuota.remaining <= 0) {
    return buildDailyQuotaSkippedFetchResult(category, "configured-rss", dailyQuota);
  }

  const requestedLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || DEFAULT_ARTICLE_LIMIT, dailyQuota.remaining));
  const candidateLimit = Math.min(
    Math.max(requestedLimit * ARTICLE_CANDIDATE_MULTIPLIER, requestedLimit),
    ARTICLE_CANDIDATE_CAP
  );
  const feedConfigs = getCategoryFeedPool(category, {
    includeSources: options.includeSources,
    excludeSources: options.excludeSources,
  });
  if (!feedConfigs?.length) {
    if (options.allowEmpty) {
      return buildEmptyCategoryFetchResult(category);
    }

    throw new Error(
      `No RSS feed is configured for category "${category}". Available categories: ${Object.keys(RSS_FEEDS).join(", ")}`
    );
  }

  const articleEntries = await getArticleUrlsFromFeeds(feedConfigs, candidateLimit, {
    category,
    startIndex: options.startIndex || 0,
  });
  console.log(`Found ${articleEntries.length} article link(s) from RSS feeds for ${category}.`);

  const results = [];
  let successCount = 0;

  for (const articleEntry of articleEntries) {
    if (successCount >= requestedLimit) {
      break;
    }

    const articleUrl = articleEntry.url;
    console.log(`Opening article for ${category} from ${articleEntry.feed_source}: ${articleUrl}`);

    try {
      const freshness = isFreshPublishedDate(articleEntry.published_at);
      if (!freshness.fresh) {
        results.push({
          status: "Skipped",
          category,
          feed_source: articleEntry.feed_source,
          feed_url: articleEntry.feed_url,
          source: articleUrl,
          title: articleEntry.title || null,
          message: buildFreshnessSkipMessage(freshness),
        });
        continue;
      }

      const existingRecord = await findNewsRecordByUrl(articleUrl);
      if (existingRecord) {
        results.push({
          status: "Skipped",
          category,
          feed_source: articleEntry.feed_source,
          feed_url: articleEntry.feed_url,
          source: articleUrl,
          message: `Duplicate article already saved in category "${existingRecord.category || "uncategorized"}".`,
        });
        continue;
      }

      const imageData = await extractArticleMetadataForFeed(page, articleEntry);
      const blockedMetadataImageReason = getBlockedArticleImageReason(imageData.featuredImage);
      if (blockedMetadataImageReason) {
        results.push({
          status: "Skipped",
          category,
          feed_source: articleEntry.feed_source,
          feed_url: articleEntry.feed_url,
          source: articleUrl,
          title: imageData.title || articleEntry.title || null,
          message: `Article skipped because image has ${blockedMetadataImageReason}.`,
        });
        continue;
      }

      const metadataImage = sanitizeArticleImageUrl(imageData.featuredImage);
      const featuredImage = metadataImage || null;
      const imageSource = metadataImage ? imageData.imageSource || "article-image" : null;
      const title = imageData.title || articleEntry.title || articleUrl;
      const duplicateRecord = await findNewsRecordDuplicate({
        articleUrl,
        titleSignature: normalizeNewsTitleSignature(title),
      });
      if (duplicateRecord) {
        results.push({
          status: "Skipped",
          category,
          feed_source: articleEntry.feed_source,
          feed_url: articleEntry.feed_url,
          source: articleUrl,
          title,
          message: `Duplicate article already saved as id ${duplicateRecord.id}.`,
          existing_id: duplicateRecord.id,
        });
        continue;
      }

      const recordId = await saveNewsRecord({
        category,
        feedSource: articleEntry.feed_source,
        feedUrl: articleEntry.feed_url,
        query: category,
        title,
        articleUrl,
        imageLink: featuredImage,
        imageSource,
        sourcePublishedAt: freshness.publishedAt,
      });

      if (!recordId) {
        results.push({
          status: "Skipped",
          category,
          feed_source: articleEntry.feed_source,
          feed_url: articleEntry.feed_url,
          source: articleUrl,
          message: "Duplicate article was already saved before insert.",
        });
        continue;
      }

      successCount += 1;
      results.push({
        status: "Success",
        saved_id: recordId,
        category,
        feed_source: articleEntry.feed_source,
        feed_url: articleEntry.feed_url,
        source: articleUrl,
        title,
        image_link: featuredImage,
        image_source: imageSource,
      });
    } catch (articleError) {
      results.push({
        status: "Error",
        category,
        feed_source: articleEntry.feed_source,
        feed_url: articleEntry.feed_url,
        source: articleUrl,
        message: articleError.message,
      });
    } finally {
      if (page) {
        try {
          await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 5000 });
        } catch {
          // Ignore page reset failures while continuing the batch.
        }
      }
    }
  }

  return {
    category,
    fetched_count: articleEntries.length,
    saved_count: successCount,
    failed_count: results.filter((item) => item.status === "Error").length,
    skipped_count: results.filter((item) => item.status === "Skipped").length,
    results,
  };
}

async function fetchPrimaryNewsForCategory(page, category, limit, options = {}) {
  const results = [];
  let remaining = limit;
  let lastError = null;
  const includeCliff = options.includeCliff !== false && CLIFF_NEWS_PRIMARY_ENABLED;
  const includeGoogle = options.includeGoogle !== false;
  const runAllPrimarySources = options.runAllPrimarySources === true;
  const primarySourceLimit = normalizePrimarySourceLimit(options.primarySourceLimit);

  if (runAllPrimarySources) {
    if (includeCliff) {
      try {
        results.push(await saveCliffNewsForCategory(category, primarySourceLimit, {
          language: options.cliffLanguage || CLIFF_NEWS_LANGUAGE,
          includeExisting: options.includeExisting,
        }));
      } catch (error) {
        lastError = error;
        results.push(buildFetchStepErrorResult(category, "cliff-news", error));
      }
    }

    if (includeGoogle) {
      try {
        results.push(await saveGoogleRssNewsForCategory(category, primarySourceLimit, {
          query: options.googleQuery,
          timeoutMs: options.timeoutMs,
          includeExisting: options.includeExisting,
        }));
      } catch (error) {
        lastError = error;
        results.push(buildFetchStepErrorResult(category, "google-rss", error));
      }
    }

    for (const rssSource of PRIMARY_RSS_SOURCES) {
      try {
        results.push(await fetchArticlesForCategory(page, category, primarySourceLimit, {
          includeSources: [rssSource],
          allowEmpty: true,
        }));
      } catch (error) {
        lastError = error;
        results.push(buildFetchStepErrorResult(category, rssSource, error));
      }
    }

    const primarySavedCount = results.reduce((sum, item) => sum + (item.saved_count || 0), 0);
    remaining = Math.max(0, limit - primarySavedCount);

    if (remaining > 0) {
      try {
        const fallbackRssResult = await fetchArticlesForCategory(page, category, remaining, {
          excludeSources: PRIMARY_RSS_SOURCES,
          allowEmpty: true,
          startIndex: options.fallbackStartIndex || 0,
        });
        results.push(fallbackRssResult);
      } catch (error) {
        lastError = error;
        results.push(buildFetchStepErrorResult(category, "fallback-rss", error));
      }
    }

    const mergedResult = mergeCategoryFetchResults(category, results);
    if (mergedResult.results.length === 0 && lastError) {
      throw lastError;
    }

    return {
      ...mergedResult,
      source_strategy: "automatic-primary-cliff-news-google-rss-dd-mpinfo",
      primary_sources: PRIMARY_NEWS_SOURCE_STRATEGY,
      primary_source_limit: primarySourceLimit,
    };
  }

  if (includeCliff && remaining > 0) {
    try {
      const cliffResult = await saveCliffNewsForCategory(category, remaining, {
        language: options.cliffLanguage || CLIFF_NEWS_LANGUAGE,
        includeExisting: options.includeExisting,
      });
      results.push(cliffResult);
      remaining = Math.max(0, remaining - cliffResult.saved_count);
    } catch (error) {
      lastError = error;
      results.push(buildFetchStepErrorResult(category, "cliff-news", error));
    }
  }

  if (includeGoogle && remaining > 0) {
    try {
      const googleResult = await saveGoogleRssNewsForCategory(category, remaining, {
        query: options.googleQuery,
        timeoutMs: options.timeoutMs,
        includeExisting: options.includeExisting,
      });
      results.push(googleResult);
      remaining = Math.max(0, remaining - googleResult.saved_count);
    } catch (error) {
      lastError = error;
      results.push(buildFetchStepErrorResult(category, "google-rss", error));
    }
  }

  if (remaining > 0) {
    try {
      const primaryRssResult = await fetchArticlesForCategory(page, category, remaining, {
        includeSources: PRIMARY_RSS_SOURCES,
        allowEmpty: true,
      });
      results.push(primaryRssResult);
      remaining = Math.max(0, remaining - primaryRssResult.saved_count);
    } catch (error) {
      lastError = error;
      results.push(buildFetchStepErrorResult(category, "primary-rss", error));
    }
  }

  if (remaining > 0) {
    try {
      const fallbackRssResult = await fetchArticlesForCategory(page, category, remaining, {
        excludeSources: PRIMARY_RSS_SOURCES,
        allowEmpty: true,
        startIndex: options.fallbackStartIndex || 0,
      });
      results.push(fallbackRssResult);
      remaining = Math.max(0, remaining - fallbackRssResult.saved_count);
    } catch (error) {
      lastError = error;
      results.push(buildFetchStepErrorResult(category, "fallback-rss", error));
    }
  }

  const mergedResult = mergeCategoryFetchResults(category, results);
  if (mergedResult.results.length === 0 && lastError) {
    throw lastError;
  }

  return {
    ...mergedResult,
    source_strategy: "fill-primary-cliff-news-google-rss-dd-mpinfo",
    primary_sources: PRIMARY_NEWS_SOURCE_STRATEGY,
  };
}

function mergeCategoryFetchResults(category, results) {
  const normalizedResults = results.filter(Boolean);
  return {
    category,
    fetched_count: normalizedResults.reduce((sum, item) => sum + (item.fetched_count || 0), 0),
    saved_count: normalizedResults.reduce((sum, item) => sum + (item.saved_count || 0), 0),
    failed_count: normalizedResults.reduce((sum, item) => sum + (item.failed_count || 0), 0),
    skipped_count: normalizedResults.reduce((sum, item) => sum + (item.skipped_count || 0), 0),
    results: normalizedResults.flatMap((item) => item.results || []),
  };
}

function isGovernmentFeedSource(source) {
  const normalized = String(source || "").toLowerCase();
  return (
    GOVERNMENT_NEWS_SOURCES.has(normalized) ||
    normalized.endsWith("-gov") ||
    normalized.startsWith("mpinfo-")
  );
}

async function extractArticleMetadataForFeed(page, articleEntry) {
  const articleUrl = articleEntry.url;

  try {
    const fallback = await extractBestImageFromArticleHttp(articleUrl, {
      timeoutMs: ARTICLE_METADATA_TIMEOUT_MS,
      retries: 1,
    });
    const fallbackImage = sanitizeArticleImageUrl(fallback.imageUrl);
    if (fallbackImage) {
      return {
        title: articleEntry.title || articleUrl,
        featuredImage: fallbackImage,
        imageSource: fallback.imageSource || "article-image",
      };
    }
  } catch {
    // Fall through to the heavier browser extraction.
  }

  if (page) {
    try {
      const pageMetadata = await extractBestImageFromArticle(page, articleUrl);
      const pageImage = sanitizeArticleImageUrl(pageMetadata?.featuredImage);
      if (pageImage || pageMetadata?.title) {
        return {
          title: pageMetadata?.title || articleEntry.title || articleUrl,
          featuredImage: pageImage || null,
          imageSource: pageImage ? pageMetadata?.imageSource || "article-image" : null,
        };
      }
    } catch (pageError) {
      if (isGovernmentFeedSource(articleEntry.feed_source)) {
        return {
          title: articleEntry.title || articleUrl,
          featuredImage: null,
          imageSource: null,
        };
      }

      throw pageError;
    }
  }

  if (articleEntry.title) {
    return {
      title: articleEntry.title,
      featuredImage: null,
      imageSource: null,
    };
  }

  if (isGovernmentFeedSource(articleEntry.feed_source)) {
    return {
      title: articleUrl,
      featuredImage: null,
      imageSource: null,
    };
  }

  throw new Error("No article metadata could be extracted from the RSS item or article page.");
}

async function fetchAllCategories(page, limit) {
  const categories = Object.keys(RSS_FEEDS);
  const allResults = [];

  for (const category of categories) {
    const categoryResult = await fetchPrimaryNewsForCategory(page, category, limit);
    allResults.push(categoryResult);
  }

  return {
    categories,
    fetched_count: allResults.reduce((sum, item) => sum + item.fetched_count, 0),
    saved_count: allResults.reduce((sum, item) => sum + item.saved_count, 0),
    failed_count: allResults.reduce((sum, item) => sum + item.failed_count, 0),
    results: allResults,
  };
}

function allocateCategoryLimits(categories, total) {
  const base = Math.floor(total / categories.length);
  const remainder = total % categories.length;

  return categories.map((category, index) => ({
    category,
    limit: base + (index < remainder ? 1 : 0),
  }));
}

async function fetchAllCategoriesByTotal(page, total) {
  const categories = Object.keys(RSS_FEEDS);
  const allocations = allocateCategoryLimits(categories, total);
  const allResults = [];

  for (const allocation of allocations) {
    if (allocation.limit < 1) {
      continue;
    }

    const categoryResult = await fetchPrimaryNewsForCategory(page, allocation.category, allocation.limit);
    allResults.push({
      ...categoryResult,
      requested_limit: allocation.limit,
    });
  }

  return {
    categories,
    total_requested: total,
    allocation: allocations,
    fetched_count: allResults.reduce((sum, item) => sum + item.fetched_count, 0),
    saved_count: allResults.reduce((sum, item) => sum + item.saved_count, 0),
    failed_count: allResults.reduce((sum, item) => sum + item.failed_count, 0),
    results: allResults,
  };
}

function normalizeSyncSources(value) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "all");
  const sources = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (!sources.length || sources.includes("all")) {
    return ["cliff", "google", "rss"];
  }

  const normalized = [
    ...new Set(
      sources
        .map((source) => (source === "cliff-news" || source === "api" ? "cliff" : source))
        .filter((source) => ["cliff", "google", "rss", "other"].includes(source))
        .map((source) => (source === "other" ? "rss" : source))
    ),
  ];

  return normalized.length ? normalized : ["cliff", "google", "rss"];
}

function normalizePrimarySyncSources(value) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "all");
  const sources = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((source) => {
      if (source === "cliff" || source === "api") {
        return "cliff-news";
      }
      if (source === "google") {
        return "google-rss";
      }
      return source;
    });

  if (!sources.length || sources.includes("all")) {
    return PRIMARY_NEWS_SOURCE_STRATEGY;
  }

  const allowedSources = new Set(PRIMARY_NEWS_SOURCE_STRATEGY);
  const normalized = [...new Set(sources.filter((source) => allowedSources.has(source)))];
  return normalized.length ? normalized : PRIMARY_NEWS_SOURCE_STRATEGY;
}

async function saveCliffNewsArticles({
  category = null,
  limit = CLIFF_NEWS_DEFAULT_LIMIT,
  language = CLIFF_NEWS_LANGUAGE,
  includeExisting = false,
  page = 1,
} = {}) {
  const requestedCategory = category ? normalizeCategory(category) : null;
  const dailyQuota = await getDailyNewsQuota();
  if (dailyQuota.remaining <= 0) {
    return {
      ...buildDailyQuotaSkippedFetchResult(requestedCategory || "all", "cliff-news", dailyQuota),
      language,
      page: normalizeCliffNewsPage(page),
      pagination: null,
      feed_url: null,
    };
  }

  const requestedLimit = Math.max(
    1,
    Math.min(Number.parseInt(limit, 10) || CLIFF_NEWS_DEFAULT_LIMIT, 500, dailyQuota.remaining)
  );
  const requestedPage = normalizeCliffNewsPage(page);
  const apiLimit = requestedCategory
    ? Math.max(requestedLimit * 8, Math.min(CLIFF_NEWS_DEFAULT_LIMIT, 100))
    : requestedLimit;
  const apiResult = await fetchCliffNewsApiArticles({
    limit: Math.min(apiLimit, 500),
    language,
    page: requestedPage,
  });
  const results = [];
  const rewriteCandidates = [];
  let matchedCount = 0;

  for (const rawArticle of apiResult.articles) {
    if (!shouldIncludeCliffNewsArticle(rawArticle, requestedCategory)) {
      continue;
    }

    matchedCount += 1;
    const article = normalizeCliffNewsArticle(rawArticle);
    if (!article) {
      results.push({
        status: "Skipped",
        category: requestedCategory || "all",
        feed_source: "cliff-news",
        feed_url: apiResult.request_url,
        source: null,
        message: "Cliff News API item is missing a usable title or article URL.",
      });
      continue;
    }

    const freshness = isFreshPublishedDate(article.publishedAt);
    if (!freshness.fresh) {
      results.push({
        status: "Skipped",
        category: article.category,
        feed_source: "cliff-news",
        feed_url: apiResult.request_url,
        source: article.articleUrl,
        title: article.title,
        message: buildFreshnessSkipMessage(freshness),
      });
      continue;
    }

    if (results.filter((item) => item.status === "Success" || item.status === "Existing").length >= requestedLimit) {
      break;
    }

    try {
      const blockedImageReason = getBlockedArticleImageReason(article.imageUrl);
      if (blockedImageReason) {
        results.push({
          status: "Skipped",
          category: article.category,
          feed_source: "cliff-news",
          feed_url: apiResult.request_url,
          source: article.articleUrl,
          title: article.title,
          message: `Article skipped because image has ${blockedImageReason}.`,
        });
        continue;
      }

      const articleImageUrl = sanitizeArticleImageUrl(article.imageUrl);
      if (!articleImageUrl) {
        results.push({
          status: "Skipped",
          category: article.category,
          feed_source: "cliff-news",
          feed_url: apiResult.request_url,
          source: article.articleUrl,
          title: article.title,
          message: "Cliff News API item is missing a valid article image.",
        });
        continue;
      }

      const existingRecord = await findFullNewsRecordByUrl(article.articleUrl);
      const duplicateRecord = existingRecord || await findNewsRecordDuplicate({
        articleUrl: article.articleUrl,
        titleSignature: normalizeNewsTitleSignature(article.title),
      });
      if (duplicateRecord) {
        results.push({
          status: "Skipped",
          saved_id: duplicateRecord.id,
          category: duplicateRecord.category || article.category,
          feed_source: "cliff-news",
          feed_url: apiResult.request_url,
          source: article.articleUrl,
          title: duplicateRecord.title || article.title,
          image_link: duplicateRecord.image_link || null,
          image_source: duplicateRecord.image_source || null,
          message: `Duplicate article already saved as id ${duplicateRecord.id}.`,
          existing_id: duplicateRecord.id,
        });
        continue;
      }

      const recordId = await saveNewsRecord({
        category: article.category,
        feedSource: "cliff-news",
        feedUrl: apiResult.request_url,
        query: requestedCategory || article.category,
        title: article.title,
        articleUrl: article.articleUrl,
        imageLink: articleImageUrl,
        imageSource: article.imageSource,
        sourceExcerpt: article.excerpt || null,
        sourceContent: article.contentText || article.excerpt || null,
        sourcePublishedAt: article.publishedAt,
      });
      const savedRecord = recordId
        ? await findFullNewsRecordById(recordId)
        : await findFullNewsRecordByUrl(article.articleUrl);

      if (!savedRecord) {
        results.push({
          status: "Skipped",
          category: article.category,
          feed_source: "cliff-news",
          feed_url: apiResult.request_url,
          source: article.articleUrl,
          title: article.title,
          image_link: articleImageUrl,
          image_source: articleImageUrl ? article.imageSource : null,
          message: "Duplicate article was already saved before insert.",
        });
        continue;
      }

      rewriteCandidates.push({
        ...savedRecord,
        scraped_content_text: article.contentText || savedRecord.source_content || "",
        scraped_subtitle: article.excerpt || savedRecord.source_excerpt || "",
        scraped_publish_date: article.publishedAt || savedRecord.source_published_at || "",
      });
      results.push({
        status: "Success",
        saved_id: savedRecord.id,
        category: savedRecord.category || article.category,
        feed_source: "cliff-news",
        feed_url: apiResult.request_url,
        source: savedRecord.source_url,
        title: savedRecord.title,
        image_link: savedRecord.image_link,
        image_source: savedRecord.image_source,
        original_image_preserved: Boolean(savedRecord.image_link),
      });
    } catch (error) {
      results.push({
        status: "Error",
        category: article.category,
        feed_source: "cliff-news",
        feed_url: apiResult.request_url,
        source: article.articleUrl,
        title: article.title,
        message: error.message,
      });
    }
  }

  return {
    category: requestedCategory || "all",
    source: "cliff-news",
    language,
    page: requestedPage,
    pagination: apiResult.pagination,
    feed_url: apiResult.request_url,
    fetched_count: apiResult.payload_count,
    matched_count: matchedCount,
    saved_count: results.filter((item) => item.status === "Success").length,
    existing_count: results.filter((item) => item.status === "Existing").length,
    skipped_count: results.filter((item) => item.status === "Skipped").length,
    failed_count: results.filter((item) => item.status === "Error").length,
    results,
    rewriteCandidates,
  };
}

async function saveCliffNewsForCategory(category, limit, options = {}) {
  return saveCliffNewsArticles({
    category,
    limit,
    language: options.language || CLIFF_NEWS_LANGUAGE,
    includeExisting: options.includeExisting,
    page: options.page || 1,
  });
}

async function saveGoogleRssNewsForCategory(category, limit, options = {}) {
  const dailyQuota = await getDailyNewsQuota();
  if (dailyQuota.remaining <= 0) {
    return {
      ...buildDailyQuotaSkippedFetchResult(category, "google-rss", dailyQuota),
      query: options.query || getCategorySearchQuery(category),
      feed_url: null,
    };
  }

  const query = options.query || getCategorySearchQuery(category);
  const requestedLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || DEFAULT_ARTICLE_LIMIT, dailyQuota.remaining));
  const googleResult = await fetchGoogleRssFeed({
    query,
    limit: requestedLimit,
    candidateLimit: Math.max(requestedLimit * 10, 25),
    timeoutMs: options.timeoutMs,
    deferArticleScrape: true,
  });
  const results = [];
  const rewriteCandidates = [];
  const { browser, page } = await createBrowserPage();

  try {
    for (const item of googleResult.items) {
      try {
        if (!item.link) {
          results.push({
            status: "Skipped",
            category,
            feed_source: "google-rss",
            feed_url: googleResult.feed_url,
            source: item.google_link || null,
            title: item.title,
            message: item.skipped_reason || "Google RSS item did not resolve to the original publisher URL.",
          });
          continue;
        }

        const freshness = isFreshPublishedDate(item.published_at);
        if (!freshness.fresh) {
          results.push({
            status: "Skipped",
            category,
            feed_source: "google-rss",
            feed_url: googleResult.feed_url,
            source: item.google_link || item.link,
            title: item.title,
            message: buildFreshnessSkipMessage(freshness),
          });
          continue;
        }

        const browserMetadata = await openGoogleRssArticleAndExtract(page, item.google_link, item.link);
        const articleUrl = browserMetadata.articleUrl || item.link;
        const title = browserMetadata.title || item.title;
        const blockedMetadataImageReason = getBlockedArticleImageReason(browserMetadata.featuredImage);
        if (blockedMetadataImageReason) {
          results.push({
            status: "Skipped",
            category,
            feed_source: "google-rss",
            feed_url: googleResult.feed_url,
            source: articleUrl,
            title,
            message: `Article skipped because image has ${blockedMetadataImageReason}.`,
          });
          continue;
        }

        const metadataImage = sanitizeArticleImageUrl(browserMetadata.featuredImage);
        const imageLink = metadataImage || null;
        const imageSource = metadataImage ? browserMetadata.imageSource || "article-image" : null;
        const existingRecord = await findFullNewsRecordByUrl(articleUrl);
        const duplicateRecord = existingRecord || await findNewsRecordDuplicate({
          articleUrl,
          titleSignature: normalizeNewsTitleSignature(title),
        });
        if (duplicateRecord) {
          results.push({
            status: "Skipped",
            category,
            feed_source: "google-rss",
            feed_url: googleResult.feed_url,
            source: articleUrl,
            title: duplicateRecord.title || title,
            image_link: duplicateRecord.image_link || imageLink,
            image_source: duplicateRecord.image_source || imageSource,
            message: `Duplicate article already saved as id ${duplicateRecord.id}.`,
            existing_id: duplicateRecord.id,
          });
          continue;
        }

        const recordId = await saveNewsRecord({
          category,
          feedSource: "google-rss",
          feedUrl: googleResult.feed_url,
          query,
          title,
          articleUrl,
          imageLink,
          imageSource,
          sourcePublishedAt: freshness.publishedAt,
        });
        const savedRecord = recordId
          ? await findFullNewsRecordById(recordId)
          : await findFullNewsRecordByUrl(articleUrl);

        if (!savedRecord) {
          results.push({
            status: "Skipped",
            category,
            feed_source: "google-rss",
            feed_url: googleResult.feed_url,
            source: articleUrl,
            title,
            image_link: imageLink,
            image_source: imageSource,
            message: "Duplicate article was already saved before insert.",
          });
          continue;
        }

        rewriteCandidates.push(savedRecord);
        results.push({
          status: "Success",
          saved_id: savedRecord.id,
          category,
          feed_source: "google-rss",
          feed_url: googleResult.feed_url,
          source: savedRecord.source_url,
          title: savedRecord.title,
          image_link: savedRecord.image_link,
          image_source: savedRecord.image_source,
        });
      } catch (error) {
        results.push({
          status: "Error",
          category,
          feed_source: "google-rss",
          feed_url: googleResult.feed_url,
          source: item.link,
          title: item.title,
          message: error.message,
        });
      } finally {
        try {
          await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 5000 });
        } catch {
          // Ignore page reset failures while continuing the Google RSS batch.
        }
      }
    }
  } finally {
    await browser.close();
  }

  return {
    category,
    source: "google-rss",
    query,
    feed_url: googleResult.feed_url,
    fetched_count: googleResult.fetched_count,
    saved_count: results.filter((item) => item.status === "Success").length,
    existing_count: results.filter((item) => item.status === "Existing").length,
    skipped_count: results.filter((item) => item.status === "Skipped").length,
    failed_count: results.filter((item) => item.status === "Error").length,
    results,
    rewriteCandidates,
  };
}

async function rewriteNewsRecords(records, options = {}) {
  if (!options.enabled) {
    return [];
  }

  const seen = new Set();
  const uniqueRecords = records.filter((record) => {
    if (!record?.id || seen.has(record.id)) {
      return false;
    }
    seen.add(record.id);
    return true;
  });
  const results = [];

  for (const record of uniqueRecords) {
    try {
      const rewrite = await createOrUpdateRewriteForRecord(
        dbPool,
        record,
        createBrowserPage,
        () => runRetentionCleanupCycle("source-ai-sync")
      );

      results.push({
        status: "Success",
        news_id: record.id,
        rewrite_id: rewrite.id,
        category: record.category,
        title: rewrite.ui_hindi?.title || record.title,
        image_link: record.image_link || rewrite.ui_hindi?.image_url || null,
        words_100: rewrite.ui_hindi?.short_100 || "",
        words_300: rewrite.ui_hindi?.medium_300 || "",
        words_600: rewrite.ui_hindi?.long_500 || "",
      });
    } catch (error) {
      results.push({
        status: "Error",
        news_id: record.id,
        category: record.category,
        title: record.title,
        message: error.message,
      });
    }
  }

  return results;
}

async function syncSourcesAndAi({ category, limit, sources, rewrite, includeExisting, googleQuery }) {
  const normalizedSources = normalizeSyncSources(sources);
  const sourceResults = [];
  const rewriteCandidates = [];

  if (normalizedSources.includes("cliff")) {
    const cliffResult = await saveCliffNewsForCategory(category, limit, {
      includeExisting,
      language: CLIFF_NEWS_LANGUAGE,
    });
    sourceResults.push(cliffResult);
    rewriteCandidates.push(...cliffResult.rewriteCandidates);
  }

  if (normalizedSources.includes("google")) {
    const googleResult = await saveGoogleRssNewsForCategory(category, limit, {
      query: googleQuery,
      includeExisting,
    });
    sourceResults.push(googleResult);
    rewriteCandidates.push(...googleResult.rewriteCandidates);
  }

  if (normalizedSources.includes("rss")) {
    const { browser, page } = await createBrowserPage();
    try {
      const rssResult = await fetchArticlesForCategory(page, category, limit);
      sourceResults.push({
        ...rssResult,
        source: "configured-rss",
      });

      for (const item of rssResult.results || []) {
        if (item.status !== "Success" || !item.saved_id) {
          continue;
        }

        const record = await findFullNewsRecordById(item.saved_id);
        if (record) {
          rewriteCandidates.push(record);
        }
      }
    } finally {
      await browser.close();
    }
  }

  const rewriteResults = await rewriteNewsRecords(rewriteCandidates, { enabled: rewrite });

  return {
    status: sourceResults.some((item) => item.saved_count > 0 || item.existing_count > 0) ? "Success" : "Skipped",
    category,
    sources: normalizedSources,
    requested_limit_per_source: limit,
    saved_count: sourceResults.reduce((sum, item) => sum + (item.saved_count || 0), 0),
    existing_count: sourceResults.reduce((sum, item) => sum + (item.existing_count || 0), 0),
    skipped_count: sourceResults.reduce((sum, item) => sum + (item.skipped_count || 0), 0),
    failed_count: sourceResults.reduce((sum, item) => sum + (item.failed_count || 0), 0),
    ai_rewrite_enabled: Boolean(rewrite),
    ai_success_count: rewriteResults.filter((item) => item.status === "Success").length,
    ai_failed_count: rewriteResults.filter((item) => item.status === "Error").length,
    source_results: sourceResults.map(({ rewriteCandidates: _rewriteCandidates, ...item }) => item),
    ai_results: rewriteResults,
  };
}

async function syncPrimarySourcesAndAi({
  category,
  limit,
  sources,
  rewrite,
  includeExisting,
  googleQuery,
} = {}) {
  const normalizedSources = normalizePrimarySyncSources(sources);
  const sourceResults = [];
  const rewriteCandidates = [];
  let rssBrowser = null;
  let rssPage = null;

  try {
    for (const source of normalizedSources) {
    if (source === "cliff-news") {
      const cliffResult = await saveCliffNewsForCategory(category, limit, {
        includeExisting,
        language: CLIFF_NEWS_LANGUAGE,
      });
      sourceResults.push(cliffResult);
      rewriteCandidates.push(...cliffResult.rewriteCandidates);
      continue;
    }

    if (source === "google-rss") {
      const googleResult = await saveGoogleRssNewsForCategory(category, limit, {
        query: googleQuery,
        includeExisting,
      });
      sourceResults.push(googleResult);
      rewriteCandidates.push(...googleResult.rewriteCandidates);
      continue;
    }

    if (!rssPage) {
      ({ browser: rssBrowser, page: rssPage } = await createBrowserPage());
    }

    const rssResult = await fetchArticlesForCategory(rssPage, category, limit, {
      includeSources: [source],
      allowEmpty: true,
    });
    sourceResults.push({
      ...rssResult,
      source,
    });

    for (const item of rssResult.results || []) {
      if (item.status !== "Success" || !item.saved_id) {
        continue;
      }

      const record = await findFullNewsRecordById(item.saved_id);
      if (record) {
        rewriteCandidates.push(record);
      }
    }
  }
  } finally {
    if (rssBrowser) {
      await rssBrowser.close();
    }
  }

  const rewriteResults = await rewriteNewsRecords(rewriteCandidates, { enabled: rewrite });

  return {
    category,
    limit_per_source: limit,
    sources: normalizedSources,
    source_results: sourceResults,
    fetched_count: sourceResults.reduce((sum, item) => sum + (item.fetched_count || 0), 0),
    saved_count: sourceResults.reduce((sum, item) => sum + (item.saved_count || 0), 0),
    existing_count: sourceResults.reduce((sum, item) => sum + (item.existing_count || 0), 0),
    skipped_count: sourceResults.reduce((sum, item) => sum + (item.skipped_count || 0), 0),
    failed_count: sourceResults.reduce((sum, item) => sum + (item.failed_count || 0), 0),
    ai_rewrite_enabled: rewrite,
    ai_success_count: rewriteResults.filter((item) => item.status === "Success").length,
    ai_failed_count: rewriteResults.filter((item) => item.status === "Error").length,
    ai_results: rewriteResults,
  };
}

async function saveMpInfoScraperArticle(article) {
  const sourceUrl = article?.sourceUrl;
  if (!sourceUrl) {
    return {
      status: "Error",
      message: "MP Info article sourceUrl is missing.",
    };
  }

  const freshness = isFreshPublishedDate(article?.publishDate);
  if (!freshness.fresh) {
    return {
      status: "Skipped",
      message: buildFreshnessSkipMessage(freshness),
    };
  }

  const existingRecord = await findFullNewsRecordByUrl(sourceUrl);
  const duplicateRecord = existingRecord || await findNewsRecordDuplicate({
    articleUrl: sourceUrl,
    titleSignature: normalizeNewsTitleSignature(article.title),
  });
  if (duplicateRecord) {
    if (duplicateRecord.category !== MPINFO_DISTRICT_CATEGORY) {
      await dbPool.execute(
        "UPDATE fetched_news SET category = ? WHERE id = ?",
        [MPINFO_DISTRICT_CATEGORY, duplicateRecord.id]
      );
      duplicateRecord.category = MPINFO_DISTRICT_CATEGORY;
    }

    return {
      id: duplicateRecord.id,
      status: "Existing",
      record: duplicateRecord,
      message: `Duplicate article already saved as id ${duplicateRecord.id}.`,
    };
  }

  const articleImageUrl = sanitizeArticleImageUrl(article.imageUrl);
  const recordId = await saveNewsRecord({
    category: MPINFO_DISTRICT_CATEGORY,
    feedSource: `mpinfo-${String(article.district || "district").toLowerCase().replace(/\s+/g, "-")}`,
    feedUrl: `https://${article.subdomain || "mpinfo.org"}/`,
    query: article.district || "mpinfo",
    title: article.title || "MP Info News",
    articleUrl: sourceUrl,
    imageLink: articleImageUrl,
    imageSource: articleImageUrl ? "mpinfo-playwright" : null,
    sourcePublishedAt: freshness.publishedAt,
  });
  const record = recordId ? await findFullNewsRecordById(recordId) : await findFullNewsRecordByUrl(sourceUrl);

  return {
    id: record?.id || null,
    status: recordId ? "Success" : "Skipped",
    record,
    message: recordId ? null : "Duplicate article was already saved before insert.",
  };
}

async function rewriteSavedNewsRecord(record, scrapedArticle = null) {
  return createOrUpdateRewriteForRecord(
    dbPool,
    {
      ...record,
      scraped_content_text: scrapedArticle?.contentText || "",
      scraped_content_html: scrapedArticle?.contentHtml || "",
      scraped_subtitle: scrapedArticle?.subtitle || "",
      scraped_publish_date: scrapedArticle?.publishDate || "",
      scraped_district: scrapedArticle?.district || "",
      scraped_division: scrapedArticle?.division || "",
    },
    createBrowserPage,
    () => runRetentionCleanupCycle("mpinfo-ai-rewrite-save")
  );
}

async function createBrowserPage() {
  const executablePath = resolveBrowserExecutablePath();
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--metrics-recording-only",
      "--mute-audio",
      "--no-first-run",
      "--no-zygote",
    ],
    ...(executablePath ? { executablePath } : {}),
  });

  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setDefaultNavigationTimeout(25_000);
  await page.setDefaultTimeout(10_000);
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const resourceType = request.resourceType();
    if (["font", "media", "stylesheet", "manifest", "other"].includes(resourceType)) {
      return request.abort();
    }

    return request.continue();
  });

  return { browser, page };
}

async function runScheduledCategoryFetch(category, options = {}) {
  const workerName = `main:${category}:${options.triggerSource || "schedule"}`;
  const locked = await withIngestionWorkerLock(workerName, () => (
    runScheduledCategoryFetchUnlocked(category, options)
  ));

  if (!locked.acquired) {
    return {
      category,
      fetched_count: 0,
      saved_count: 0,
      failed_count: 0,
      skipped_count: 1,
      results: [
        {
          status: "Skipped",
          category,
          message: "Another cron worker is already running.",
        },
      ],
    };
  }

  return locked.result;
}

async function runScheduledCategoryFetchUnlocked(category, options = {}) {
  const quota = await getDailyNewsQuota();
  if (quota.remaining <= 0) {
    return {
      category,
      fetched_count: 0,
      saved_count: 0,
      failed_count: 0,
      skipped_count: 1,
      results: [
        {
          status: "Skipped",
          category,
          message: `Daily news limit reached (${quota.savedCount}/${quota.limit}).`,
        },
      ],
      daily_quota: quota,
    };
  }

  if (quota.paceRemaining <= 0) {
    return {
      category,
      fetched_count: 0,
      saved_count: 0,
      failed_count: 0,
      skipped_count: 1,
      results: [
        {
          status: "Skipped",
          category,
          message: `Scheduler is pacing the daily limit (${quota.savedCount}/${quota.paceBudget} allowed so far).`,
        },
      ],
      daily_quota: quota,
    };
  }

  const perRunLimit = Math.max(
    1,
    Math.min(SCHEDULER_ARTICLES_PER_CATEGORY_RUN, quota.remaining, quota.paceRemaining)
  );
  const feedCount = getSchedulerSourceCount(category);
  const currentCursor = schedulerState.categories[category]?.sourceCursor || 0;
  const triggerSource = options.triggerSource || "schedule";
  const windowKey = options.windowKey || null;
  const logId = await createSchedulerRunLog({
    schedulerName: "main",
    runType: "category",
    triggerSource,
    category,
    windowKey,
    requestedLimit: perRunLimit,
    message: `Fetching automatic primary sources for ${category}.`,
  });
  let browser = null;

  try {
    const result = await withTimeout(
      fetchPrimaryNewsForCategory(null, category, perRunLimit, {
        includeGoogle: SCHEDULER_GOOGLE_RSS_ENABLED,
        fallbackStartIndex: currentCursor,
      runAllPrimarySources: true,
      primarySourceLimit: SCHEDULER_PRIMARY_SOURCE_LIMIT,
    }),
      SCHEDULER_CATEGORY_TIMEOUT_MS,
      `Scheduled automatic primary fetch for ${category}`
    );

    schedulerState.categories[category] = {
      ...schedulerState.categories[category],
      lastRunAt: new Date().toISOString(),
      lastStatus: result.saved_count > 0 ? "Success" : result.skipped_count > 0 ? "Skipped" : "Idle",
      savedCount: result.saved_count,
      skippedCount: result.skipped_count,
      failedCount: result.failed_count,
      lastHeadline: result.results.find((item) => item.status === "Success")?.title || null,
      sourceCursor: (currentCursor + 1) % feedCount,
    };
    schedulerState.lastRunAt = new Date().toISOString();
    await finalizeSchedulerRunLog(logId, {
      status: result.saved_count > 0 ? "Success" : result.skipped_count > 0 ? "Skipped" : "Idle",
      savedCount: result.saved_count,
      skippedCount: result.skipped_count,
      failedCount: result.failed_count,
      title: result.results.find((item) => item.status === "Success")?.title || null,
      message: `Completed ${triggerSource} fetch for ${category}.`,
      details: result,
    });
    void runRetentionCleanupCycle("scheduled-category-fetch").catch((cleanupError) => {
      console.warn(`Retention cleanup after scheduled fetch failed: ${cleanupError.message}`);
    });
    return result;
  } catch (error) {
    await finalizeSchedulerRunLog(logId, {
      status: "Error",
      failedCount: 1,
      message: `Fetch failed for ${category}.`,
      errorMessage: error.message,
    });
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function runAiScheduledCycle(triggerSource = "schedule") {
  const categories = Object.keys(RSS_FEEDS);
  const cycleLogId = await createSchedulerRunLog({
    schedulerName: "ai",
    runType: "cycle",
    triggerSource,
    requestedLimit: categories.length,
    message: "Starting AI rewrite cycle.",
  });
  try {
    const results = await runAiRewriteCycleForCategories({
      dbPool,
      categories,
      createBrowserPage,
      afterRewriteSaved: () => runRetentionCleanupCycle("ai-rewrite-save"),
    });

    const nowIso = new Date().toISOString();
    for (const category of categories) {
      const result = results.find((item) => item.category === category) || null;
      aiSchedulerState.categories[category] = {
        lastRunAt: nowIso,
        lastStatus: result?.status || "Skipped",
        newsId: result?.news_id || null,
        title: result?.title || null,
        savedCount: result?.saved_count || 0,
        message: result?.message || null,
      };
    }

    aiSchedulerState.lastRunAt = nowIso;
    for (const item of results) {
      const categoryLogId = await createSchedulerRunLog({
        schedulerName: "ai",
        runType: "category",
        triggerSource,
        category: item.category,
        requestedLimit: item.requested_limit || 1,
        title: item.title || null,
        message: `AI rewrite ${item.status.toLowerCase()} for ${item.category}.`,
      });

      await finalizeSchedulerRunLog(categoryLogId, {
        status: item.status,
        savedCount: item.status === "Success" ? item.saved_count || 1 : 0,
        skippedCount: item.status === "Skipped" ? 1 : 0,
        failedCount: item.status === "Error" ? 1 : 0,
        title: item.title || null,
        message: item.message || `AI rewrite cycle processed ${item.category}.`,
        errorMessage: item.status === "Error" ? item.message : null,
        details: item,
      });
    }

    await finalizeSchedulerRunLog(cycleLogId, {
      status: results.some((item) => item.status === "Error")
        ? "CompletedWithErrors"
        : results.some((item) => item.status === "Success")
          ? "Success"
          : "Skipped",
      savedCount: results.reduce((total, item) => total + (item.status === "Success" ? item.saved_count || 1 : 0), 0),
      skippedCount: results.filter((item) => item.status === "Skipped").length,
      failedCount: results.filter((item) => item.status === "Error").length,
      message: "AI rewrite cycle finished.",
      details: results,
    });
    return results;
  } catch (error) {
    await finalizeSchedulerRunLog(cycleLogId, {
      status: "Error",
      failedCount: 1,
      message: "AI rewrite cycle failed.",
      errorMessage: error.message,
    });
    throw error;
  }
}

async function runAiScheduledCycleWithLock(triggerSource = "schedule") {
  const sharedLocked = await withIngestionWorkerLock(`ai:${triggerSource}`, async () => {
    const locked = await withDatabaseLock(AI_SCHEDULER_LOCK_NAME, async () => (
      runAiScheduledCycle(triggerSource)
    ));

    if (!locked.acquired) {
      aiSchedulerState.lastStatus = "Busy";
      aiSchedulerState.lastError = null;
      return {
        __cronBusy: true,
        message: "Another backend instance is already running the AI scheduler cycle.",
      };
    }

    return locked.result;
  });

  if (!sharedLocked.acquired) {
    aiSchedulerState.lastStatus = "Busy";
    aiSchedulerState.lastError = "Waiting for another cron worker to finish.";
    return {
      acquired: false,
      result: null,
    };
  }

  if (sharedLocked.result?.__cronBusy) {
    return {
      acquired: false,
      result: null,
    };
  }

  return {
    acquired: true,
    result: sharedLocked.result,
  };
}

async function runMpInfoDistrictScheduledCycle(triggerSource = "schedule") {
  if (!mpInfoDistrictSchedulerState.enabled) {
    return {
      status: "Skipped",
      message: "MP Info district scheduler is disabled.",
    };
  }

  const ingestionLocked = await withIngestionWorkerLock(`mpinfo-districts:${triggerSource}`, async () => {
    const locked = await withDatabaseLock(MPINFO_DISTRICT_SCHEDULER_LOCK_NAME, async () => (
      runMpInfoDistrictScheduledCycleUnlocked(triggerSource)
    ));

    if (!locked.acquired) {
      mpInfoDistrictSchedulerState.lastStatus = "Busy";
      mpInfoDistrictSchedulerState.lastError = null;
      updateMpInfoDistrictSchedulerHeartbeat();
      return {
        status: "Busy",
        message: "Another backend instance is already running the MP Info district scheduler.",
      };
    }

    return locked.result;
  });

  if (!ingestionLocked.acquired) {
    mpInfoDistrictSchedulerState.lastStatus = "Busy";
    mpInfoDistrictSchedulerState.lastError = null;
    updateMpInfoDistrictSchedulerHeartbeat();
    return {
      status: "Busy",
      message: "Another cron worker is already running.",
    };
  }

  return ingestionLocked.result;
}

async function runMpInfoDistrictScheduledCycleUnlocked(triggerSource = "schedule") {
  if (!mpInfoDistrictSchedulerState.enabled || mpInfoDistrictSchedulerRunning) {
    return {
      status: "Skipped",
      message: "MP Info district scheduler is disabled or already running.",
    };
  }

  mpInfoDistrictSchedulerRunning = true;
  updateMpInfoDistrictSchedulerHeartbeat();
  mpInfoDistrictSchedulerState.lastStatus = "Running";
  mpInfoDistrictSchedulerState.lastError = null;

  try {
    return await runMpInfoDistrictScheduledCycleWork(triggerSource);
  } finally {
    mpInfoDistrictSchedulerRunning = false;
    updateMpInfoDistrictSchedulerHeartbeat();
  }
}

async function runMpInfoDistrictScheduledCycleWork(triggerSource = "schedule") {
  const districtStartIndex = mpInfoDistrictSchedulerState.nextDistrictIndex;
  const logId = await createSchedulerRunLog({
    schedulerName: "main",
    runType: "mpinfo-districts",
    triggerSource,
    category: MPINFO_DISTRICT_CATEGORY,
    requestedLimit: mpInfoDistrictSchedulerState.limit,
    message: "Starting MP Info district crawl.",
  });

  try {
    const result = await withTimeout(
      crawlLatest({
        limit: mpInfoDistrictSchedulerState.limit,
        districtScanLimit: mpInfoDistrictSchedulerState.districtScanLimit,
        districtStartIndex,
        concurrency: 1,
        withContent: true,
        saveSnapshots: false,
      }),
      MPINFO_DISTRICT_SCHEDULER_TIMEOUT_MS,
      "MP Info district crawl"
    );
    const saved = [];
    const rewritten = [];

    for (const article of result.articles || []) {
      const savedRecord = await saveMpInfoScraperArticle(article);
      saved.push({
        articleId: article.articleId,
        savedId: savedRecord?.id || null,
        status: savedRecord?.status || "Skipped",
      });

      if (mpInfoDistrictSchedulerState.rewrite && savedRecord?.record) {
        try {
          const rewriteRecord = await rewriteSavedNewsRecord(savedRecord.record, article);
          rewritten.push({
            articleId: article.articleId,
            newsId: savedRecord.record.id,
            rewriteId: rewriteRecord.id,
            status: "Success",
          });
        } catch (error) {
          rewritten.push({
            articleId: article.articleId,
            newsId: savedRecord.record.id,
            status: "Error",
            message: error.message,
          });
        }
      }
    }

    const summary = {
      district_count: result.districtCount || 0,
      district_start_index: result.districtStartIndex ?? districtStartIndex,
      next_district_index: result.nextDistrictIndex ?? mpInfoDistrictSchedulerState.nextDistrictIndex,
      fetched_count: result.fetchedCount || 0,
      failed_district_count: result.failedDistrictCount || 0,
      saved_count: saved.filter((item) => item.status === "Success").length,
      existing_count: saved.filter((item) => item.status === "Existing").length,
      rewrite_success_count: rewritten.filter((item) => item.status === "Success").length,
      rewrite_failed_count: rewritten.filter((item) => item.status === "Error").length,
    };
    if (Number.isInteger(result.nextDistrictIndex)) {
      mpInfoDistrictSchedulerState.nextDistrictIndex = result.nextDistrictIndex;
    }

    mpInfoDistrictSchedulerState.lastRunAt = new Date().toISOString();
    mpInfoDistrictSchedulerState.lastStatus = summary.failed_district_count > 0 ? "CompletedWithErrors" : "Success";
    mpInfoDistrictSchedulerState.lastError = null;
    mpInfoDistrictSchedulerState.lastResult = summary;

    await finalizeSchedulerRunLog(logId, {
      status: mpInfoDistrictSchedulerState.lastStatus,
      savedCount: summary.saved_count + summary.rewrite_success_count,
      skippedCount: summary.existing_count,
      failedCount: summary.failed_district_count + summary.rewrite_failed_count,
      message: "MP Info district crawl finished.",
      details: { summary, saved, rewritten },
    });

    void runRetentionCleanupCycle("mpinfo-district-scheduler").catch((cleanupError) => {
      console.warn(`Retention cleanup after MP Info district scheduler failed: ${cleanupError.message}`);
    });

    return { status: mpInfoDistrictSchedulerState.lastStatus, ...summary };
  } catch (error) {
    mpInfoDistrictSchedulerState.lastRunAt = new Date().toISOString();
    mpInfoDistrictSchedulerState.lastStatus = "Error";
    mpInfoDistrictSchedulerState.lastError = error.message;
    await finalizeSchedulerRunLog(logId, {
      status: "Error",
      failedCount: 1,
      message: "MP Info district crawl failed.",
      errorMessage: error.message,
    });
    throw error;
  }
}

async function initializeMpInfoDistrictSchedulerCursor() {
  if (!dbPool || !mpInfoDistrictSchedulerState.enabled) {
    return;
  }

  try {
    const [rows] = await dbPool.query(
      `
        SELECT details_json
        FROM scheduler_runs
        WHERE run_type = 'mpinfo-districts'
          AND details_json IS NOT NULL
        ORDER BY id DESC
        LIMIT 1
      `
    );
    const details = rows[0]?.details_json ? JSON.parse(rows[0].details_json) : null;
    const nextIndex = details?.summary?.next_district_index;
    if (Number.isInteger(nextIndex) && nextIndex >= 0) {
      mpInfoDistrictSchedulerState.nextDistrictIndex = nextIndex;
    }
  } catch (error) {
    console.warn(`Could not restore MP Info district cursor: ${error.message}`);
  }
}

async function runSchedulerTestCycle(limit = 1, options = {}) {
  const schedule = getCategorySchedule();
  const results = [];
  const triggerSource = options.triggerSource || "manual";

  for (const slot of schedule) {
    const logId = await createSchedulerRunLog({
      schedulerName: "main",
      runType: "category",
      triggerSource,
      category: slot.category,
      requestedLimit: limit,
      message: `Manual scheduler run for ${slot.category}.`,
    });
    try {
      const result = await withTimeout(
        fetchPrimaryNewsForCategory(null, slot.category, limit, {
          fallbackStartIndex: schedulerState.categories[slot.category]?.sourceCursor || 0,
          includeGoogle: SCHEDULER_GOOGLE_RSS_ENABLED,
          runAllPrimarySources: true,
          primarySourceLimit: SCHEDULER_PRIMARY_SOURCE_LIMIT,
        }),
        SCHEDULER_CATEGORY_TIMEOUT_MS,
        `Manual scheduler fetch for ${slot.category}`
      );

      const feedCount = getSchedulerSourceCount(slot.category);
      schedulerState.categories[slot.category] = {
        ...schedulerState.categories[slot.category],
        lastRunAt: new Date().toISOString(),
        lastStatus:
          result.saved_count > 0 ? "Success" : result.skipped_count > 0 ? "Skipped" : "Idle",
        savedCount: result.saved_count,
        skippedCount: result.skipped_count,
        failedCount: result.failed_count,
        lastHeadline: result.results.find((item) => item.status === "Success")?.title || null,
        sourceCursor:
          ((schedulerState.categories[slot.category]?.sourceCursor || 0) + 1) % feedCount,
      };

      results.push({
        category: slot.category,
        offsetSeconds: slot.offsetSeconds,
        requested_limit: limit,
        saved_count: result.saved_count,
        skipped_count: result.skipped_count,
        failed_count: result.failed_count,
      });
      await finalizeSchedulerRunLog(logId, {
        status: result.saved_count > 0 ? "Success" : result.skipped_count > 0 ? "Skipped" : "Idle",
        savedCount: result.saved_count,
        skippedCount: result.skipped_count,
        failedCount: result.failed_count,
        title: result.results.find((item) => item.status === "Success")?.title || null,
        message: `Manual scheduler run completed for ${slot.category}.`,
        details: result,
      });
    } catch (error) {
      await finalizeSchedulerRunLog(logId, {
        status: "Error",
        failedCount: 1,
        message: `Manual scheduler run failed for ${slot.category}.`,
        errorMessage: error.message,
      });
      throw error;
    }
  }

  schedulerState.lastRunAt = new Date().toISOString();
  return results;
}

async function schedulerTick() {
  if (!schedulerState.enabled || schedulerRunning) {
    return;
  }

  schedulerRunning = true;
  schedulerHeartbeatInterval = startHeartbeat(
    schedulerHeartbeatInterval,
    updateSchedulerHeartbeat,
    SCHEDULER_TICK_MS
  );

  try {
    const locked = await withDatabaseLock(MAIN_SCHEDULER_LOCK_NAME, async () => {
      if (isQuietHours()) {
        return;
      }

      const now = new Date();
      const windowKey = buildWindowKey(now);
      const windowSecond = getWindowSecond(now);
      schedulerState.lastWindowKey = windowKey;

      const schedule = getCategorySchedule();

      for (const slot of schedule) {
        const categoryState = schedulerState.categories[slot.category] || {};
        const alreadyHandled = categoryState.windowKey === windowKey;
        const isDue = windowSecond >= slot.offsetSeconds && windowSecond < slot.offsetSeconds + 30;

        if (alreadyHandled || !isDue) {
          continue;
        }

        schedulerState.categories[slot.category] = {
          ...categoryState,
          windowKey,
          scheduledOffsetSeconds: slot.offsetSeconds,
          lastRunAt: new Date().toISOString(),
          lastStatus: "Running",
          lastError: null,
        };

        try {
          const result = await runScheduledCategoryFetch(slot.category, {
            triggerSource: "schedule",
            windowKey,
          });
          schedulerState.categories[slot.category] = {
            ...schedulerState.categories[slot.category],
            lastRunAt: new Date().toISOString(),
            lastStatus:
              result.saved_count > 0 ? "Success" : result.skipped_count > 0 ? "Skipped" : "Idle",
            savedCount: result.saved_count,
            skippedCount: result.skipped_count,
            failedCount: result.failed_count,
            lastHeadline: result.results.find((item) => item.status === "Success")?.title || null,
            lastError: null,
          };
        } catch (error) {
          schedulerState.categories[slot.category] = {
            ...schedulerState.categories[slot.category],
            lastRunAt: new Date().toISOString(),
            lastStatus: "Error",
            failedCount: (categoryState.failedCount || 0) + 1,
            lastError: error.message,
          };
          console.error(`Scheduler category ${slot.category} failed:`, error.message);
        }
      }
    });

    if (!locked.acquired) {
      return;
    }
  } catch (error) {
    console.error("Scheduler tick failed:", error.message);
  } finally {
    stopHeartbeat(schedulerHeartbeatInterval);
    schedulerHeartbeatInterval = null;
    updateSchedulerHeartbeat();
    schedulerRunning = false;
  }
}

function startScheduler() {
  if (!schedulerState.enabled || schedulerInterval) {
    return;
  }

  const schedule = getCategorySchedule();
  schedulerState.schedule = schedule;
  for (const slot of schedule) {
    schedulerState.categories[slot.category] = schedulerState.categories[slot.category] || {
      scheduledOffsetSeconds: slot.offsetSeconds,
      lastRunAt: null,
      lastStatus: "Waiting",
      savedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      lastHeadline: null,
      lastError: null,
      sourceCursor: 0,
    };
  }

  schedulerInterval = setInterval(() => {
    void schedulerTick();
  }, SCHEDULER_TICK_MS);

  void schedulerTick();
}

function startAiScheduler() {
  if (!aiSchedulerState.enabled || aiSchedulerInterval) {
    return;
  }

  const aiSchedulerTick = async () => {
    if (aiSchedulerRunning || !aiSchedulerState.enabled) {
      return;
    }

    aiSchedulerRunning = true;
    aiSchedulerHeartbeatInterval = startHeartbeat(
      aiSchedulerHeartbeatInterval,
      updateAiSchedulerHeartbeat,
      AI_SCHEDULER_TICK_MS
    );

    try {
      const windowKey = buildAiWindowKey();
      if (aiSchedulerState.lastWindowKey === windowKey) {
        return;
      }

      if (await isIngestionWorkerBusy()) {
        aiSchedulerState.lastStatus = "Busy";
        aiSchedulerState.lastError = "Waiting for ingestion cron to finish.";
        return;
      }

      aiSchedulerState.lastWindowKey = windowKey;

      const locked = await runAiScheduledCycleWithLock("schedule");
      if (!locked?.acquired) {
        aiSchedulerState.lastStatus = "Skipped";
      }
    } catch (error) {
      aiSchedulerState.lastStatus = "Error";
      aiSchedulerState.lastError = error.message;
      console.error("AI scheduler tick failed:", error.message);
    } finally {
      stopHeartbeat(aiSchedulerHeartbeatInterval);
      aiSchedulerHeartbeatInterval = null;
      updateAiSchedulerHeartbeat();
      aiSchedulerRunning = false;
    }
  };

  aiSchedulerInterval = setInterval(() => {
    void aiSchedulerTick();
  }, AI_SCHEDULER_TICK_MS);

  void aiSchedulerTick();
}

function startMpInfoDistrictScheduler() {
  if (!mpInfoDistrictSchedulerState.enabled || mpInfoDistrictSchedulerInterval) {
    return;
  }

  updateMpInfoDistrictSchedulerHeartbeat();
  mpInfoDistrictSchedulerInterval = setInterval(() => {
    void runMpInfoDistrictScheduledCycle("schedule").catch((error) => {
      console.error("MP Info district scheduler tick failed:", error.message);
    });
  }, mpInfoDistrictSchedulerState.intervalMs);

  if (MPINFO_DISTRICT_SCHEDULER_STARTUP_RUN) {
    void runMpInfoDistrictScheduledCycle("startup").catch((error) => {
      console.error("MP Info district scheduler startup run failed:", error.message);
    });
  }
}

function startSchedulerWatchdog() {
  if (schedulerWatchdogInterval) {
    return;
  }

  schedulerWatchdogInterval = setInterval(() => {
    if (!processState.shuttingDown) {
      void recoverStaleSchedulerRuns("watchdog").catch((error) => {
        console.error("Scheduler stale-run recovery failed:", error.message);
      });

      if (schedulerState.enabled && !schedulerInterval) {
        console.warn("Scheduler watchdog restarted the main scheduler interval.");
        startScheduler();
      }

      if (aiSchedulerState.enabled && !aiSchedulerInterval) {
        console.warn("Scheduler watchdog restarted the AI scheduler interval.");
        startAiScheduler();
      }

      if (mpInfoDistrictSchedulerState.enabled && !mpInfoDistrictSchedulerInterval) {
        console.warn("Scheduler watchdog restarted the MP Info district scheduler interval.");
        startMpInfoDistrictScheduler();
      }

      if (schedulerState.enabled && isTimestampStale(schedulerState.lastTickAt, SCHEDULER_HEALTH_THRESHOLD_MS)) {
        console.warn("Scheduler watchdog detected a stale main scheduler tick and triggered a recovery tick.");
        void schedulerTick();
      }

      if (aiSchedulerState.enabled && isTimestampStale(aiSchedulerState.lastTickAt, AI_SCHEDULER_HEALTH_THRESHOLD_MS)) {
        console.warn("Scheduler watchdog detected a stale AI scheduler tick and triggered a recovery tick.");
        if (aiSchedulerRunning) {
          return;
        }

        aiSchedulerRunning = true;
        aiSchedulerHeartbeatInterval = startHeartbeat(
          aiSchedulerHeartbeatInterval,
          updateAiSchedulerHeartbeat,
          AI_SCHEDULER_TICK_MS
        );
        void runAiScheduledCycleWithLock("watchdog")
          .then((locked) => {
            if (locked?.acquired) {
              aiSchedulerState.lastWindowKey = buildAiWindowKey();
            }
          })
          .catch((error) => {
            console.error("AI scheduler watchdog recovery failed:", error.message);
          })
          .finally(() => {
            stopHeartbeat(aiSchedulerHeartbeatInterval);
            aiSchedulerHeartbeatInterval = null;
            updateAiSchedulerHeartbeat();
            aiSchedulerRunning = false;
          });
      }

      if (
        mpInfoDistrictSchedulerState.enabled &&
        isTimestampStale(
          mpInfoDistrictSchedulerState.lastTickAt,
          (mpInfoDistrictSchedulerState.intervalMs * 2) + 60_000
        ) &&
        !mpInfoDistrictSchedulerRunning
      ) {
        console.warn("Scheduler watchdog detected a stale MP Info district scheduler tick and triggered recovery.");
        void runMpInfoDistrictScheduledCycle("watchdog").catch((error) => {
          console.error("MP Info district scheduler watchdog recovery failed:", error.message);
        });
      }
    }
  }, WATCHDOG_TICK_MS);
}

async function shutdown(signal) {
  if (processState.shuttingDown) {
    return;
  }

  processState.shuttingDown = true;
  console.log(`Received ${signal}. Shutting down gracefully...`);
  clearSchedulerIntervals();

  try {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  } catch (error) {
    console.error("HTTP server close failed:", error.message);
  }

  try {
    if (dbPool) {
      await dbPool.end();
    }
  } catch (error) {
    console.error("Database pool close failed:", error.message);
  }

  process.exit(0);
}

if (LEGACY_PUBLIC_ROUTES_ENABLED) {
  app.get("/fetch-news", async (req, res) => {
    const query = normalizeCategory(req.query.q || DEFAULT_CATEGORY);
    const limit = normalizeArticleLimit(req.query.limit);
    console.log(`Searching query: ${query} | limit: ${limit}`);

    const { browser, page } = await createBrowserPage();

    try {
      const categoryResult = await fetchPrimaryNewsForCategory(page, query, limit);

      res.json({
        status: categoryResult.saved_count > 0 ? "Success" : "Error",
        database: DB_NAME,
        query,
        requested_limit: limit,
        fetched_count: categoryResult.fetched_count,
        saved_count: categoryResult.saved_count,
        failed_count: categoryResult.failed_count,
        instructions:
          "Each successful item contains the direct image URL extracted from the original article page and saved in MySQL.",
        results: categoryResult.results,
      });
    } catch (error) {
      res.status(500).json({
        status: "Error",
        message: error.message,
      });
    } finally {
      await browser.close();
    }
  });

  app.get("/fetch-news/category/:category", async (req, res) => {
    const category = normalizeCategory(req.params.category);
    const limit = normalizeArticleLimit(req.query.limit);
    console.log(`Searching category URL: ${category} | limit: ${limit}`);

    const { browser, page } = await createBrowserPage();

    try {
      const categoryResult = await fetchPrimaryNewsForCategory(page, category, limit);

      res.json({
        status: categoryResult.saved_count > 0 ? "Success" : "Error",
        database: DB_NAME,
        category,
        requested_limit: limit,
        fetched_count: categoryResult.fetched_count,
        saved_count: categoryResult.saved_count,
        failed_count: categoryResult.failed_count,
        instructions:
          "Each successful item contains the direct image URL extracted from the original article page and saved in MySQL.",
        results: categoryResult.results,
      });
    } catch (error) {
      res.status(500).json({
        status: "Error",
        message: error.message,
      });
    } finally {
      await browser.close();
    }
  });

  app.get("/fetch-news/all", async (req, res) => {
    const total = req.query.total ? normalizeTotalLimit(req.query.total) : null;
    const limit = normalizeArticleLimit(req.query.limit || 5);
    console.log(
      total
        ? `Fetching all categories | total distributed stories: ${total}`
        : `Fetching all categories | limit per category: ${limit}`
    );

    const { browser, page } = await createBrowserPage();

    try {
      const payload = total
        ? await fetchAllCategoriesByTotal(page, total)
        : await fetchAllCategories(page, limit);

      res.json({
        status: payload.saved_count > 0 ? "Success" : "Error",
        database: DB_NAME,
        category_count: payload.categories.length,
        categories: payload.categories,
        requested_limit_per_category: total ? null : limit,
        requested_total: total,
        allocation: payload.allocation || null,
        fetched_count: payload.fetched_count,
        saved_count: payload.saved_count,
        failed_count: payload.failed_count,
        instructions:
          "Each category contains up to the requested number of stories, and each successful item is saved in MySQL.",
        results: payload.results,
      });
    } catch (error) {
      res.status(500).json({
        status: "Error",
        message: error.message,
      });
    } finally {
      await browser.close();
    }
  });
}

async function handleFetchRssNews(req, res) {
  const category = normalizeCategory(req.query.category || DEFAULT_CATEGORY);
  const limit = normalizeArticleLimit(req.query.limit || 5);
  console.log(`Fetching primary news sources | category: ${category} | limit: ${limit}`);

  const { browser, page } = await createBrowserPage();

  try {
    const categoryResult = await fetchPrimaryNewsForCategory(page, category, limit);

    res.json({
      status: categoryResult.saved_count > 0 ? "Success" : "Error",
      source: "Google RSS + priority government feeds",
      database: DB_NAME,
      category,
      feed_urls: getCategoryFeedPool(category),
      requested_limit: limit,
      fetched_count: categoryResult.fetched_count,
      saved_count: categoryResult.saved_count,
      failed_count: categoryResult.failed_count,
      results: categoryResult.results,
    });
  } catch (error) {
    res.status(500).json({
      status: "Error",
      message: error.message,
    });
  } finally {
    await browser.close();
  }
}

async function handleFetchRssNewsAll(req, res) {
  const total = req.query.total ? normalizeTotalLimit(req.query.total) : null;
  const limit = normalizeArticleLimit(req.query.limit || 5);
  console.log(
    total
      ? `Fetching all primary news sources | total distributed stories: ${total}`
      : `Fetching all primary news sources | limit per category: ${limit}`
  );

  const { browser, page } = await createBrowserPage();

  try {
    const payload = total
      ? await fetchAllCategoriesByTotal(page, total)
      : await fetchAllCategories(page, limit);

    res.json({
      status: payload.saved_count > 0 ? "Success" : "Error",
      source: "Google RSS + priority government feeds",
      database: DB_NAME,
      category_count: payload.categories.length,
      categories: payload.categories,
      requested_limit_per_category: total ? null : limit,
      requested_total: total,
      allocation: payload.allocation || null,
      fetched_count: payload.fetched_count,
      saved_count: payload.saved_count,
      failed_count: payload.failed_count,
      results: payload.results,
    });
  } catch (error) {
    res.status(500).json({
      status: "Error",
      message: error.message,
    });
  } finally {
    await browser.close();
  }
}

if (LEGACY_PUBLIC_ROUTES_ENABLED) {
app.get("/fetch-mpinfo-news", async (req, res) => {
  const category = normalizeCategory(req.query.category || DEFAULT_CATEGORY);
  const limit = normalizeArticleLimit(req.query.limit || 5);
  const mpInfoFeed = { source: "mpinfo", url: "https://mpinfo.org/RSSFeed/RSSFeed_News.xml" };

  console.log(`Fetching MP Info feed | category: ${category} | limit: ${limit}`);

  const { browser, page } = await createBrowserPage();

  try {
    const articleEntries = await getArticleUrlsFromFeeds([mpInfoFeed], limit);
    const results = [];

    for (const articleEntry of articleEntries) {
      const articleUrl = articleEntry.url;
      console.log(`Opening MP Info article for ${category}: ${articleUrl}`);

      try {
        const imageData = await extractBestImageFromArticle(page, articleUrl);
        const metadataImage = sanitizeArticleImageUrl(imageData.featuredImage);
        const featuredImage = metadataImage || null;
        const imageSource = metadataImage ? imageData.imageSource || "article-image" : null;
        const title = imageData.title || articleEntry.title || articleUrl;

        const recordId = await saveNewsRecord({
          category,
          feedSource: articleEntry.feed_source,
          feedUrl: articleEntry.feed_url,
          query: category,
          title,
          articleUrl,
          imageLink: featuredImage,
          imageSource,
        });

        results.push({
          status: "Success",
          saved_id: recordId,
          category,
          feed_source: articleEntry.feed_source,
          feed_url: articleEntry.feed_url,
          source: articleUrl,
          title,
          image_link: featuredImage,
          image_source: imageSource,
        });
      } catch (articleError) {
        results.push({
          status: "Error",
          category,
          feed_source: articleEntry.feed_source,
          feed_url: articleEntry.feed_url,
          source: articleUrl,
          message: articleError.message,
        });
      }
    }

    const savedCount = results.filter((item) => item.status === "Success").length;

    res.json({
      status: savedCount > 0 ? "Success" : "Error",
      source: "MP Info RSS",
      database: DB_NAME,
      category,
      requested_limit: limit,
      fetched_count: articleEntries.length,
      saved_count: savedCount,
      failed_count: results.length - savedCount,
      results,
    });
  } catch (error) {
    res.status(500).json({
      status: "Error",
      message: error.message,
    });
  } finally {
    await browser.close();
  }
});

app.get("/fetch-rss-news", handleFetchRssNews);
app.get("/fetch-rss-news/all", handleFetchRssNewsAll);

app.post("/fetch-sources-ai", async (req, res) => {
  const category = normalizeCategory(req.query.category || req.body?.category || DEFAULT_CATEGORY);
  const limit = Math.min(normalizeArticleLimit(req.query.limit || req.body?.limit || 2), 20);
  const sources = req.query.sources || req.body?.sources || "all";
  const rewrite = !["false", "0", "no"].includes(
    String(req.query.rewrite ?? req.body?.rewrite ?? "true").toLowerCase()
  );
  const includeExisting = ["true", "1", "yes"].includes(
    String(req.query.include_existing ?? req.body?.include_existing ?? "").toLowerCase()
  );

  try {
    const result = await syncSourcesAndAi({
      category,
      limit,
      sources,
      rewrite,
      includeExisting,
      googleQuery: req.query.google_query || req.body?.google_query || null,
    });

    return res.json({
      status: "Success",
      database: DB_NAME,
      output_sizes: {
        words_100: "ui_hindi.short_100",
        words_300: "ui_hindi.medium_300",
        words_600: "ui_hindi.long_500",
      },
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      status: "Error",
      message: error.message,
    });
  }
});

app.post("/fetch-cliff-news", async (req, res) => {
  const category = req.query.category || req.body?.category
    ? normalizeCategory(req.query.category || req.body?.category)
    : null;
  const limit = normalizeApiLimit(req.query.limit || req.body?.limit, CLIFF_NEWS_DEFAULT_LIMIT, 500);
  const page = normalizeCliffNewsPage(req.query.page || req.body?.page || 1);
  const language = String(req.query.language || req.body?.language || CLIFF_NEWS_LANGUAGE).trim().toUpperCase();
  const rewrite = !["false", "0", "no"].includes(
    String(req.query.rewrite ?? req.body?.rewrite ?? "true").toLowerCase()
  );
  const includeExisting = ["true", "1", "yes"].includes(
    String(req.query.include_existing ?? req.body?.include_existing ?? "").toLowerCase()
  );

  try {
    const result = await saveCliffNewsArticles({
      category,
      limit,
      language,
      includeExisting,
      page,
    });
    const rewriteResults = await rewriteNewsRecords(result.rewriteCandidates, { enabled: rewrite });
    const { rewriteCandidates: _rewriteCandidates, ...publicResult } = result;

    return res.json({
      status: "Success",
      database: DB_NAME,
      ...publicResult,
      ai_rewrite_enabled: rewrite,
      ai_success_count: rewriteResults.filter((item) => item.status === "Success").length,
      ai_failed_count: rewriteResults.filter((item) => item.status === "Error").length,
      ai_results: rewriteResults,
    });
  } catch (error) {
    return res.status(500).json({
      status: "Error",
      message: error.message,
    });
  }
});

app.get("/rss-feeds", (req, res) => {
  void getCachedRssFeedsPayload()
    .then((payload) => res.json(payload))
    .catch((error) => res.status(500).json({
      status: "Error",
      message: error.message,
    }));
});

app.get("/categories", (req, res) => {
  void getCachedCategoryCatalogPayload()
    .then((payload) => res.json(payload))
    .catch((error) => res.status(500).json({
      status: "Error",
      message: error.message,
    }));
});

app.get("/cron/status", (req, res) => {
  void getCachedCronStatusPayload()
    .then((payload) => res.json(payload))
    .catch((error) => res.status(500).json({
      status: "Error",
      message: error.message,
    }));
});

app.get("/ai/cron/status", (req, res) => {
  res.json({
    status: "Success",
    scheduler: aiSchedulerState,
  });
});

app.get("/scheduler/logs", async (req, res) => {
  try {
    const schedulerName = typeof req.query.scheduler === "string" ? req.query.scheduler : null;
    const payload = await getCachedSchedulerLogsPayload({
      schedulerName,
      limit: req.query.limit,
    });

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({
      status: "Error",
      message: error.message,
    });
  }
});
}

app.get("/health", async (req, res) => {
  const mainSchedulerHealthy = !schedulerState.enabled
    || !isTimestampStale(schedulerState.lastTickAt, SCHEDULER_HEALTH_THRESHOLD_MS);
  const aiSchedulerHealthy = !aiSchedulerState.enabled
    || !isTimestampStale(aiSchedulerState.lastTickAt, AI_SCHEDULER_HEALTH_THRESHOLD_MS);

  try {
    const [rows] = await dbPool.query("SELECT 1 AS ok");
    const dbHealthy = rows[0]?.ok === 1;
    const healthy = dbHealthy && mainSchedulerHealthy && aiSchedulerHealthy && !processState.shuttingDown;

    return res.status(healthy ? 200 : 503).json({
      status: healthy ? "Success" : "Degraded",
      process: {
        started_at: processState.startedAt,
        shutting_down: processState.shuttingDown,
        uptime_seconds: Math.floor(process.uptime()),
        pid: process.pid,
        last_uncaught_exception: processState.lastUncaughtException,
        last_unhandled_rejection: processState.lastUnhandledRejection,
      },
      database: {
        healthy: dbHealthy,
        name: DB_NAME,
      },
      schedulers: {
        main: {
          enabled: schedulerState.enabled,
          healthy: mainSchedulerHealthy,
          last_tick_at: schedulerState.lastTickAt,
          last_run_at: schedulerState.lastRunAt,
        },
        ai: {
          enabled: aiSchedulerState.enabled,
          healthy: aiSchedulerHealthy,
          last_tick_at: aiSchedulerState.lastTickAt,
          last_run_at: aiSchedulerState.lastRunAt,
        },
      },
    });
  } catch (error) {
    return res.status(503).json({
      status: "Error",
      message: error.message,
      process: {
        started_at: processState.startedAt,
        shutting_down: processState.shuttingDown,
        uptime_seconds: Math.floor(process.uptime()),
        pid: process.pid,
      },
      schedulers: {
        main: {
          enabled: schedulerState.enabled,
          healthy: mainSchedulerHealthy,
          last_tick_at: schedulerState.lastTickAt,
          last_run_at: schedulerState.lastRunAt,
        },
        ai: {
          enabled: aiSchedulerState.enabled,
          healthy: aiSchedulerHealthy,
          last_tick_at: aiSchedulerState.lastTickAt,
          last_run_at: aiSchedulerState.lastRunAt,
        },
      },
    });
  }
});

async function triggerManualSchedulerRun(limit, waitForCompletion = false) {
  if (schedulerState.manualRun.inProgress) {
    return {
      statusCode: 409,
      payload: {
        status: "Busy",
        message: "A manual scheduler test cycle is already running.",
        requested_limit_per_category: limit,
        manual_run: schedulerState.manualRun,
      },
    };
  }

  const executeManualRun = async () => {
    const sharedLocked = await withIngestionWorkerLock("main:manual", async () => {
      const locked = await withDatabaseLock(MAIN_SCHEDULER_LOCK_NAME, async () => {
        const cycleLogId = await createSchedulerRunLog({
          schedulerName: "main",
          runType: "cycle",
          triggerSource: "manual",
          requestedLimit: limit,
          message: "Starting manual scheduler test cycle.",
        });

        schedulerState.manualRun = {
          ...schedulerState.manualRun,
          inProgress: true,
          lastStartedAt: new Date().toISOString(),
          lastFinishedAt: null,
          lastRequestedLimit: limit,
          lastResult: null,
          lastError: null,
        };

        try {
          const results = await runSchedulerTestCycle(limit, { triggerSource: "manual" });
          const savedCount = results.reduce((sum, item) => sum + item.saved_count, 0);
          const skippedCount = results.reduce((sum, item) => sum + item.skipped_count, 0);
          const failedCount = results.reduce((sum, item) => sum + item.failed_count, 0);

          await finalizeSchedulerRunLog(cycleLogId, {
            status: failedCount > 0 ? "CompletedWithErrors" : savedCount > 0 ? "Success" : "Skipped",
            savedCount,
            skippedCount,
            failedCount,
            message: "Manual scheduler test cycle finished.",
            details: results,
          });

          schedulerState.manualRun = {
            ...schedulerState.manualRun,
            inProgress: false,
            lastFinishedAt: new Date().toISOString(),
            lastResult: {
              requested_limit_per_category: limit,
              saved_count: savedCount,
              skipped_count: skippedCount,
              failed_count: failedCount,
              results,
            },
            lastError: null,
          };

          return schedulerState.manualRun.lastResult;
        } catch (error) {
          schedulerState.manualRun = {
            ...schedulerState.manualRun,
            inProgress: false,
            lastFinishedAt: new Date().toISOString(),
            lastResult: null,
            lastError: error.message,
          };

          await finalizeSchedulerRunLog(cycleLogId, {
            status: "Error",
            failedCount: 1,
            message: "Manual scheduler test cycle failed.",
            errorMessage: error.message,
          });

          throw error;
        }
      });

      if (!locked.acquired) {
        return {
          busy: true,
          requested_limit_per_category: limit,
          message: "Another backend instance is already running the main scheduler cycle.",
        };
      }

      return locked.result;
    });

    if (!sharedLocked.acquired) {
      return {
        busy: true,
        requested_limit_per_category: limit,
        message: "Another cron worker is already running.",
      };
    }

    return sharedLocked.result;
  };

  if (waitForCompletion) {
    const result = await executeManualRun();
    if (result?.busy) {
      return {
        statusCode: 409,
        payload: {
          status: "Busy",
          ...result,
        },
      };
    }
    return {
      statusCode: 200,
      payload: {
        status: "Success",
        message: "Scheduler test cycle executed immediately.",
        ...result,
      },
    };
  }

  void executeManualRun().catch((error) => {
    console.error("Manual scheduler run failed:", error.message);
  });

  return {
    statusCode: 202,
    payload: {
      status: "Accepted",
      message: "Manual scheduler test cycle started in the background.",
      requested_limit_per_category: limit,
      manual_run: schedulerState.manualRun,
    },
  };
}

const apiV1 = express.Router();

app.use("/api/mpinfo", createMpInfoRoutes({
  saveArticle: saveMpInfoScraperArticle,
  rewriteArticle: rewriteSavedNewsRecord,
}));

apiV1.use(applyApiCors);

apiV1.get("/docs", (req, res) => {
  return sendApiSuccess(res, buildApiDocs());
});

apiV1.get("/openapi.json", (req, res) => {
  return res.json(buildOpenApiSpec(req));
});

apiV1.get("/swagger", (req, res) => {
  const specUrl = `${API_BASE_PATH}/openapi.json`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gautam News Bot API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      html { box-sizing: border-box; overflow-y: scroll; }
      *, *:before, *:after { box-sizing: inherit; }
      body { margin: 0; background: #101828; }
      .topbar { display: none; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '${specUrl}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout'
      });
    </script>
  </body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
});

apiV1.get("/health", async (req, res) => {
  const mainSchedulerHealthy = !schedulerState.enabled
    || !isTimestampStale(schedulerState.lastTickAt, SCHEDULER_HEALTH_THRESHOLD_MS);
  const aiSchedulerHealthy = !aiSchedulerState.enabled
    || !isTimestampStale(aiSchedulerState.lastTickAt, AI_SCHEDULER_HEALTH_THRESHOLD_MS);

  try {
    const [rows] = await dbPool.query("SELECT 1 AS ok");
    const dbHealthy = rows[0]?.ok === 1;
    const healthy = dbHealthy && mainSchedulerHealthy && aiSchedulerHealthy && !processState.shuttingDown;

    return sendApiSuccess(
      res,
      {
        process: {
          started_at: processState.startedAt,
          shutting_down: processState.shuttingDown,
          uptime_seconds: Math.floor(process.uptime()),
          pid: process.pid,
          last_uncaught_exception: processState.lastUncaughtException,
          last_unhandled_rejection: processState.lastUnhandledRejection,
        },
        database: {
          healthy: dbHealthy,
          name: DB_NAME,
        },
        schedulers: {
          main: {
            enabled: schedulerState.enabled,
            healthy: mainSchedulerHealthy,
            last_tick_at: schedulerState.lastTickAt,
            last_run_at: schedulerState.lastRunAt,
          },
          ai: {
            enabled: aiSchedulerState.enabled,
            healthy: aiSchedulerHealthy,
            last_tick_at: aiSchedulerState.lastTickAt,
            last_run_at: aiSchedulerState.lastRunAt,
          },
        },
      },
      {},
      healthy ? 200 : 503
    );
  } catch (error) {
    return sendApiError(res, "HEALTH_CHECK_FAILED", error.message, 503);
  }
});

apiV1.use(enforceApiKey);
apiV1.use(enforceApiRateLimit);
apiV1.use(enforceClientQuota);
apiV1.use(attachApiUsageLogger);

apiV1.get("/rss-feeds", requireApiScope("feeds:read"), (req, res) => {
  return getCachedRssFeedsPayload()
    .then((payload) => sendApiSuccess(res, {
      count: payload.count,
      final_categories: payload.final_categories,
      feeds: payload.feeds,
      source_category_catalog: payload.source_category_catalog,
      expensive_source_throttle: payload.expensive_source_throttle,
      category_feed_pools: payload.category_feed_pools,
    }))
    .catch((error) => sendApiError(res, "RSS_FEEDS_FAILED", error.message, 500));
});

apiV1.get("/categories", requireApiScope("feeds:read"), (req, res) => {
  return getCachedCategoryCatalogPayload()
    .then((payload) => sendApiSuccess(res, payload, {
      category_count: payload.final_categories.length,
      source_category_count: payload.source_categories.length,
    }))
    .catch((error) => sendApiError(res, "CATEGORY_CATALOG_FAILED", error.message, 500));
});

apiV1.get("/news", requireApiScope("news:read"), async (req, res) => {
  try {
    const category = req.query.category ? normalizeCategory(req.query.category) : null;
    const limit = normalizeApiLimit(req.query.limit, 100, 500);
    const records = await listNewsRecords({ category, limit });
    return sendApiSuccess(res, records, { database: DB_NAME, count: records.length, category, limit });
  } catch (error) {
    return sendApiError(res, "NEWS_LIST_FAILED", error.message, 500);
  }
});

apiV1.get("/news/grouped", requireApiScope("news:read"), async (req, res) => {
  try {
    const limit = normalizeApiLimit(req.query.limit, 500, 1000);
    const payload = await getCachedGroupedNewsPayload(limit);
    return sendApiSuccess(res, payload.grouped_records, {
      database: payload.database || DB_NAME,
      category_count: payload.category_count,
      count: payload.count,
      limit,
    });
  } catch (error) {
    return sendApiError(res, "NEWS_GROUP_FAILED", error.message, 500);
  }
});

apiV1.get("/delivery/news", requireApiScope("delivery:read"), async (req, res) => {
  try {
    const category = req.query.category ? normalizeCategory(req.query.category) : null;
    const language = normalizeDeliveryLanguage(req.query.language);
    const limit = normalizeApiLimit(req.query.limit, 50, 200);
    const records = (await listDeliveredAiRewrites(dbPool, { category, language, limit: Math.min(limit * 3, 200) }))
      .filter(isFreshDeliveryRecord)
      .slice(0, limit);
    return sendApiSuccess(res, records, { count: records.length, category, language, limit });
  } catch (error) {
    return sendApiError(res, "DELIVERY_LIST_FAILED", error.message, 500);
  }
});

apiV1.get("/delivery/news/grouped", requireApiScope("delivery:read"), async (req, res) => {
  try {
    const language = normalizeDeliveryLanguage(req.query.language);
    const limit = normalizeApiLimit(req.query.limit, 100, 500);
    const records = (await listDeliveredAiRewrites(dbPool, { language, limit: Math.min(limit * 3, 500) }))
      .filter(isFreshDeliveryRecord)
      .slice(0, limit);
    const grouped = groupDeliveryRecordsByCategory(records);
    return sendApiSuccess(res, grouped, {
      category_count: grouped.length,
      count: records.length,
      language,
      limit,
    });
  } catch (error) {
    return sendApiError(res, "DELIVERY_GROUPED_FAILED", error.message, 500);
  }
});

apiV1.get("/delivery/news/:idOrSlug", requireApiScope("delivery:read"), async (req, res) => {
  try {
    const language = normalizeDeliveryLanguage(req.query.language);
    const record = await findDeliveredAiRewrite(dbPool, req.params.idOrSlug, { language });
    if (!record) {
      return sendApiError(res, "NOT_FOUND", "Published AI article not found.", 404);
    }

    return sendApiSuccess(res, record, { language });
  } catch (error) {
    return sendApiError(res, "DELIVERY_ITEM_FAILED", error.message, 500);
  }
});

apiV1.get("/delivery/feed", requireApiScope("delivery:read"), async (req, res) => {
  try {
    const category = req.query.category ? normalizeCategory(req.query.category) : null;
    const language = normalizeDeliveryLanguage(req.query.language);
    const limit = normalizeApiLimit(req.query.limit, 24, 200);
    const grouped = req.query.grouped === undefined ? true : isTruthyQueryValue(req.query.grouped);
    const feed = await buildCronAwareDeliveryFeed({ category, language, limit, grouped });
    return sendApiSuccess(res, feed, {
      category,
      language,
      limit,
      grouped,
      count: feed.count,
    });
  } catch (error) {
    return sendApiError(res, "DELIVERY_FEED_FAILED", error.message, 500);
  }
});

apiV1.get("/ai/news", requireApiScope("ai:read"), async (req, res) => {
  try {
    const category = req.query.category ? normalizeCategory(req.query.category) : null;
    const limit = normalizeApiLimit(req.query.limit, 100, 200);
    const records = await listAiRewrites(dbPool, { category, limit });
    return sendApiSuccess(res, records, { count: records.length, category, limit });
  } catch (error) {
    return sendApiError(res, "AI_NEWS_LIST_FAILED", error.message, 500);
  }
});

apiV1.get("/ai/news/grouped", requireApiScope("ai:read"), async (req, res) => {
  try {
    const limit = normalizeApiLimit(req.query.limit, 100, 200);
    const rewrites = await listAiRewrites(dbPool, { limit });
    const grouped = Object.entries(
      rewrites.reduce((accumulator, item) => {
      const key = normalizeCategory(item.ui_hindi?.category || item.news?.category || DEFAULT_CATEGORY);
        if (!accumulator[key]) {
          accumulator[key] = [];
        }
        accumulator[key].push({
          ...item,
          news: item.news ? { ...item.news, category: key } : item.news,
          ui_hindi: item.ui_hindi ? { ...item.ui_hindi, category: key } : item.ui_hindi,
        });
        return accumulator;
      }, {})
    ).map(([category, records]) => ({
      category,
      count: records.length,
      records,
    }));

    return sendApiSuccess(res, grouped, {
      database: DB_NAME,
      category_count: grouped.length,
      count: rewrites.length,
      limit,
    });
  } catch (error) {
    return sendApiError(res, "AI_NEWS_GROUP_FAILED", error.message, 500);
  }
});

apiV1.get("/cron/status", requireApiScope("cron:read"), (req, res) => {
  return getCachedCronStatusPayload()
    .then((payload) => sendApiSuccess(res, payload.scheduler))
    .catch((error) => sendApiError(res, "CRON_STATUS_FAILED", error.message, 500));
});

apiV1.post("/cron/run-now", requireApiScope("cron:write"), async (req, res) => {
  try {
    const limit = normalizeArticleLimit(req.query.limit || req.body?.limit || 1);
    const waitForCompletion = String(req.query.wait || req.body?.wait || "").toLowerCase() === "true";
    const result = await triggerManualSchedulerRun(limit, waitForCompletion);
    return sendApiSuccess(res, result.payload, {}, result.statusCode);
  } catch (error) {
    return sendApiError(res, "CRON_RUN_FAILED", error.message, 500);
  }
});

apiV1.get("/ai/cron/status", requireApiScope("cron:read"), (req, res) => {
  return sendApiSuccess(res, aiSchedulerState);
});

apiV1.post("/ai/cron/run-now", requireApiScope("ai:write"), async (req, res) => {
  try {
    if (await isIngestionWorkerBusy()) {
      aiSchedulerState.lastStatus = "Busy";
      aiSchedulerState.lastError = "Waiting for ingestion cron to finish.";
      return sendApiError(res, "AI_CRON_BUSY", "An ingestion cron is already running. Try again after it finishes.", 409);
    }

    const locked = await runAiScheduledCycleWithLock("manual");
    if (!locked.acquired) {
      return sendApiError(res, "AI_CRON_BUSY", "Another backend instance is already running the AI scheduler cycle.", 409);
    }

    const results = locked.result;
    return sendApiSuccess(res, results, {
      success_count: results.filter((item) => item.status === "Success").length,
      skipped_count: results.filter((item) => item.status === "Skipped").length,
      failed_count: results.filter((item) => item.status === "Error").length,
    });
  } catch (error) {
    return sendApiError(res, "AI_CRON_RUN_FAILED", error.message, 500);
  }
});

apiV1.get("/scheduler/logs", requireApiScope("logs:read"), async (req, res) => {
  try {
    const schedulerName = typeof req.query.scheduler === "string" ? req.query.scheduler : null;
    const payload = await getCachedSchedulerLogsPayload({ schedulerName, limit: req.query.limit });
    return sendApiSuccess(res, payload.records, { count: payload.count, scheduler: schedulerName });
  } catch (error) {
    return sendApiError(res, "SCHEDULER_LOGS_FAILED", error.message, 500);
  }
});

apiV1.post("/sync/cliff-news", requireApiScope("sync:write"), async (req, res) => {
  const category = req.query.category || req.body?.category
    ? normalizeCategory(req.query.category || req.body?.category)
    : null;
  const limit = normalizeApiLimit(req.query.limit || req.body?.limit, CLIFF_NEWS_DEFAULT_LIMIT, 500);
  const page = normalizeCliffNewsPage(req.query.page || req.body?.page || 1);
  const language = String(req.query.language || req.body?.language || CLIFF_NEWS_LANGUAGE).trim().toUpperCase();
  const rewrite = !["false", "0", "no"].includes(
    String(req.query.rewrite ?? req.body?.rewrite ?? "true").toLowerCase()
  );
  const includeExisting = ["true", "1", "yes"].includes(
    String(req.query.include_existing ?? req.body?.include_existing ?? "").toLowerCase()
  );

  try {
    const result = await saveCliffNewsArticles({
      category,
      limit,
      language,
      includeExisting,
      page,
    });
    const rewriteResults = await rewriteNewsRecords(result.rewriteCandidates, { enabled: rewrite });
    const { rewriteCandidates: _rewriteCandidates, ...publicResult } = result;

    return sendApiSuccess(res, {
      ...publicResult,
      ai_rewrite_enabled: rewrite,
      ai_success_count: rewriteResults.filter((item) => item.status === "Success").length,
      ai_failed_count: rewriteResults.filter((item) => item.status === "Error").length,
      ai_results: rewriteResults,
    }, {
      category,
      limit,
      page,
      language,
      rewrite,
      saved_count: result.saved_count,
      existing_count: result.existing_count,
      output_sizes: {
        words_100: "ui_hindi.short_100",
        words_300: "ui_hindi.medium_300",
        words_600: "ui_hindi.long_500",
      },
    });
  } catch (error) {
    return sendApiError(res, "CLIFF_NEWS_SYNC_FAILED", error.message, 500, {
      category,
      limit,
      language,
      rewrite,
    });
  }
});

apiV1.post("/sync/rss", requireApiScope("sync:write"), async (req, res) => {
  const category = normalizeCategory(req.query.category || req.body?.category || DEFAULT_CATEGORY);
  const limit = normalizeArticleLimit(req.query.limit || req.body?.limit || 5);

  const { browser, page } = await createBrowserPage();
  try {
    const result = await fetchPrimaryNewsForCategory(page, category, limit);
    return sendApiSuccess(res, result, { category, limit });
  } catch (error) {
    return sendApiError(res, "RSS_SYNC_FAILED", error.message, 500, { category, limit });
  } finally {
    await browser.close();
  }
});

apiV1.post("/sync/rss/all", requireApiScope("sync:write"), async (req, res) => {
  const total = req.query.total || req.body?.total ? normalizeTotalLimit(req.query.total || req.body?.total) : null;
  const limit = normalizeArticleLimit(req.query.limit || req.body?.limit || 5);

  const { browser, page } = await createBrowserPage();
  try {
    const result = total
      ? await fetchAllCategoriesByTotal(page, total)
      : await fetchAllCategories(page, limit);
    return sendApiSuccess(res, result, { total, limit: total ? null : limit });
  } catch (error) {
    return sendApiError(res, "RSS_SYNC_ALL_FAILED", error.message, 500, { total, limit });
  } finally {
    await browser.close();
  }
});

apiV1.post("/sync/sources-ai", requireApiScope("sync:write"), async (req, res) => {
  const category = normalizeCategory(req.query.category || req.body?.category || DEFAULT_CATEGORY);
  const limit = Math.min(normalizeArticleLimit(req.query.limit || req.body?.limit || 2), 20);
  const sources = req.query.sources || req.body?.sources || "all";
  const rewrite = !["false", "0", "no"].includes(
    String(req.query.rewrite ?? req.body?.rewrite ?? "true").toLowerCase()
  );
  const includeExisting = ["true", "1", "yes"].includes(
    String(req.query.include_existing ?? req.body?.include_existing ?? "").toLowerCase()
  );
  const googleQuery = req.query.google_query || req.body?.google_query || null;

  try {
    const result = await syncSourcesAndAi({
      category,
      limit,
      sources,
      rewrite,
      includeExisting,
      googleQuery,
    });

    return sendApiSuccess(res, result, {
      category,
      limit,
      sources: result.sources,
      rewrite,
      output_sizes: {
        words_100: "ui_hindi.short_100",
        words_300: "ui_hindi.medium_300",
        words_600: "ui_hindi.long_500",
      },
    });
  } catch (error) {
    return sendApiError(res, "SOURCES_AI_SYNC_FAILED", error.message, 500, {
      category,
      limit,
      sources,
      rewrite,
    });
  }
});

apiV1.post("/sync/primary-sources", requireApiScope("sync:write"), async (req, res) => {
  const category = normalizeCategory(req.query.category || req.body?.category || DEFAULT_CATEGORY);
  const limit = Math.min(normalizePrimarySourceLimit(req.query.limit || req.body?.limit || 2), 5);
  const sources = req.query.sources || req.body?.sources || "all";
  const rewrite = !["false", "0", "no"].includes(
    String(req.query.rewrite ?? req.body?.rewrite ?? "true").toLowerCase()
  );
  const includeExisting = ["true", "1", "yes"].includes(
    String(req.query.include_existing ?? req.body?.include_existing ?? "").toLowerCase()
  );
  const googleQuery = req.query.google_query || req.body?.google_query || null;

  try {
    const result = await syncPrimarySourcesAndAi({
      category,
      limit,
      sources,
      rewrite,
      includeExisting,
      googleQuery,
    });

    return sendApiSuccess(res, result, {
      category,
      limit_per_source: limit,
      sources: result.sources,
      rewrite,
      output_sizes: {
        words_100: "ui_hindi.short_100",
        words_300: "ui_hindi.medium_300",
        words_600: "ui_hindi.long_500",
      },
    });
  } catch (error) {
    return sendApiError(res, "PRIMARY_SOURCE_SYNC_FAILED", error.message, 500, {
      category,
      limit_per_source: limit,
      sources,
      rewrite,
    });
  }
});

apiV1.get("/editorial/grouped", requireApiScope("news:read"), async (req, res) => {
  try {
    const limit = normalizeApiLimit(req.query.limit, 15, 50);
    const records = await listEditorials(dbPool, { limit });
    return sendApiSuccess(res, [
      {
        category: "editorial",
        count: records.length,
        daily_limit: EDITORIAL_DAILY_LIMIT,
        records,
      },
    ], {
      count: records.length,
      category_count: records.length ? 1 : 0,
      limit,
      daily_limit: EDITORIAL_DAILY_LIMIT,
    });
  } catch (error) {
    return sendApiError(res, "EDITORIAL_GROUP_FAILED", error.message, 500);
  }
});

apiV1.post("/sync/editorial", requireApiScope("sync:write"), async (req, res) => {
  try {
    const limit = normalizeApiLimit(req.query.limit || req.body?.limit, EDITORIAL_DAILY_LIMIT, EDITORIAL_DAILY_LIMIT);
    const force = isTruthyQueryValue(req.query.force || req.body?.force);
    const result = await syncEditorials(dbPool, { limit, force });
    return sendApiSuccess(res, result, {
      daily_limit: EDITORIAL_DAILY_LIMIT,
      saved_count: result.saved_count || 0,
      skipped_count: result.skipped_count || 0,
      failed_count: result.failed_count || 0,
    });
  } catch (error) {
    return sendApiError(res, "EDITORIAL_SYNC_FAILED", error.message, 500);
  }
});

apiV1.get("/rashifal/grouped", requireApiScope("news:read"), async (req, res) => {
  try {
    const limit = normalizeApiLimit(req.query.limit, 50, 100);
    const records = await listRashifal(dbPool, { limit });
    return sendApiSuccess(res, [
      {
        category: "rashifal",
        count: records.length,
        records,
      },
    ], {
      count: records.length,
      category_count: records.length ? 1 : 0,
      limit,
    });
  } catch (error) {
    return sendApiError(res, "RASHIFAL_GROUP_FAILED", error.message, 500);
  }
});

apiV1.post("/sync/rashifal", requireApiScope("sync:write"), async (req, res) => {
  try {
    const limit = normalizeApiLimit(req.query.limit || req.body?.limit, 50, 100);
    const force = isTruthyQueryValue(req.query.force || req.body?.force);
    const result = await syncRashifal(dbPool, { limit, force });
    return sendApiSuccess(res, result, {
      saved_count: result.saved_count || 0,
      skipped_count: result.skipped_count || 0,
      failed_count: result.failed_count || 0,
    });
  } catch (error) {
    return sendApiError(res, "RASHIFAL_SYNC_FAILED", error.message, 500);
  }
});

apiV1.post("/sync/mpinfo", requireApiScope("sync:write"), async (req, res) => {
  const category = normalizeCategory(req.query.category || req.body?.category || DEFAULT_CATEGORY);
  const limit = normalizeArticleLimit(req.query.limit || req.body?.limit || 5);
  const mpInfoFeed = { source: "mpinfo", url: "https://mpinfo.org/RSSFeed/RSSFeed_News.xml" };
  const { browser, page } = await createBrowserPage();

  try {
    const articleEntries = await getArticleUrlsFromFeeds([mpInfoFeed], limit);
    const results = [];

    for (const articleEntry of articleEntries) {
      try {
        const imageData = await extractBestImageFromArticle(page, articleEntry.url);
        const metadataImage = sanitizeArticleImageUrl(imageData.featuredImage);
        const featuredImage = metadataImage || null;
        const imageSource = metadataImage ? imageData.imageSource || "article-image" : null;
        const title = imageData.title || articleEntry.title || articleEntry.url;

        const recordId = await saveNewsRecord({
          category,
          feedSource: articleEntry.feed_source,
          feedUrl: articleEntry.feed_url,
          query: category,
          title,
          articleUrl: articleEntry.url,
          imageLink: featuredImage,
          imageSource,
        });

        results.push({
          status: "Success",
          saved_id: recordId,
          category,
          feed_source: articleEntry.feed_source,
          feed_url: articleEntry.feed_url,
          source: articleEntry.url,
          title,
          image_link: featuredImage,
          image_source: imageSource,
        });
      } catch (articleError) {
        results.push({
          status: "Error",
          category,
          feed_source: articleEntry.feed_source,
          feed_url: articleEntry.feed_url,
          source: articleEntry.url,
          message: articleError.message,
        });
      }
    }

    return sendApiSuccess(res, results, {
      category,
      limit,
      fetched_count: articleEntries.length,
      saved_count: results.filter((item) => item.status === "Success").length,
      failed_count: results.filter((item) => item.status === "Error").length,
    });
  } catch (error) {
    return sendApiError(res, "MPINFO_SYNC_FAILED", error.message, 500, { category, limit });
  } finally {
    await browser.close();
  }
});

apiV1.post("/sync/mpinfo-districts", requireApiScope("sync:write"), async (req, res) => {
  try {
    const result = await runMpInfoDistrictScheduledCycle("manual");
    return sendApiSuccess(res, result, {
      saved_count: result.saved_count || 0,
      existing_count: result.existing_count || 0,
      failed_count: result.failed_district_count || 0,
      rewrite_success_count: result.rewrite_success_count || 0,
    });
  } catch (error) {
    return sendApiError(res, "MPINFO_DISTRICT_SYNC_FAILED", error.message, 500);
  }
});

apiV1.get("/admin/clients", requireMasterApiKey, async (req, res) => {
  try {
    const clients = await listApiClients();
    return sendApiSuccess(res, clients, { count: clients.length });
  } catch (error) {
    return sendApiError(res, "CLIENT_LIST_FAILED", error.message, 500);
  }
});

apiV1.post("/admin/clients", requireMasterApiKey, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) {
      return sendApiError(res, "VALIDATION_ERROR", "Client name is required.", 400);
    }

    const allowedScopes = normalizeScopesList(req.body?.allowed_scopes || []);
    if (!allowedScopes.length) {
      return sendApiError(res, "VALIDATION_ERROR", "At least one valid allowed_scopes value is required.", 400, {
        available_scopes: AVAILABLE_API_SCOPES,
      });
    }

    const created = await createApiClient({
      name,
      allowedOrigins: req.body?.allowed_origins || [],
      allowedScopes,
      quotaLimit: req.body?.quota_limit,
      quotaWindow: req.body?.quota_window,
      notes: req.body?.notes || "",
    });

    await createAdminAuditLog(req, "client.create", "api_client", created.client.id, {
      name: created.client.name,
      allowed_origins: created.client.allowed_origins,
      allowed_scopes: created.client.allowed_scopes,
      quota_limit: created.client.quota_limit,
      quota_window: created.client.quota_window,
    });

    return sendApiSuccess(res, created, { created: true }, 201);
  } catch (error) {
    return sendApiError(res, "CLIENT_CREATE_FAILED", error.message, 500);
  }
});

apiV1.patch("/admin/clients/:clientId", requireMasterApiKey, async (req, res) => {
  try {
    const clientId = Number.parseInt(req.params.clientId, 10);
    if (Number.isNaN(clientId) || clientId < 1) {
      return sendApiError(res, "VALIDATION_ERROR", "A valid clientId is required.", 400);
    }

    const updated = await updateApiClient(clientId, req.body || {});
    if (!updated) {
      return sendApiError(res, "NOT_FOUND", "Client not found.", 404);
    }

    await createAdminAuditLog(req, "client.update", "api_client", clientId, req.body || {});

    return sendApiSuccess(res, updated, { updated: true });
  } catch (error) {
    return sendApiError(res, "CLIENT_UPDATE_FAILED", error.message, 500);
  }
});

apiV1.post("/admin/clients/:clientId/rotate-key", requireMasterApiKey, async (req, res) => {
  try {
    const clientId = Number.parseInt(req.params.clientId, 10);
    if (Number.isNaN(clientId) || clientId < 1) {
      return sendApiError(res, "VALIDATION_ERROR", "A valid clientId is required.", 400);
    }

    const rotated = await rotateApiClientKey(clientId);
    if (!rotated) {
      return sendApiError(res, "NOT_FOUND", "Client not found.", 404);
    }

    await createAdminAuditLog(req, "client.rotate_key", "api_client", clientId, {
      client_name: rotated.client.name,
    });

    return sendApiSuccess(res, rotated, { rotated: true });
  } catch (error) {
    return sendApiError(res, "CLIENT_ROTATE_FAILED", error.message, 500);
  }
});

apiV1.get("/admin/ai/rewrites", requireMasterApiKey, async (req, res) => {
  try {
    const category = req.query.category ? normalizeCategory(req.query.category) : null;
    const publicationStatus = typeof req.query.status === "string" ? String(req.query.status).trim().toLowerCase() : null;
    const normalizedStatus = ["draft", "published"].includes(publicationStatus) ? publicationStatus : null;
    const limit = normalizeApiLimit(req.query.limit, 100, 200);
    const records = await listAiRewrites(dbPool, { category, limit, publicationStatus: normalizedStatus });
    return sendApiSuccess(res, records, {
      count: records.length,
      category,
      status: normalizedStatus,
      limit,
    });
  } catch (error) {
    return sendApiError(res, "ADMIN_AI_REWRITES_FAILED", error.message, 500);
  }
});

apiV1.post("/admin/ai/rewrites/:rewriteId/publish", requireMasterApiKey, async (req, res) => {
  try {
    const rewriteId = Number.parseInt(req.params.rewriteId, 10);
    if (Number.isNaN(rewriteId) || rewriteId < 1) {
      return sendApiError(res, "VALIDATION_ERROR", "A valid rewriteId is required.", 400);
    }

    const updated = await setAiRewritePublicationStatus(dbPool, rewriteId, {
      status: "published",
      publishedBy: req.apiAuth?.client?.name || "master",
    });

    if (!updated) {
      return sendApiError(res, "NOT_FOUND", "AI rewrite not found.", 404);
    }

    await createAdminAuditLog(req, "ai_rewrite.publish", "ai_rewrite", rewriteId, {
      slug: updated.publication?.slug || null,
      category: updated.news?.category || null,
      news_id: updated.news_id,
    });

    return sendApiSuccess(res, updated, { published: true });
  } catch (error) {
    return sendApiError(res, "AI_REWRITE_PUBLISH_FAILED", error.message, 500);
  }
});

apiV1.post("/admin/ai/rewrites/:rewriteId/unpublish", requireMasterApiKey, async (req, res) => {
  try {
    const rewriteId = Number.parseInt(req.params.rewriteId, 10);
    if (Number.isNaN(rewriteId) || rewriteId < 1) {
      return sendApiError(res, "VALIDATION_ERROR", "A valid rewriteId is required.", 400);
    }

    const updated = await setAiRewritePublicationStatus(dbPool, rewriteId, {
      status: "draft",
      publishedBy: req.apiAuth?.client?.name || "master",
    });

    if (!updated) {
      return sendApiError(res, "NOT_FOUND", "AI rewrite not found.", 404);
    }

    await createAdminAuditLog(req, "ai_rewrite.unpublish", "ai_rewrite", rewriteId, {
      slug: updated.publication?.slug || null,
      category: updated.news?.category || null,
      news_id: updated.news_id,
    });

    return sendApiSuccess(res, updated, { published: false });
  } catch (error) {
    return sendApiError(res, "AI_REWRITE_UNPUBLISH_FAILED", error.message, 500);
  }
});

apiV1.get("/admin/usage", requireMasterApiKey, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit, 10) || 100, 500));
    const [rows] = await dbPool.query(
      `
        SELECT id, client_id, client_name, auth_type, method, path, origin, ip_address, status_code, created_at
        FROM api_usage_logs
        ORDER BY id DESC
        LIMIT ?
      `,
      [limit]
    );

    return sendApiSuccess(res, rows, { count: rows.length, limit });
  } catch (error) {
    return sendApiError(res, "USAGE_LOGS_FAILED", error.message, 500);
  }
});

apiV1.get("/admin/audit-logs", requireMasterApiKey, async (req, res) => {
  try {
    const logs = await listAdminAuditLogs(req.query.limit);
    return sendApiSuccess(res, logs, { count: logs.length });
  } catch (error) {
    return sendApiError(res, "AUDIT_LOGS_FAILED", error.message, 500);
  }
});

app.use(API_BASE_PATH, apiV1);

if (LEGACY_PUBLIC_ROUTES_ENABLED) {
  app.post("/cron/run-now", async (req, res) => {
    const limit = normalizeArticleLimit(req.query.limit || 1);
    const waitForCompletion = String(req.query.wait || "").toLowerCase() === "true";

    try {
      const result = await triggerManualSchedulerRun(limit, waitForCompletion);
      return res.status(result.statusCode).json(result.payload);
    } catch (error) {
      res.status(500).json({
        status: "Error",
        message: error.message,
      });
    }
  });

  app.post("/ai/cron/run-now", async (req, res) => {
    try {
      if (await isIngestionWorkerBusy()) {
        aiSchedulerState.lastStatus = "Busy";
        aiSchedulerState.lastError = "Waiting for ingestion cron to finish.";
        return res.status(409).json({
          status: "Busy",
          message: "An ingestion cron is already running. Try again after it finishes.",
        });
      }

      const locked = await runAiScheduledCycleWithLock("manual");
      if (!locked.acquired) {
        return res.status(409).json({
          status: "Busy",
          message: "Another backend instance is already running the AI scheduler cycle.",
        });
      }

      const results = locked.result;
      res.json({
        status: "Success",
        message: "AI rewrite scheduler cycle executed immediately.",
        success_count: results.filter((item) => item.status === "Success").length,
        skipped_count: results.filter((item) => item.status === "Skipped").length,
        failed_count: results.filter((item) => item.status === "Error").length,
        results,
      });
    } catch (error) {
      res.status(500).json({
        status: "Error",
        message: error.message,
      });
    }
  });

  registerAiRewriteRoutes(app, {
    getDbPool: () => dbPool,
    createBrowserPage,
    normalizeCategory,
    afterRewriteSaved: () => runRetentionCleanupCycle("manual-ai-rewrite-save"),
  });

  app.get("/news", async (req, res) => {
    try {
      const category = req.query.category ? normalizeCategory(req.query.category) : null;
      const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit, 10) || 100, 500));
      const queryText = category
        ? `
          SELECT id, category, search_query, title, source_url, image_link, image_source, fetched_at
          , feed_source, feed_url, source_excerpt, source_published_at
          FROM fetched_news
          WHERE category = ?
          ORDER BY id DESC
          LIMIT ?
        `
        : `
          SELECT id, category, search_query, title, source_url, image_link, image_source, fetched_at
          , feed_source, feed_url, source_excerpt, source_published_at
          FROM fetched_news
          ORDER BY id DESC
          LIMIT ?
        `;

      const [rows] = await dbPool.query(
        queryText,
        category ? [category, limit] : [limit]
      );

      res.json({
        status: "Success",
        database: DB_NAME,
        category,
        count: rows.length,
        message:
          rows.length === 0
            ? "No records saved yet. Call /fetch-news first, and a row will be inserted only when a direct image URL is successfully extracted."
            : "Saved news records loaded successfully.",
        records: rows,
      });
    } catch (error) {
      res.status(500).json({
        status: "Error",
        message: error.message,
      });
    }
  });

  app.get("/news/grouped", async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit, 10) || 500, 1000));
      const payload = await getCachedGroupedNewsPayload(limit);
      res.json(payload);
    } catch (error) {
      res.status(500).json({
        status: "Error",
        message: error.message,
      });
    }
  });
} else {
  console.log("Legacy public routes are disabled. Use only /api/v1/* endpoints.");
}

app.get("/image-proxy", async (req, res) => {
  const imageUrl = typeof req.query.url === "string" ? req.query.url : "";
  const imageQualityMode = typeof req.query.quality === "string" ? req.query.quality.toLowerCase() : "";

  if (!imageUrl) {
    return res.status(400).json({
      status: "Error",
      message: "Query parameter 'url' is required.",
    });
  }

  if (!isAllowedImageHost(imageUrl)) {
    return res.status(400).json({
      status: "Error",
      message: "Image host is not allowed.",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_PROXY_TIMEOUT_MS);

  try {
    const upstream = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: new URL(imageUrl).origin,
      },
      signal: controller.signal,
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        status: "Error",
        message: `Upstream image request failed with status ${upstream.status}.`,
      });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (imageQualityMode === "original") {
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      return res.send(Buffer.from(arrayBuffer));
    }

    const highQuality = imageQualityMode === "high";
    const originalBuffer = Buffer.from(arrayBuffer);
    let optimizedImage;
    try {
      optimizedImage = await optimizeImageBuffer(
        originalBuffer,
        contentType,
        req.headers.accept,
        highQuality
          ? {
              highQuality: true,
              maxWidth: IMAGE_PROXY_HIGH_MAX_WIDTH,
              webpQuality: IMAGE_PROXY_HIGH_WEBP_QUALITY,
              jpegQuality: IMAGE_PROXY_HIGH_JPEG_QUALITY,
            }
          : {}
      );
    } catch (optimizationError) {
      console.warn(`Image optimization failed for ${imageUrl}: ${optimizationError.message}`);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      return res.send(originalBuffer);
    }

    res.setHeader("Content-Type", optimizedImage.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    return res.send(optimizedImage.buffer);
  } catch (error) {
    if (error?.name === "AbortError") {
      return res.status(504).json({
        status: "Error",
        message: "Upstream image request timed out.",
      });
    }

    return res.status(500).json({
      status: "Error",
      message: error.message,
    });
  } finally {
    clearTimeout(timeout);
  }
});

validateProductionConfig();

initializeDatabase()
  .then(async () => {
    await initializeMpInfoDistrictSchedulerCursor();
    startScheduler();
    startAiScheduler();
    startMpInfoDistrictScheduler();
    startRetentionCleanupScheduler();
    startSchedulerWatchdog();
    serverInstance = app.listen(PORT, () => {
      console.log(`Gautam Tech Studio Bot running at http://localhost:${PORT}`);
      console.log(
        `Try it: http://localhost:${PORT}/fetch-news?q=${encodeURIComponent(DEFAULT_CATEGORY)}&limit=5`
      );
      console.log(
        `Category URL example: http://localhost:${PORT}/fetch-news/category/${encodeURIComponent(DEFAULT_CATEGORY)}?limit=5`
      );
      console.log(
        `All categories: http://localhost:${PORT}/fetch-news/all?limit=5`
      );
      console.log(
        `RSS category feed: http://localhost:${PORT}/fetch-rss-news?category=${encodeURIComponent(DEFAULT_CATEGORY)}&limit=5`
      );
      console.log(
        `All RSS feeds: http://localhost:${PORT}/fetch-rss-news/all?limit=5`
      );
      console.log(
        `Fetch 200 distributed stories: http://localhost:${PORT}/fetch-rss-news/all?total=200`
      );
      console.log(
        `Test MP Info feed: http://localhost:${PORT}/fetch-mpinfo-news?category=${encodeURIComponent(DEFAULT_CATEGORY)}&limit=5`
      );
      console.log(
        `Feed list: http://localhost:${PORT}/rss-feeds`
      );
      console.log(
        `Cron status: http://localhost:${PORT}/cron/status`
      );
      console.log(
        `AI news grouped: http://localhost:${PORT}/ai/news/grouped?limit=100`
      );
      console.log(
        `AI cron status: http://localhost:${PORT}/ai/cron/status`
      );
      console.log(
        `AI rewrite one story: POST http://localhost:${PORT}/ai/rewrite/123`
      );
      console.log(
        `AI rewrite latest stories: POST http://localhost:${PORT}/ai/rewrite-latest?limit=3`
      );
      console.log(
        `AI cron run now: POST http://localhost:${PORT}/ai/cron/run-now`
      );
      console.log(`Saved records: http://localhost:${PORT}/news`);
      console.log(`Health: http://localhost:${PORT}/health`);
      console.log(`Reusable API docs: http://localhost:${PORT}${API_BASE_PATH}/docs`);
      console.log(`Reusable API health: http://localhost:${PORT}${API_BASE_PATH}/health`);
      console.log(`Reusable OpenAPI spec: http://localhost:${PORT}${API_BASE_PATH}/openapi.json`);
      console.log(`Reusable Swagger UI: http://localhost:${PORT}${API_BASE_PATH}/swagger`);
      console.log(
        `MySQL: host=${DB_HOST} port=${DB_PORT} user=${DB_USER} database=${DB_NAME}`
      );
      console.log(
        `Schedulers: main=${schedulerState.enabled ? "enabled" : "disabled"} ai=${aiSchedulerState.enabled ? "enabled" : "disabled"} mpinfo-districts=${mpInfoDistrictSchedulerState.enabled ? "enabled" : "disabled"}`
      );
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database:", error.message);
    process.exit(1);
  });

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("uncaughtException", (error) => {
  processState.lastUncaughtException = {
    message: error.message,
    at: new Date().toISOString(),
  };
  console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (reason) => {
  processState.lastUnhandledRejection = {
    message: reason instanceof Error ? reason.message : String(reason),
    at: new Date().toISOString(),
  };
  console.error("Unhandled rejection:", reason);
});

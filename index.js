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
const IMAGE_PROXY_WEBP_QUALITY = Math.max(40, Math.min(Number.parseInt(process.env.IMAGE_PROXY_WEBP_QUALITY || "72", 10) || 72, 90));
const IMAGE_PROXY_JPEG_QUALITY = Math.max(40, Math.min(Number.parseInt(process.env.IMAGE_PROXY_JPEG_QUALITY || "74", 10) || 74, 90));
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
const ARTICLE_CANDIDATE_MULTIPLIER = Math.max(2, Number.parseInt(process.env.ARTICLE_CANDIDATE_MULTIPLIER, 10) || 4);
const ARTICLE_CANDIDATE_CAP = Math.max(8, Number.parseInt(process.env.ARTICLE_CANDIDATE_CAP, 10) || 24);
const FEED_QUEUE_MULTIPLIER = Math.max(2, Number.parseInt(process.env.FEED_QUEUE_MULTIPLIER, 10) || 2);
const FEED_QUEUE_CAP = Math.max(6, Number.parseInt(process.env.FEED_QUEUE_CAP, 10) || 18);
const API_RATE_LIMIT_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60_000);
const API_RATE_LIMIT_MAX = Number(process.env.API_RATE_LIMIT_MAX || 120);
const MAIN_SCHEDULER_LOCK_NAME = `${DB_NAME}:main-scheduler`;
const AI_SCHEDULER_LOCK_NAME = `${DB_NAME}:ai-scheduler`;
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
const DEFAULT_CATEGORY = "india";
const INDIA_TIMEZONE = "Asia/Kolkata";
const NEWS18_RSS_BASE = "https://www.news18.com/commonfeeds/v1/eng/rss";
const RSS_FEEDS = {
  india: [
    { source: "zee", url: "https://zeenews.india.com/rss/india-national-news.xml" },
    { source: "news18", url: `${NEWS18_RSS_BASE}/india.xml` },
    { source: "dd", url: "https://ddnews.gov.in/en/category/national/feed/" },
    { source: "mpinfo", url: "https://mpinfo.org/RSSFeed/RSSFeed_News.xml" },
  ],
  world: [
    { source: "zee", url: "https://zeenews.india.com/rss/world-news.xml" },
    { source: "news18", url: `${NEWS18_RSS_BASE}/world.xml` },
    { source: "dd", url: "https://ddnews.gov.in/en/category/international/feed/" },
  ],
  states: [
    { source: "zee", url: "https://zeenews.india.com/rss/india-news.xml" },
    { source: "news18", url: `${NEWS18_RSS_BASE}/politics.xml` },
    { source: "mpinfo", url: "https://mpinfo.org/RSSFeed/RSSFeed_News.xml" },
  ],
  asia: [
    { source: "zee", url: "https://zeenews.india.com/rss/asia-news.xml" },
    { source: "news18", url: `${NEWS18_RSS_BASE}/world.xml` },
  ],
  business: [
    { source: "zee", url: "https://zeenews.india.com/rss/business.xml" },
    { source: "news18", url: `${NEWS18_RSS_BASE}/business.xml` },
    { source: "dd", url: "https://ddnews.gov.in/en/category/business-economy/feed/" },
  ],
  sports: [
    { source: "zee", url: "https://zeenews.india.com/rss/sports-news.xml" },
    { source: "news18", url: `${NEWS18_RSS_BASE}/sports.xml` },
    { source: "news18", url: `${NEWS18_RSS_BASE}/cricket.xml` },
    { source: "news18", url: `${NEWS18_RSS_BASE}/football.xml` },
    { source: "dd", url: "https://ddnews.gov.in/en/category/sports/feed/" },
  ],
  science_environment: [
    { source: "zee", url: "https://zeenews.india.com/rss/science-environment-news.xml" },
    { source: "news18", url: `${NEWS18_RSS_BASE}/tech.xml` },
    { source: "news18", url: `${NEWS18_RSS_BASE}/explainers.xml` },
    { source: "dd", url: "https://ddnews.gov.in/en/category/science-tech/feed/" },
    { source: "dd", url: "https://ddnews.gov.in/en/category/environment/feed/" },
  ],
  entertainment: [
    { source: "zee", url: "https://zeenews.india.com/rss/entertainment-news.xml" },
    { source: "news18", url: `${NEWS18_RSS_BASE}/entertainment.xml` },
    { source: "news18", url: `${NEWS18_RSS_BASE}/movies.xml` },
    { source: "news18", url: `${NEWS18_RSS_BASE}/viral.xml` },
  ],
  health: [
    { source: "zee", url: "https://zeenews.india.com/rss/health-news.xml" },
    { source: "news18", url: `${NEWS18_RSS_BASE}/lifestyle.xml` },
    { source: "dd", url: "https://ddnews.gov.in/en/category/health/feed/" },
  ],
  blogs: [
    { source: "zee", url: "https://zeenews.india.com/rss/blog-news.xml" },
    { source: "news18", url: `${NEWS18_RSS_BASE}/opinion.xml` },
    { source: "news18", url: `${NEWS18_RSS_BASE}/explainers.xml` },
    { source: "dd", url: "https://ddnews.gov.in/en/category/opinion/feed/" },
  ],
  technology: [
    { source: "zee", url: "https://zeenews.india.com/rss/technology-news.xml" },
    { source: "news18", url: `${NEWS18_RSS_BASE}/tech.xml` },
    { source: "news18", url: `${NEWS18_RSS_BASE}/auto.xml` },
    { source: "dd", url: "https://ddnews.gov.in/en/category/science-tech/feed/" },
  ],
  education: [
    { source: "zee", url: "https://zeenews.india.com/rss/education-news.xml" },
    { source: "news18", url: `${NEWS18_RSS_BASE}/education-career.xml` },
    { source: "dd", url: "https://ddnews.gov.in/en/category/education/feed/" },
  ],
  top_stories: [
    { source: "zee", url: "https://zeenews.india.com/rss/india-national-news.xml" },
    { source: "news18", url: `${NEWS18_RSS_BASE}/india.xml` },
    { source: "news18", url: `${NEWS18_RSS_BASE}/politics.xml` },
    { source: "dd", url: "https://ddnews.gov.in/en/category/top-stories/feed/" },
    { source: "mpinfo", url: "https://mpinfo.org/RSSFeed/RSSFeed_News.xml" },
  ],
};
const CATEGORY_FEED_GROUPS = {
  india: ["top_stories", "states"],
  world: ["top_stories", "india"],
  states: ["india", "top_stories"],
  asia: ["world", "top_stories"],
  business: ["top_stories", "india"],
  sports: ["top_stories", "india"],
  science_environment: ["technology", "top_stories"],
  entertainment: ["top_stories", "india"],
  health: ["top_stories", "india"],
  blogs: ["top_stories", "india"],
  technology: ["science_environment", "top_stories"],
  education: ["india", "top_stories"],
  top_stories: ["india", "states"],
};
const DELIVERY_CATEGORY_ORDER = [
  "top_stories",
  "india",
  "world",
  "states",
  "asia",
  "business",
  "sports",
  "technology",
  "science_environment",
  "health",
  "entertainment",
  "education",
  "blogs",
];
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
const ZEE_SECTION_FALLBACKS = {
  india: "https://zeenews.india.com/india",
  world: "https://zeenews.india.com/world",
  states: "https://zeenews.india.com/india",
  asia: "https://zeenews.india.com/world",
  business: "https://zeenews.india.com/business",
  sports: "https://zeenews.india.com/sports",
  science_environment: "https://zeenews.india.com/science",
  entertainment: "https://zeenews.india.com/entertainment",
  health: "https://zeenews.india.com/health",
  blogs: "https://zeenews.india.com/blogs",
  technology: "https://zeenews.india.com/technology",
  education: "https://zeenews.india.com/education",
  top_stories: "https://zeenews.india.com/",
};

let dbPool;
const DEFAULT_ARTICLE_LIMIT = 5;
const MAX_ARTICLE_LIMIT = 500;
const DEFAULT_TOTAL_LIMIT = 200;
const MAX_TOTAL_LIMIT = 5000;
const QUIET_HOUR_START = 0;
const QUIET_HOUR_END = 5;
const SCHEDULER_TICK_MS = 30 * 1000;
const AI_SCHEDULER_TICK_MS = 30 * 1000;
const SCHEDULER_HEALTH_THRESHOLD_MS = 2 * SCHEDULER_TICK_MS + 15 * 1000;
const AI_SCHEDULER_HEALTH_THRESHOLD_MS = 2 * AI_SCHEDULER_TICK_MS + 15 * 1000;
const WATCHDOG_TICK_MS = 60 * 1000;
const apiRateLimitStore = new Map();
const quotaStore = new Map();

let schedulerInterval = null;
let schedulerRunning = false;
let aiSchedulerInterval = null;
let aiSchedulerRunning = false;
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
  categories: {},
};
const aiSchedulerState = {
  enabled: AI_SCHEDULER_ENABLED,
  lastTickAt: null,
  lastRunAt: null,
  lastWindowKey: null,
  frequency_minutes: 15,
  categories: {},
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
        image_link TEXT,
        image_source VARCHAR(100),
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
        image_link TEXT,
        image_source VARCHAR(100),
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

  await initializeAiRewriteStorage(dbPool);

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
}) {
  if (!dbPool) {
    throw new Error("Database pool is not initialized.");
  }

  const [result] = await dbPool.execute(
    dbPool.dialect === "postgres"
      ? `
          INSERT INTO fetched_news (category, feed_source, feed_url, search_query, title, source_url, image_link, image_source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (source_url) DO NOTHING
          RETURNING id
        `
      : `
          INSERT INTO fetched_news (category, feed_source, feed_url, search_query, title, source_url, image_link, image_source)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?
          FROM DUAL
          WHERE NOT EXISTS (
            SELECT 1
            FROM fetched_news
            WHERE source_url = ?
          )
        `,
    dbPool.dialect === "postgres"
      ? [category, feedSource, feedUrl, query, title, articleUrl, imageLink, imageSource]
      : [category, feedSource, feedUrl, query, title, articleUrl, imageLink, imageSource, articleUrl]
  );

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

  const [rows] = await dbPool.execute(
    `
      SELECT id, category, source_url, fetched_at
      FROM fetched_news
      WHERE source_url = ?
      LIMIT 1
    `,
    [articleUrl]
  );

  return rows[0] || null;
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
  return withJsonCache("cache:rss-feeds", RSS_FEED_CACHE_TTL_SECONDS, async () => ({
    status: "Success",
    source: "Configured RSS feeds",
    count: Object.keys(RSS_FEEDS).length,
    feeds: RSS_FEEDS,
    category_feed_pools: Object.fromEntries(
      Object.keys(RSS_FEEDS).map((category) => [
        category,
        {
          direct_feeds: RSS_FEEDS[category],
          related_categories: CATEGORY_FEED_GROUPS[category] || [],
          combined_feed_pool: getCategoryFeedPool(category),
        },
      ])
    ),
  }));
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
  return withJsonCache("cache:cron:status", STATUS_CACHE_TTL_SECONDS, async () => ({
    status: "Success",
    scheduler: {
      enabled: schedulerState.enabled,
      timezone: INDIA_TIMEZONE,
      tick_ms: SCHEDULER_TICK_MS,
      quiet_hours: schedulerState.quietHours,
      last_tick_at: schedulerState.lastTickAt,
      last_run_at: schedulerState.lastRunAt,
      last_window_key: schedulerState.lastWindowKey,
      manual_run: schedulerState.manualRun,
      categories: schedulerState.categories,
      schedule: schedulerState.schedule || getCategorySchedule(),
      retention_cleanup: getRetentionCleanupHealthSnapshot(),
    },
  }));
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
      { method: "POST", path: `${API_BASE_PATH}/sync/rss`, description: "Fetch RSS stories for one category." },
      { method: "POST", path: `${API_BASE_PATH}/sync/rss/all`, description: "Fetch RSS stories for all categories." },
      { method: "POST", path: `${API_BASE_PATH}/sync/mpinfo`, description: "Fetch MP Info stories." },
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
    category: "entertainment",
    search_query: "entertainment",
    title: "Sample entertainment headline",
    source_url: "https://example.com/story",
    image_link: "https://example.com/image.jpg",
    image_source: "og:image",
    fetched_at: "2026-04-04T16:46:26.000Z",
    feed_source: "zee",
    feed_url: "https://example.com/rss.xml",
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
    category: "entertainment",
    publication_status: "published",
    published_at: "2026-04-04T18:00:00.000Z",
    updated_at: "2026-04-04T18:00:00.000Z",
    news_id: 44,
    language: "english",
    source: {
      title: "Sample source title",
      url: "https://example.com/story",
      feed_source: "zee",
      feed_url: "https://example.com/rss.xml",
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
          { name: "category", in: "query", schema: { type: "string", default: "states" } },
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
            category: { type: "string", example: "entertainment" },
            search_query: { type: "string", example: "entertainment" },
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
            category: { type: "string", example: "entertainment" },
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

    if (auth.type === "master") {
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
      const key = record.category || "uncategorized";
      if (!accumulator[key]) {
        accumulator[key] = [];
      }

      accumulator[key].push(record);
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

async function buildCronAwareDeliveryFeed({ category = null, language = "both", limit = 24, grouped = true } = {}) {
  const records = await listDeliveredAiRewrites(dbPool, { category, language, limit });
  const categories = category
    ? [category]
    : Array.from(new Set(records.map((record) => record.category).filter(Boolean))).sort(compareCategories);

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
      FROM fetched_news
      WHERE category = ?
      ORDER BY id DESC
      LIMIT ?
    `
    : `
      SELECT id, category, search_query, title, source_url, image_link, image_source, fetched_at, feed_source, feed_url
      FROM fetched_news
      ORDER BY id DESC
      LIMIT ?
    `;

  const [rows] = await dbPool.query(queryText, category ? [category, limit] : [limit]);
  return rows;
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
  if (typeof value !== "string") {
    return DEFAULT_CATEGORY;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized || DEFAULT_CATEGORY;
}

function normalizeDeliveryLanguage(value) {
  const normalized = String(value || "both").trim().toLowerCase();
  return ["english", "hindi", "both"].includes(normalized) ? normalized : "both";
}

function getCategoryDisplayName(category) {
  const normalized = String(category || "uncategorized").trim().toLowerCase();
  const aliases = {
    top_stories: "Top Stories",
    science_environment: "Science & Environment",
  };

  if (aliases[normalized]) {
    return aliases[normalized];
  }

  return normalized
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
  return indiaNow.hour >= QUIET_HOUR_START && indiaNow.hour < QUIET_HOUR_END;
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
      const key = record.category || "uncategorized";
      if (!accumulator[key]) {
        accumulator[key] = [];
      }

      accumulator[key].push(record);
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
    try {
      response = await fetch(url, {
        headers: {
          ...profile,
          Accept: acceptHeader,
        },
      });
      if (response.ok) {
        break;
      }

      lastStatus = response.status;
      lastError = new Error(`RSS feed request failed with status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  return {
    response,
    lastError,
    lastStatus,
  };
}

function getFallbackSectionUrl(feedConfig, category) {
  if (feedConfig.source === "zee") {
    return ZEE_SECTION_FALLBACKS[category] || "https://zeenews.india.com/";
  }

  if (feedConfig.source === "news18") {
    try {
      const parsed = new URL(feedConfig.url);
      const slug = parsed.pathname.split("/").pop()?.replace(/\.xml$/i, "").trim();
      if (slug) {
        return `https://www.news18.com/${slug}/`;
      }
    } catch {
      return null;
    }
  }

  return null;
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

function isLikelyArticleUrl(feedConfig, candidateUrl) {
  try {
    const parsed = new URL(candidateUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (feedConfig.source === "news18") {
      return (
        ["news18.com", "www.news18.com"].includes(hostname) &&
        pathname.endsWith(".html") &&
        !pathname.startsWith("/amp/") &&
        !pathname.includes("/page-") &&
        !pathname.startsWith("/commonfeeds/")
      );
    }

    if (feedConfig.source === "zee") {
      return (
        ["zeenews.india.com", "www.zeenews.india.com"].includes(hostname) &&
        pathname.endsWith(".html") &&
        /\-\d+\.html$/i.test(pathname) &&
        !pathname.startsWith("/tags/") &&
        !pathname.startsWith("/photos/") &&
        !pathname.startsWith("/video/")
      );
    }

    return candidateUrl.startsWith("http");
  } catch {
    return false;
  }
}

function getNews18SectionKeywords(feedConfig) {
  try {
    const parsed = new URL(feedConfig.url);
    const slug = parsed.pathname.split("/").pop()?.replace(/\.xml$/i, "").trim().toLowerCase();
    const aliases = {
      "education-career": ["education-career", "education-and-career"],
      entertainment: ["entertainment"],
      movies: ["movies", "bollywood"],
      viral: ["viral"],
      sports: ["sports"],
      cricket: ["cricket"],
      football: ["football"],
      tech: ["tech"],
      explainers: ["explainers", "explainer"],
      business: ["business", "markets"],
      lifestyle: ["lifestyle"],
      opinion: ["opinion"],
      auto: ["auto"],
      politics: ["politics"],
      india: ["india"],
      world: ["world"],
    };

    return aliases[slug] || (slug ? [slug] : []);
  } catch {
    return [];
  }
}

function createSectionUrlPredicate(feedConfig, sectionUrl) {
  const sectionHref = String(sectionUrl || "").replace(/\/+$/, "");

  if (feedConfig.source === "zee") {
    return (candidateUrl) => {
      try {
        const parsed = new URL(candidateUrl);
        const hostname = parsed.hostname.toLowerCase();
        const pathname = parsed.pathname.toLowerCase();

        return (
          ["zeenews.india.com", "www.zeenews.india.com"].includes(hostname) &&
          !pathname.startsWith("/rss/") &&
          pathname !== "/" &&
          pathname.split("/").filter(Boolean).length >= 2 &&
          !/\.(xml|jpg|jpeg|png|webp|gif|svg)$/i.test(pathname) &&
          isLikelyArticleUrl(feedConfig, candidateUrl) &&
          candidateUrl.replace(/\/+$/, "") !== sectionHref
        );
      } catch {
        return false;
      }
    };
  }

  if (feedConfig.source === "news18") {
    const sectionKeywords = getNews18SectionKeywords(feedConfig);
    return (candidateUrl) => {
      try {
        const parsed = new URL(candidateUrl);
        const hostname = parsed.hostname.toLowerCase();
        const pathname = parsed.pathname.toLowerCase();
        const matchesSection = sectionKeywords.some((keyword) => {
          return pathname.includes(`/${keyword}/`) || pathname.includes(`/photogallery/${keyword}/`);
        });

        return (
          ["news18.com", "www.news18.com"].includes(hostname) &&
          !pathname.startsWith("/commonfeeds/") &&
          pathname !== "/" &&
          pathname.split("/").filter(Boolean).length >= 2 &&
          !/\.(xml|jpg|jpeg|png|webp|gif|svg)$/i.test(pathname) &&
          matchesSection &&
          isLikelyArticleUrl(feedConfig, candidateUrl) &&
          candidateUrl.replace(/\/+$/, "") !== sectionHref
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

  const { response, lastError, lastStatus } = await fetchTextWithProfiles(
    sectionUrl,
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  );

  if (!response || !response.ok) {
    if (lastStatus === 403) {
      return [];
    }

    throw lastError || new Error("Section fallback request failed.");
  }

  const html = await response.text();
  return extractArticleUrlsFromHtml(
    html,
    sectionUrl,
    createSectionUrlPredicate(feedConfig, sectionUrl),
    limit
  );
}

async function getArticleUrlsFromFeed(feedConfig, category, limit) {
  const { response, lastError, lastStatus } = await fetchTextWithProfiles(
    feedConfig.url,
    "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
  );

  if (!response || !response.ok) {
    const fallbackUrls = await getArticleUrlsFromSectionFallback(feedConfig, category, limit);
    if (fallbackUrls.length > 0) {
      console.log(
        `Using section fallback for ${feedConfig.source} (${category}) after RSS status ${lastStatus || "error"}.`
      );
      return fallbackUrls;
    }

    if (lastStatus === 403) {
      return [];
    }

    throw lastError || new Error("RSS feed request failed.");
  }

  const xml = await response.text();
  const itemMatches = Array.from(
    xml.matchAll(/<item\b[\s\S]*?<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/gi)
  );

  if (!itemMatches.length) {
    const fallbackUrls = await getArticleUrlsFromSectionFallback(feedConfig, category, limit);
    if (fallbackUrls.length > 0) {
      console.log(`Using section fallback for ${feedConfig.source} (${category}) because RSS had no items.`);
      return fallbackUrls;
    }

    throw new Error("No article links found in the RSS feed.");
  }

  const seen = new Set();
  const urls = [];

  for (const match of itemMatches) {
    const url = match[1].replace(/&amp;/g, "&").trim();

    if (!url || !url.startsWith("http") || seen.has(url)) {
      continue;
    }

    seen.add(url);
    urls.push(url);

    if (urls.length >= limit) {
      break;
    }
  }

  if (!urls.length) {
    const fallbackUrls = await getArticleUrlsFromSectionFallback(feedConfig, category, limit);
    if (fallbackUrls.length > 0) {
      console.log(`Using section fallback for ${feedConfig.source} (${category}) because RSS had no usable URLs.`);
      return fallbackUrls;
    }

    throw new Error("The RSS feed did not contain usable article URLs.");
  }

  return urls
    .map((match) =>
      match
        .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
        .trim()
    )
    .filter(Boolean);
}

async function getArticleUrlsFromFeeds(feedConfigs, limit, options = {}) {
  const startIndex = Number.isInteger(options.startIndex) ? options.startIndex : 0;
  const perFeedLimit = Math.min(
    Math.max(limit * FEED_QUEUE_MULTIPLIER, 5),
    FEED_QUEUE_CAP
  );
  const seen = new Set();
  const results = [];
  const feedQueueResults = await Promise.allSettled(
    feedConfigs.map(async (feedConfig) => ({
      feed_source: feedConfig.source,
      feed_url: feedConfig.url,
      urls: await getArticleUrlsFromFeed(feedConfig, options.category || DEFAULT_CATEGORY, perFeedLimit),
    }))
  );

  const feedQueues = feedQueueResults
    .map((result, index) => ({ result, feedConfig: feedConfigs[index] }))
    .flatMap(({ result, feedConfig }) => {
      if (result.status === "fulfilled") {
        if (!Array.isArray(result.value.urls) || result.value.urls.length === 0) {
          return [];
        }

        return [result.value];
      }

      console.warn(
        `Feed fetch failed for ${feedConfig.source} (${feedConfig.url}): ${result.reason?.message || "Unknown error"}`
      );
      return [];
    });

  if (!feedQueues.length) {
    throw new Error(`All feed requests failed for the selected category pool.`);
  }

  const orderedQueues = feedQueues.map((_, index) => feedQueues[(startIndex + index) % feedQueues.length]);

  let madeProgress = true;
  while (results.length < limit && madeProgress) {
    madeProgress = false;

    for (const queue of orderedQueues) {
      while (queue.urls.length > 0) {
        const url = queue.urls.shift();
        if (!url || seen.has(url)) {
          continue;
        }

        seen.add(url);
        results.push({
          url,
          feed_source: queue.feed_source,
          feed_url: queue.feed_url,
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

function getCategoryFeedPool(category) {
  const directFeeds = RSS_FEEDS[category] || [];
  const relatedCategories = CATEGORY_FEED_GROUPS[category] || [];
  const seenFeeds = new Set();
  const feedPool = [];

  for (const feed of directFeeds) {
    const key = `${feed.source}:${feed.url}`;
    if (!seenFeeds.has(key)) {
      seenFeeds.add(key);
      feedPool.push(feed);
    }
  }

  for (const relatedCategory of relatedCategories) {
    const relatedFeeds = RSS_FEEDS[relatedCategory] || [];
    for (const feed of relatedFeeds) {
      const key = `${feed.source}:${feed.url}`;
      if (!seenFeeds.has(key)) {
        seenFeeds.add(key);
        feedPool.push(feed);
      }
    }
  }

  return feedPool;
}

function isAllowedImageHost(value) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();

    const exactHosts = [
      "ddnews.gov.in",
      "www.ddnews.gov.in",
      "zeenews.india.com",
      "www.zeenews.india.com",
      "english.cdn.zeenews.com",
      "cdn.zeenews.com",
      "mpinfo.org",
      "www.mpinfo.org",
      "mpinfonew.org",
      "www.mpinfonew.org",
      "news18.com",
      "www.news18.com",
    ];

    if (exactHosts.includes(hostname)) {
      return true;
    }

    return hostname.endsWith(".news18.com") || hostname.endsWith(".zeenews.com");
  } catch {
    return false;
  }
}

function shouldBypassImageCompression(contentType) {
  const normalized = String(contentType || "").toLowerCase();
  return normalized.includes("image/gif") || normalized.includes("image/svg");
}

async function optimizeImageBuffer(buffer, contentType, acceptHeader) {
  if (shouldBypassImageCompression(contentType)) {
    return {
      buffer,
      contentType,
    };
  }

  const transformer = sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: IMAGE_PROXY_MAX_WIDTH,
      withoutEnlargement: true,
      fit: "inside",
    });

  const normalizedType = String(contentType || "").toLowerCase();
  const acceptsWebp = String(acceptHeader || "").toLowerCase().includes("image/webp");

  if (acceptsWebp) {
    return {
      buffer: await transformer.webp({
        quality: IMAGE_PROXY_WEBP_QUALITY,
        effort: 4,
      }).toBuffer(),
      contentType: "image/webp",
    };
  }

  if (normalizedType.includes("image/png")) {
    return {
      buffer: await transformer.png({
        compressionLevel: 9,
        palette: true,
        effort: 7,
      }).toBuffer(),
      contentType: "image/png",
    };
  }

  return {
    buffer: await transformer.jpeg({
      quality: IMAGE_PROXY_JPEG_QUALITY,
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

function isLikelyDecorativeImageUrl(value) {
  const normalized = String(value || "").toLowerCase();
  return (
    !normalized
    || normalized.includes("logo")
    || normalized.includes("icon")
    || normalized.includes("sprite")
    || normalized.includes("avatar")
    || normalized.includes("banner")
    || normalized.includes("ads")
    || normalized.includes("advert")
    || normalized.includes("youtube.svg")
    || normalized.includes("facebook")
    || normalized.includes("twitter")
    || normalized.includes("instagram")
    || normalized.includes("insta-feed")
    || normalized.includes("social")
    || normalized.includes("share")
    || normalized.includes("follow-us")
    || normalized.includes("feed")
    || normalized.includes("placeholder")
    || normalized.includes("default-image")
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
    /logo|icon|share|social|avatar|author|profile|button|emoji|thumbnail/.test(normalizedAlt)
    || /logo|icon|share|social|avatar|author|profile|button|widget|thumb|thumbnail|gallery/.test(normalizedClass)
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  if ((width > 0 && width < 240) || (height > 0 && height < 160)) {
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

  if (/insta|social|share|feed|icon|logo|author|avatar|thumb|thumbnail|youtube/.test(normalizedSrc)) {
    score -= 240;
  }

  return score;
}

function extractImageFromHtml(html, articleUrl) {
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
      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { href: absoluteUrl, score };
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
  const featuredImageRaw =
    extractMetaContentFromHtml(html, "og:image")
    || extractMetaContentFromHtml(html, "og:image:secure_url")
    || extractMetaContentFromHtml(html, "og:image:url")
    || extractMetaContentFromHtml(html, "twitter:image")
    || extractMetaContentFromHtml(html, "twitter:image:src")
    || extractLinkHrefFromHtml(html, "image_src")
    || extractImageFromHtml(html, articleUrl);

  let featuredImage = null;
  if (featuredImageRaw && !isLikelyDecorativeImageUrl(featuredImageRaw)) {
    try {
      featuredImage = new URL(featuredImageRaw, articleUrl).href;
    } catch {
      featuredImage = featuredImageRaw;
    }
  }

  return {
    title,
    featuredImage,
    imageSource: featuredImage
      ? (extractMetaContentFromHtml(html, "og:image")
        ? "og:image"
        : extractMetaContentFromHtml(html, "twitter:image")
          ? "twitter:image"
          : "html-image")
      : null,
  };
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

  const pageMetadata = await page.evaluate(() => {
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

    const ogImage = makeAbsolute(
      document.querySelector('meta[property="og:image"], meta[property="og:image:secure_url"], meta[property="og:image:url"]')?.content
    );
    if (ogImage) {
      return {
        title,
        featuredImage: ogImage,
        imageSource: "og:image",
      };
    }

    const twitterImage = makeAbsolute(
      document.querySelector('meta[name="twitter:image"], meta[name="twitter:image:src"]')?.content
    );
    if (twitterImage) {
      return {
        title,
        featuredImage: twitterImage,
        imageSource: "twitter:image",
      };
    }

    const linkImage = makeAbsolute(
      document.querySelector('link[rel="image_src"]')?.href || document.querySelector('link[rel="image_src"]')?.getAttribute("href")
    );
    if (linkImage) {
      return {
        title,
        featuredImage: linkImage,
        imageSource: "link[rel=image_src]",
      };
    }

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
            /logo|icon|sprite|avatar|youtube|insta|social|share|feed|placeholder|default-image/.test(normalizedSrc) ||
            /logo|icon|share|social|avatar|author|profile|button|thumbnail/.test(normalizedAlt) ||
            /logo|icon|share|social|avatar|author|profile|button|widget|thumbnail|gallery/.test(normalizedClass) ||
            img.width < 240 ||
            img.height < 160
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
      featuredImage: imageCandidates[0]?.src || null,
      imageSource: imageCandidates[0] ? "article-image" : null,
    };
  });

  if (pageMetadata?.featuredImage) {
    return pageMetadata;
  }

  return htmlMetadata || pageMetadata;
}

async function fetchArticlesForCategory(page, category, limit, options = {}) {
  const candidateLimit = Math.min(
    Math.max(limit * ARTICLE_CANDIDATE_MULTIPLIER, limit),
    ARTICLE_CANDIDATE_CAP
  );
  const feedConfigs = getCategoryFeedPool(category);
  if (!feedConfigs?.length) {
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
    if (successCount >= limit) {
      break;
    }

    const articleUrl = articleEntry.url;
    console.log(`Opening article for ${category} from ${articleEntry.feed_source}: ${articleUrl}`);

    try {
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

      const imageData = await extractBestImageFromArticle(page, articleUrl);
      if (!imageData.featuredImage) {
        results.push({
          status: "Skipped",
          category,
          feed_source: articleEntry.feed_source,
          feed_url: articleEntry.feed_url,
          source: articleUrl,
          title: imageData.title,
          message: "Skipped because the article did not contain a usable image.",
        });
        continue;
      }

      const recordId = await saveNewsRecord({
        category,
        feedSource: articleEntry.feed_source,
        feedUrl: articleEntry.feed_url,
        query: category,
        title: imageData.title,
        articleUrl,
        imageLink: imageData.featuredImage,
        imageSource: imageData.imageSource,
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
        title: imageData.title,
        image_link: imageData.featuredImage,
        image_source: imageData.imageSource,
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
      try {
        await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 5000 });
      } catch {
        // Ignore page reset failures while continuing the batch.
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

async function fetchAllCategories(page, limit) {
  const categories = Object.keys(RSS_FEEDS);
  const allResults = [];

  for (const category of categories) {
    const categoryResult = await fetchArticlesForCategory(page, category, limit);
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

    const categoryResult = await fetchArticlesForCategory(page, allocation.category, allocation.limit);
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
  const feedCount = RSS_FEEDS[category]?.length || 1;
  const currentCursor = schedulerState.categories[category]?.sourceCursor || 0;
  const triggerSource = options.triggerSource || "schedule";
  const windowKey = options.windowKey || null;
  const logId = await createSchedulerRunLog({
    schedulerName: "main",
    runType: "category",
    triggerSource,
    category,
    windowKey,
    requestedLimit: 1,
    message: `Fetching one story for ${category}.`,
  });
  const { browser, page } = await createBrowserPage();

  try {
    const result = await fetchArticlesForCategory(page, category, 1, {
      startIndex: currentCursor,
    });
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
    await browser.close();
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
    });

    const nowIso = new Date().toISOString();
    for (const category of categories) {
      const result = results.find((item) => item.category === category) || null;
      aiSchedulerState.categories[category] = {
        lastRunAt: nowIso,
        lastStatus: result?.status || "Skipped",
        newsId: result?.news_id || null,
        title: result?.title || null,
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
        requestedLimit: 1,
        title: item.title || null,
        message: `AI rewrite ${item.status.toLowerCase()} for ${item.category}.`,
      });

      await finalizeSchedulerRunLog(categoryLogId, {
        status: item.status,
        savedCount: item.status === "Success" ? 1 : 0,
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
      savedCount: results.filter((item) => item.status === "Success").length,
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
  const locked = await withDatabaseLock(AI_SCHEDULER_LOCK_NAME, async () => (
    runAiScheduledCycle(triggerSource)
  ));

  return locked;
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
    const { browser, page } = await createBrowserPage();

    try {
      const result = await fetchArticlesForCategory(page, slot.category, limit, {
        startIndex: schedulerState.categories[slot.category]?.sourceCursor || 0,
      });

      const feedCount = RSS_FEEDS[slot.category]?.length || 1;
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
    } finally {
      await browser.close();
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
          const feedCount = RSS_FEEDS[slot.category]?.length || 1;

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
            sourceCursor: ((categoryState.sourceCursor || 0) + 1) % feedCount,
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

function startSchedulerWatchdog() {
  if (schedulerWatchdogInterval) {
    return;
  }

  schedulerWatchdogInterval = setInterval(() => {
    if (!processState.shuttingDown) {
      if (schedulerState.enabled && !schedulerInterval) {
        console.warn("Scheduler watchdog restarted the main scheduler interval.");
        startScheduler();
      }

      if (aiSchedulerState.enabled && !aiSchedulerInterval) {
        console.warn("Scheduler watchdog restarted the AI scheduler interval.");
        startAiScheduler();
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
      const categoryResult = await fetchArticlesForCategory(page, query, limit);

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
      const categoryResult = await fetchArticlesForCategory(page, category, limit);

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
  console.log(`Fetching RSS feed | category: ${category} | limit: ${limit}`);

  const { browser, page } = await createBrowserPage();

  try {
    const categoryResult = await fetchArticlesForCategory(page, category, limit);

    res.json({
      status: categoryResult.saved_count > 0 ? "Success" : "Error",
      source: "RSS feeds",
      database: DB_NAME,
      category,
      feed_urls: RSS_FEEDS[category],
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
      ? `Fetching all RSS feeds | total distributed stories: ${total}`
      : `Fetching all RSS feeds | limit per category: ${limit}`
  );

  const { browser, page } = await createBrowserPage();

  try {
    const payload = total
      ? await fetchAllCategoriesByTotal(page, total)
      : await fetchAllCategories(page, limit);

    res.json({
      status: payload.saved_count > 0 ? "Success" : "Error",
      source: "RSS feeds",
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
  const category = normalizeCategory(req.query.category || "states");
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
        if (!imageData.featuredImage) {
          throw new Error(
            "The original article opened, but no direct image URL could be extracted from that page."
          );
        }

        const recordId = await saveNewsRecord({
          category,
          feedSource: articleEntry.feed_source,
          feedUrl: articleEntry.feed_url,
          query: category,
          title: imageData.title,
          articleUrl,
          imageLink: imageData.featuredImage,
          imageSource: imageData.imageSource,
        });

        results.push({
          status: "Success",
          saved_id: recordId,
          category,
          feed_source: articleEntry.feed_source,
          feed_url: articleEntry.feed_url,
          source: articleUrl,
          title: imageData.title,
          image_link: imageData.featuredImage,
          image_source: imageData.imageSource,
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
app.get("/fetch-zee-news", handleFetchRssNews);
app.get("/fetch-zee-news/all", handleFetchRssNewsAll);

app.get("/rss-feeds", (req, res) => {
  void getCachedRssFeedsPayload()
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
      feeds: payload.feeds,
      category_feed_pools: payload.category_feed_pools,
    }))
    .catch((error) => sendApiError(res, "RSS_FEEDS_FAILED", error.message, 500));
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
    const records = await listDeliveredAiRewrites(dbPool, { category, language, limit });
    return sendApiSuccess(res, records, { count: records.length, category, language, limit });
  } catch (error) {
    return sendApiError(res, "DELIVERY_LIST_FAILED", error.message, 500);
  }
});

apiV1.get("/delivery/news/grouped", requireApiScope("delivery:read"), async (req, res) => {
  try {
    const language = normalizeDeliveryLanguage(req.query.language);
    const limit = normalizeApiLimit(req.query.limit, 100, 300);
    const records = await listDeliveredAiRewrites(dbPool, { language, limit });
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
        const key = item.news?.category || "uncategorized";
        if (!accumulator[key]) {
          accumulator[key] = [];
        }
        accumulator[key].push(item);
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

apiV1.post("/sync/rss", requireApiScope("sync:write"), async (req, res) => {
  const category = normalizeCategory(req.query.category || req.body?.category || DEFAULT_CATEGORY);
  const limit = normalizeArticleLimit(req.query.limit || req.body?.limit || 5);
  const { browser, page } = await createBrowserPage();

  try {
    const result = await fetchArticlesForCategory(page, category, limit);
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

apiV1.post("/sync/mpinfo", requireApiScope("sync:write"), async (req, res) => {
  const category = normalizeCategory(req.query.category || req.body?.category || "states");
  const limit = normalizeArticleLimit(req.query.limit || req.body?.limit || 5);
  const mpInfoFeed = { source: "mpinfo", url: "https://mpinfo.org/RSSFeed/RSSFeed_News.xml" };
  const { browser, page } = await createBrowserPage();

  try {
    const articleEntries = await getArticleUrlsFromFeeds([mpInfoFeed], limit);
    const results = [];

    for (const articleEntry of articleEntries) {
      try {
        const imageData = await extractBestImageFromArticle(page, articleEntry.url);
        if (!imageData.featuredImage) {
          throw new Error("The original article opened, but no direct image URL could be extracted from that page.");
        }

        const recordId = await saveNewsRecord({
          category,
          feedSource: articleEntry.feed_source,
          feedUrl: articleEntry.feed_url,
          query: category,
          title: imageData.title,
          articleUrl: articleEntry.url,
          imageLink: imageData.featuredImage,
          imageSource: imageData.imageSource,
        });

        results.push({
          status: "Success",
          saved_id: recordId,
          category,
          feed_source: articleEntry.feed_source,
          feed_url: articleEntry.feed_url,
          source: articleEntry.url,
          title: imageData.title,
          image_link: imageData.featuredImage,
          image_source: imageData.imageSource,
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
  });

  app.get("/zee-feeds", (req, res) => {
    res.redirect(302, "/rss-feeds");
  });

  app.get("/news", async (req, res) => {
    try {
      const category = req.query.category ? normalizeCategory(req.query.category) : null;
      const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit, 10) || 100, 500));
      const queryText = category
        ? `
          SELECT id, category, search_query, title, source_url, image_link, image_source, fetched_at
          , feed_source, feed_url
          FROM fetched_news
          WHERE category = ?
          ORDER BY id DESC
          LIMIT ?
        `
        : `
          SELECT id, category, search_query, title, source_url, image_link, image_source, fetched_at
          , feed_source, feed_url
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

  try {
    const upstream = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: new URL(imageUrl).origin,
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        status: "Error",
        message: `Upstream image request failed with status ${upstream.status}.`,
      });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const optimizedImage = await optimizeImageBuffer(
      Buffer.from(arrayBuffer),
      contentType,
      req.headers.accept
    );

    res.setHeader("Content-Type", optimizedImage.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    return res.send(optimizedImage.buffer);
  } catch (error) {
    return res.status(500).json({
      status: "Error",
      message: error.message,
    });
  }
});

validateProductionConfig();

initializeDatabase()
  .then(() => {
    startScheduler();
    startAiScheduler();
    startRetentionCleanupScheduler();
    startSchedulerWatchdog();
    serverInstance = app.listen(PORT, () => {
      console.log(`Gautam Tech Studio Bot running at http://localhost:${PORT}`);
      console.log(
        `Try it: http://localhost:${PORT}/fetch-news?q=india&limit=5`
      );
      console.log(
        `Category URL example: http://localhost:${PORT}/fetch-news/category/india?limit=5`
      );
      console.log(
        `All categories: http://localhost:${PORT}/fetch-news/all?limit=5`
      );
      console.log(
        `RSS category feed: http://localhost:${PORT}/fetch-rss-news?category=india&limit=5`
      );
      console.log(
        `All RSS feeds: http://localhost:${PORT}/fetch-rss-news/all?limit=5`
      );
      console.log(
        `Fetch 200 distributed stories: http://localhost:${PORT}/fetch-rss-news/all?total=200`
      );
      console.log(
        `Test MP Info feed: http://localhost:${PORT}/fetch-mpinfo-news?category=states&limit=5`
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
        `Schedulers: main=${schedulerState.enabled ? "enabled" : "disabled"} ai=${aiSchedulerState.enabled ? "enabled" : "disabled"}`
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

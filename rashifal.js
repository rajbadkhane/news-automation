const RASHIFAL_RSS_URL = "https://www.astrosage.com/rssfeeds/feed.asp";
const DEFAULT_RASHIFAL_FEED_URL = "https://feeds.feedburner.com/dayhoroscope";
const RASHIFAL_MIN_SYNC_INTERVAL_MS = Math.max(
  10 * 60 * 1000,
  Number.parseInt(process.env.RASHIFAL_MIN_SYNC_INTERVAL_MS || String(60 * 60 * 1000), 10) || 60 * 60 * 1000
);

let lastRashifalSyncAt = 0;

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(itemXml, tagName) {
  const escapedTag = String(tagName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(itemXml || "").match(new RegExp(`<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function extractRssItems(xml, limit) {
  return Array.from(String(xml || "").matchAll(/<item\b[\s\S]*?<\/item>/gi))
    .map((match) => {
      const itemXml = match[0];
      return {
        title: extractTag(itemXml, "title"),
        source_url: extractTag(itemXml, "link"),
        description: extractTag(itemXml, "description"),
        published_at: extractTag(itemXml, "pubDate"),
      };
    })
    .filter((item) => item.title && item.source_url)
    .slice(0, limit);
}

async function fetchRssXml() {
  const response = await fetch(RASHIFAL_RSS_URL, {
    headers: {
      "User-Agent": "GautamNewsBot/1.0 (+responsible RSS fetch; contact site owner if needed)",
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "hi-IN,hi;q=0.9,en-IN;q=0.7",
      "Cache-Control": "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Rashifal RSS request failed with status ${response.status}.`);
  }

  const text = await response.text();
  if (/<item\b/i.test(text)) {
    return {
      feedUrl: RASHIFAL_RSS_URL,
      xml: text,
    };
  }

  const alternateMatch = text.match(/<link\b[^>]*type=["']application\/rss\+xml["'][^>]*href=["']([^"']+)["']/i)
    || text.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*type=["']application\/rss\+xml["']/i);
  const alternateUrl = alternateMatch?.[1]
    ? new URL(alternateMatch[1], RASHIFAL_RSS_URL).href
    : DEFAULT_RASHIFAL_FEED_URL;
  const rssResponse = await fetch(alternateUrl, {
    headers: {
      "User-Agent": "GautamNewsBot/1.0 (+responsible RSS fetch; contact site owner if needed)",
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "hi-IN,hi;q=0.9,en-IN;q=0.7",
      "Cache-Control": "no-cache",
    },
  });

  if (!rssResponse.ok) {
    throw new Error(`Rashifal alternate RSS request failed with status ${rssResponse.status}.`);
  }

  return {
    feedUrl: alternateUrl,
    xml: await rssResponse.text(),
  };
}

async function initializeRashifalStorage(dbPool) {
  if (dbPool.dialect === "postgres") {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS rashifal_articles (
        id BIGSERIAL PRIMARY KEY,
        source_url TEXT NOT NULL UNIQUE,
        title TEXT,
        description TEXT,
        source_name VARCHAR(100) NOT NULL DEFAULT 'astrosage-rashifal',
        published_at TEXT,
        fetched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } else {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS rashifal_articles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        source_url TEXT NOT NULL,
        title TEXT,
        description MEDIUMTEXT,
        source_name VARCHAR(100) NOT NULL DEFAULT 'astrosage-rashifal',
        published_at TEXT,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_rashifal_source_url (source_url(191))
      )
    `);
  }
}

async function listRashifal(dbPool, { limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 50, 100));
  const [rows] = await dbPool.query(
    `
      SELECT *
      FROM rashifal_articles
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `,
    [safeLimit]
  );

  return rows.map((row) => ({
    id: row.id,
    category: "rashifal",
    title: row.title,
    source_url: row.source_url,
    summary: row.description,
    article: row.description,
    source_name: row.source_name,
    published_at: row.published_at,
    fetched_at: row.fetched_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

async function syncRashifal(dbPool, { limit = 50, force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastRashifalSyncAt < RASHIFAL_MIN_SYNC_INTERVAL_MS) {
    return {
      status: "Skipped",
      message: "Rashifal RSS sync is throttled to avoid hitting the source too often.",
      saved_count: 0,
      skipped_count: 0,
      failed_count: 0,
    };
  }

  lastRashifalSyncAt = now;
  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 50, 100));
  const { feedUrl, xml } = await fetchRssXml();
  const items = extractRssItems(xml, safeLimit);
  const results = [];

  for (const item of items) {
    try {
      const [result] = await dbPool.execute(
        dbPool.dialect === "postgres"
          ? `
              INSERT INTO rashifal_articles (source_url, title, description, published_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT (source_url) DO NOTHING
              RETURNING id
            `
          : `
              INSERT IGNORE INTO rashifal_articles (source_url, title, description, published_at)
              VALUES (?, ?, ?, ?)
            `,
        [item.source_url, item.title, item.description, item.published_at]
      );

      const inserted = Number(result.affectedRows || result.rowCount || 0) > 0 || Boolean(result.rows?.[0]?.id);
      results.push({
        status: inserted ? "Success" : "Skipped",
        id: result.insertId || result.rows?.[0]?.id || null,
        source_url: item.source_url,
        title: item.title,
        message: inserted ? "Saved." : "Already saved.",
      });
    } catch (error) {
      results.push({ status: "Error", source_url: item.source_url, title: item.title, message: error.message });
    }
  }

  return {
    status: results.some((item) => item.status === "Success") ? "Success" : "Skipped",
    feed_url: feedUrl,
    requested: safeLimit,
    saved_count: results.filter((item) => item.status === "Success").length,
    skipped_count: results.filter((item) => item.status === "Skipped").length,
    failed_count: results.filter((item) => item.status === "Error").length,
    results,
  };
}

module.exports = {
  initializeRashifalStorage,
  listRashifal,
  syncRashifal,
};

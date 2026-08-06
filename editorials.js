const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const EDITORIAL_RSS_URL = "https://www.thehindu.com/opinion/editorial/feeder/default.rss";
const EDITORIAL_DAILY_LIMIT = Math.max(1, Number.parseInt(process.env.EDITORIAL_DAILY_LIMIT || "15", 10) || 15);
const EDITORIAL_MIN_SYNC_INTERVAL_MS = Math.max(
  10 * 60 * 1000,
  Number.parseInt(process.env.EDITORIAL_MIN_SYNC_INTERVAL_MS || String(45 * 60 * 1000), 10) || 45 * 60 * 1000
);

const EDITORIAL_PROMPT = `Act as a senior editorial writer with decades of experience at leading national and international newspapers, possessing deep academic expertise across politics, economics, international relations, public policy, and social issues.

Transform the given topic, brief, or raw inputs into a high-impact, publication-ready editorial article that reflects the intellectual depth, analytical rigor, and persuasive clarity of top-tier editorial pages.

STRICT OUTPUT REQUIREMENTS:
- Write the article in continuous flow without any section labels such as "Introduction", "Section 1", etc.
- Do NOT use any symbol like "—" anywhere in the article.
- The structure must feel natural, not visibly segmented by headings.
- Only the main heading should appear at the top.
- Everything else must be written as smooth, connected paragraphs.
- Total word count must be between 1600 and 2100 words, ideal range 1700 to 1900 words.
- Main heading length must be 10 to 18 words.
- Begin with a powerful hook, establish the editorial stance early, and explain why the issue is urgent now.
- Include strong argument development, background, historical context, realistic data, policy references, global comparisons, opposing viewpoints, rebuttal, policy implications, and societal impact.
- Maintain credibility and factual integrity. Do not fabricate unrealistic claims.
- Voice must be analytical, persuasive, authoritative, balanced, and intellectually honest.
- End with a memorable and impactful closing line.

Return only valid JSON:
{
  "title": "",
  "article": "",
  "summary": "",
  "keywords": []
}`;

let lastEditorialSyncAt = 0;

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

function cleanArticleText(value) {
  return String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

function parseJsonResponse(rawText) {
  const text = String(rawText || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1].trim() : text);
}

function countWords(value) {
  return String(value || "").split(/\s+/).filter(Boolean).length;
}

async function fetchText(url, accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8") {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "GautamNewsBot/1.0 (+responsible RSS fetch; contact site owner if needed)",
      Accept: accept,
      "Accept-Language": "en-IN,en;q=0.9",
      "Cache-Control": "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.text();
}

async function fetchArticleText(url, fallbackText) {
  try {
    const html = await fetchText(url);
    const mainMatch = html.match(/<article\b[\s\S]*?<\/article>/i);
    return cleanArticleText(mainMatch ? mainMatch[0] : html) || fallbackText;
  } catch {
    return fallbackText;
  }
}

async function generateEditorialRewrite(item, articleText) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const prompt = `${EDITORIAL_PROMPT}

RAW EDITORIAL INPUT
Title: ${item.title}
URL: ${item.source_url}
Brief: ${item.description || ""}
Raw article text: ${articleText || item.description || item.title}`;
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptPrompt = attempt === 0
      ? prompt
      : `${prompt}

The previous answer was too short. Rewrite again and ensure the article body alone is between 1600 and 2100 words, ideally 1700 to 1900 words.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: attemptPrompt }] }],
          generationConfig: {
            temperature: attempt === 0 ? 0.35 : 0.25,
            maxOutputTokens: 12000,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Gemini request failed with status ${response.status}.`);
    }

    const rawResponse = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";
    const parsed = parseJsonResponse(rawResponse);
    const article = String(parsed.article || "").replace(/[—–]/g, "-").trim();
    const wordCount = countWords(article);
    if (wordCount >= 1600 && wordCount <= 2100) {
      return {
        title: String(parsed.title || item.title).trim(),
        article,
        summary: String(parsed.summary || item.description || "").trim(),
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8) : [],
        raw_response: rawResponse,
      };
    }

    lastError = new Error(`Editorial word count ${wordCount} is outside the required 1600-2100 range.`);
  }

  throw lastError || new Error("Editorial generation failed validation.");
}

async function initializeEditorialStorage(dbPool) {
  if (dbPool.dialect === "postgres") {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS editorial_articles (
        id BIGSERIAL PRIMARY KEY,
        source_url TEXT NOT NULL UNIQUE,
        source_title TEXT,
        source_excerpt TEXT,
        title TEXT,
        article TEXT,
        summary TEXT,
        keywords_json TEXT,
        raw_response TEXT,
        source_name VARCHAR(100) NOT NULL DEFAULT 'the-hindu-editorial',
        fetched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } else {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS editorial_articles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        source_url TEXT NOT NULL,
        source_title TEXT,
        source_excerpt MEDIUMTEXT,
        title TEXT,
        article LONGTEXT,
        summary MEDIUMTEXT,
        keywords_json TEXT,
        raw_response LONGTEXT,
        source_name VARCHAR(100) NOT NULL DEFAULT 'the-hindu-editorial',
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_editorial_source_url (source_url(191))
      )
    `);
  }
}

async function countEditorialsToday(dbPool) {
  const [rows] = await dbPool.query(`
    SELECT COUNT(*) AS total
    FROM editorial_articles
    WHERE DATE(created_at) = CURRENT_DATE
  `);
  return Number(rows[0]?.total || 0);
}

async function listEditorials(dbPool, { limit = 15 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 15, 50));
  const [rows] = await dbPool.query(
    `
      SELECT *
      FROM editorial_articles
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `,
    [safeLimit]
  );

  return rows.map((row) => ({
    id: row.id,
    category: "editorial",
    title: row.title || row.source_title,
    source_url: row.source_url,
    summary: row.summary || row.source_excerpt,
    article: row.article || "",
    keywords: (() => {
      try {
        const parsed = JSON.parse(row.keywords_json || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })(),
    source_name: row.source_name,
    fetched_at: row.fetched_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

async function syncEditorials(dbPool, { limit = EDITORIAL_DAILY_LIMIT, force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastEditorialSyncAt < EDITORIAL_MIN_SYNC_INTERVAL_MS) {
    return {
      status: "Skipped",
      message: "Editorial RSS sync is throttled to avoid hitting the source too often.",
      saved_count: 0,
      skipped_count: 0,
      failed_count: 0,
    };
  }

  const alreadyToday = await countEditorialsToday(dbPool);
  const remainingToday = force ? EDITORIAL_DAILY_LIMIT : Math.max(0, EDITORIAL_DAILY_LIMIT - alreadyToday);
  if (remainingToday <= 0) {
    return {
      status: "Skipped",
      message: `Daily editorial limit reached (${EDITORIAL_DAILY_LIMIT}).`,
      saved_count: 0,
      skipped_count: 0,
      failed_count: 0,
      daily_limit: EDITORIAL_DAILY_LIMIT,
      already_today: alreadyToday,
    };
  }

  lastEditorialSyncAt = now;
  const requested = Math.min(Math.max(1, Number.parseInt(limit, 10) || remainingToday), remainingToday);
  const xml = await fetchText(EDITORIAL_RSS_URL, "application/rss+xml, application/xml, text/xml;q=0.9,*/*;q=0.8");
  const items = extractRssItems(xml, Math.max(requested * 10, requested + 10));
  const results = [];

  for (const item of items) {
    if (results.filter((result) => result.status === "Success").length >= requested) {
      break;
    }

    try {
      const [existingRows] = await dbPool.query("SELECT id FROM editorial_articles WHERE source_url = ? LIMIT 1", [item.source_url]);
      if (existingRows.length && !force) {
        results.push({ status: "Skipped", source_url: item.source_url, title: item.title, message: "Already saved." });
        continue;
      }

      const articleText = await fetchArticleText(item.source_url, item.description);
      const rewrite = await generateEditorialRewrite(item, articleText);
      let insertResult;
      if (existingRows.length && force) {
        [insertResult] = await dbPool.execute(
          `
            UPDATE editorial_articles
            SET source_title = ?, source_excerpt = ?, title = ?, article = ?, summary = ?, keywords_json = ?, raw_response = ?, updated_at = CURRENT_TIMESTAMP
            WHERE source_url = ?
          `,
          [
            item.title,
            articleText.slice(0, 4000),
            rewrite.title,
            rewrite.article,
            rewrite.summary,
            JSON.stringify(rewrite.keywords),
            rewrite.raw_response,
            item.source_url,
          ]
        );
      } else {
        [insertResult] = await dbPool.execute(
          dbPool.dialect === "postgres"
            ? `
              INSERT INTO editorial_articles (
                source_url, source_title, source_excerpt, title, article, summary, keywords_json, raw_response
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (source_url) DO NOTHING
              RETURNING id
            `
            : `
              INSERT IGNORE INTO editorial_articles (
                source_url, source_title, source_excerpt, title, article, summary, keywords_json, raw_response
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
          [
            item.source_url,
            item.title,
            articleText.slice(0, 4000),
            rewrite.title,
            rewrite.article,
            rewrite.summary,
            JSON.stringify(rewrite.keywords),
            rewrite.raw_response,
          ]
        );
      }

      results.push({
        status: existingRows.length && force ? "Updated" : "Success",
        id: insertResult.insertId || insertResult.rows?.[0]?.id || null,
        source_url: item.source_url,
        title: rewrite.title,
        word_count: countWords(rewrite.article),
      });
    } catch (error) {
      results.push({ status: "Error", source_url: item.source_url, title: item.title, message: error.message });
    }
  }

  return {
    status: results.some((item) => item.status === "Success" || item.status === "Updated") ? "Success" : "Skipped",
    feed_url: EDITORIAL_RSS_URL,
    daily_limit: EDITORIAL_DAILY_LIMIT,
    already_today: alreadyToday,
    requested,
    saved_count: results.filter((item) => item.status === "Success" || item.status === "Updated").length,
    skipped_count: results.filter((item) => item.status === "Skipped").length,
    failed_count: results.filter((item) => item.status === "Error").length,
    results,
  };
}

module.exports = {
  EDITORIAL_DAILY_LIMIT,
  initializeEditorialStorage,
  listEditorials,
  syncEditorials,
};

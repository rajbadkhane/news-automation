const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const AI_PROMPT_VERSION = "the-cliff-news-v1";
const AI_REWRITE_SYSTEM_PROMPT = `You are a senior digital editor writing for "The Cliff News", a Google Discover-optimized, mobile-first news platform.

Rewrite the following raw news into a fully original, high-quality news report designed to perform well on Google Discover and within The Cliff News app.

FOLLOW ALL INSTRUCTIONS STRICTLY:

1) DISCOVER-FIRST ORIGINALITY
- The article must be 100% original.
- Do NOT reuse wording, phrases, or structure from wire agencies or competing outlets.
- The story must feel exclusive, timely, and authoritative.

2) TOP SUMMARY (MANDATORY - DISCOVER FRIENDLY)
Start with 3-4 concise bullet points answering and highlighting:
- What happened
- Why it matters now
- What changes for people
- Who is affected

These bullets must be skimmable and curiosity-driven without clickbait.

3) STRONG DISCOVER HEADLINE
- Write a clear, emotionally engaging but factual headline.
- Avoid ALL CAPS and clickbait.
- Include the most important keyword naturally.
- Make it suitable for Google Discover cards and push notifications.

4) POWERFUL LEAD PARAGRAPH
- First 2-3 lines must clearly explain the news and why it matters.
- Assume the reader has no prior context.
- Encourage continued reading without exaggeration.

5) CONTEXT, BACKGROUND & IMPACT
- Add relevant historical and situational context.
- Explain implications for:
  - Public safety
  - Security
  - Governance
  - Economy
  - Travel
  - International relations (if applicable)
- Answer: "Why should a mobile reader care right now?"

6) CREDIBLE ATTRIBUTION & TRUST SIGNALS
- Attribute information to official statements, verified agencies, press releases, or domain experts.
- Paraphrase official remarks clearly.
- Avoid vague sourcing.

7) FACTUAL INTEGRITY
- Do NOT invent facts, figures, or claims.
- Ensure all details are accurate and verifiable.
- If details are developing, clearly state it.

8) MOBILE-FIRST STRUCTURE
- Use short paragraphs (2-3 lines max).
- Use clear subheadings for scannability.
- Keep language simple, direct, and accessible.

9) MULTIPLE PERSPECTIVES
- Include viewpoints from officials, experts, and affected sectors.
- Clearly distinguish facts from analysis.

10) VALUE ADDITION
- Do not merely summarize existing reports.
- Add insight, clarity, and relevance.
- Help readers understand consequences and next steps.

11) GOOGLE DISCOVER STYLE & FORMATTING RULES
- Bold all key facts, numbers, names, dates, locations, and decisions.
- Underline the most critical elements such as policy changes, warnings, major outcomes, and official actions.
- Remove the word "pilgrims" completely.
- Do NOT use em dashes.
- Avoid repetition and filler.

12) ENGAGEMENT BOOST
- End with a short "What to watch next" section (2-3 lines).
- Keep tone authoritative, not promotional.

Keep the heading at top and remove any labels like top summary, headline, or lead paragraph.

Return ONLY valid JSON using this exact schema:
{
  "english": {
    "headline": "string",
    "top_summary": ["string", "string", "string"],
    "short_description": "string",
    "long_description": "string",
    "what_to_watch_next": "string"
  },
  "hindi": {
    "headline": "string",
    "top_summary": ["string", "string", "string"],
    "short_description": "string",
    "long_description": "string",
    "what_to_watch_next": "string"
  }
}

The Hindi section must be a proper Hindi translation and adaptation of the English rewrite, kept separate and not mixed.`;

const { isDuplicateColumnError, isDuplicateKeyError } = require("./db");

async function initializeAiRewriteStorage(dbPool) {
  if (dbPool.dialect === "postgres") {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS ai_news_rewrites (
        id BIGSERIAL PRIMARY KEY,
        news_id BIGINT NOT NULL UNIQUE,
        model_name VARCHAR(100) NOT NULL,
        prompt_version VARCHAR(100) NOT NULL,
        source_url TEXT NOT NULL,
        source_title TEXT,
        source_excerpt TEXT,
        english_headline TEXT,
        english_top_summary TEXT,
        english_short_description TEXT,
        english_long_description TEXT,
        english_what_to_watch_next TEXT,
        hindi_headline TEXT,
        hindi_top_summary TEXT,
        hindi_short_description TEXT,
        hindi_long_description TEXT,
        hindi_what_to_watch_next TEXT,
        publication_status VARCHAR(20) NOT NULL DEFAULT 'draft',
        published_at TIMESTAMPTZ NULL DEFAULT NULL,
        published_by VARCHAR(150) NULL,
        delivery_slug VARCHAR(191) NULL UNIQUE,
        raw_response TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } else {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS ai_news_rewrites (
        id INT AUTO_INCREMENT PRIMARY KEY,
        news_id INT NOT NULL,
        model_name VARCHAR(100) NOT NULL,
        prompt_version VARCHAR(100) NOT NULL,
        source_url TEXT NOT NULL,
        source_title TEXT,
        source_excerpt MEDIUMTEXT,
        english_headline TEXT,
        english_top_summary TEXT,
        english_short_description MEDIUMTEXT,
        english_long_description LONGTEXT,
        english_what_to_watch_next TEXT,
        hindi_headline TEXT,
        hindi_top_summary TEXT,
        hindi_short_description MEDIUMTEXT,
        hindi_long_description LONGTEXT,
        hindi_what_to_watch_next TEXT,
        publication_status VARCHAR(20) NOT NULL DEFAULT 'draft',
        published_at TIMESTAMP NULL DEFAULT NULL,
        published_by VARCHAR(150) NULL,
        delivery_slug VARCHAR(191) NULL,
        raw_response LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_news_id (news_id),
        UNIQUE KEY unique_delivery_slug (delivery_slug)
      )
    `);
  }

  const alterStatements = dbPool.dialect === "postgres"
    ? [
        "ALTER TABLE ai_news_rewrites ADD COLUMN publication_status VARCHAR(20) NOT NULL DEFAULT 'draft'",
        "ALTER TABLE ai_news_rewrites ADD COLUMN published_at TIMESTAMPTZ NULL DEFAULT NULL",
        "ALTER TABLE ai_news_rewrites ADD COLUMN published_by VARCHAR(150) NULL",
        "ALTER TABLE ai_news_rewrites ADD COLUMN delivery_slug VARCHAR(191) NULL",
        "CREATE UNIQUE INDEX unique_delivery_slug ON ai_news_rewrites (delivery_slug)",
      ]
    : [
        "ALTER TABLE ai_news_rewrites ADD COLUMN publication_status VARCHAR(20) NOT NULL DEFAULT 'draft'",
        "ALTER TABLE ai_news_rewrites ADD COLUMN published_at TIMESTAMP NULL DEFAULT NULL",
        "ALTER TABLE ai_news_rewrites ADD COLUMN published_by VARCHAR(150) NULL",
        "ALTER TABLE ai_news_rewrites ADD COLUMN delivery_slug VARCHAR(191) NULL",
        "ALTER TABLE ai_news_rewrites ADD UNIQUE KEY unique_delivery_slug (delivery_slug)",
      ];

  for (const statement of alterStatements) {
    try {
      await dbPool.query(statement);
    } catch (error) {
      if (!isDuplicateColumnError(error, dbPool.dialect) && !isDuplicateKeyError(error, dbPool.dialect)) {
        throw error;
      }
    }
  }
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value, maxLength) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function cleanGeneratedText(value) {
  return String(value || "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanSummaryList(values) {
  return (Array.isArray(values) ? values : [])
    .map((item) => cleanGeneratedText(item))
    .filter(Boolean);
}

function slugifyText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function parseJsonResponse(rawText) {
  const normalized = String(rawText || "").trim();
  if (!normalized) {
    throw new Error("Gemini returned an empty response.");
  }

  const fencedMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fencedMatch ? fencedMatch[1].trim() : normalized;
  return JSON.parse(jsonText);
}

function validateAiPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Gemini response was not a valid object.");
  }

  for (const language of ["english", "hindi"]) {
    if (!payload[language] || typeof payload[language] !== "object") {
      throw new Error(`Gemini response is missing the ${language} section.`);
    }
  }

  return payload;
}

async function findNewsRecordById(dbPool, newsId) {
  const [rows] = await dbPool.execute(
    `
      SELECT id, category, feed_source, feed_url, search_query, title, source_url, image_link, image_source, fetched_at
      FROM fetched_news
      WHERE id = ?
      LIMIT 1
    `,
    [newsId]
  );

  return rows[0] || null;
}

async function findAiRewriteByNewsId(dbPool, newsId) {
  const [rows] = await dbPool.execute(
    `
      SELECT *
      FROM ai_news_rewrites
      WHERE news_id = ?
      LIMIT 1
    `,
    [newsId]
  );

  return rows[0] || null;
}

async function saveAiRewrite(dbPool, {
  newsId,
  modelName,
  promptVersion,
  sourceUrl,
  sourceTitle,
  sourceExcerpt,
  payload,
  rawResponse,
}) {
  const english = payload.english || {};
  const hindi = payload.hindi || {};

  await dbPool.execute(
    dbPool.dialect === "postgres"
      ? `
          INSERT INTO ai_news_rewrites (
            news_id, model_name, prompt_version, source_url, source_title, source_excerpt,
            english_headline, english_top_summary, english_short_description, english_long_description, english_what_to_watch_next,
            hindi_headline, hindi_top_summary, hindi_short_description, hindi_long_description, hindi_what_to_watch_next,
            raw_response
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (news_id) DO UPDATE SET
            model_name = EXCLUDED.model_name,
            prompt_version = EXCLUDED.prompt_version,
            source_url = EXCLUDED.source_url,
            source_title = EXCLUDED.source_title,
            source_excerpt = EXCLUDED.source_excerpt,
            english_headline = EXCLUDED.english_headline,
            english_top_summary = EXCLUDED.english_top_summary,
            english_short_description = EXCLUDED.english_short_description,
            english_long_description = EXCLUDED.english_long_description,
            english_what_to_watch_next = EXCLUDED.english_what_to_watch_next,
            hindi_headline = EXCLUDED.hindi_headline,
            hindi_top_summary = EXCLUDED.hindi_top_summary,
            hindi_short_description = EXCLUDED.hindi_short_description,
            hindi_long_description = EXCLUDED.hindi_long_description,
            hindi_what_to_watch_next = EXCLUDED.hindi_what_to_watch_next,
            raw_response = EXCLUDED.raw_response,
            updated_at = CURRENT_TIMESTAMP
        `
      : `
          INSERT INTO ai_news_rewrites (
            news_id, model_name, prompt_version, source_url, source_title, source_excerpt,
            english_headline, english_top_summary, english_short_description, english_long_description, english_what_to_watch_next,
            hindi_headline, hindi_top_summary, hindi_short_description, hindi_long_description, hindi_what_to_watch_next,
            raw_response
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            model_name = VALUES(model_name),
            prompt_version = VALUES(prompt_version),
            source_url = VALUES(source_url),
            source_title = VALUES(source_title),
            source_excerpt = VALUES(source_excerpt),
            english_headline = VALUES(english_headline),
            english_top_summary = VALUES(english_top_summary),
            english_short_description = VALUES(english_short_description),
            english_long_description = VALUES(english_long_description),
            english_what_to_watch_next = VALUES(english_what_to_watch_next),
            hindi_headline = VALUES(hindi_headline),
            hindi_top_summary = VALUES(hindi_top_summary),
            hindi_short_description = VALUES(hindi_short_description),
            hindi_long_description = VALUES(hindi_long_description),
            hindi_what_to_watch_next = VALUES(hindi_what_to_watch_next),
            raw_response = VALUES(raw_response)
        `,
    [
      newsId,
      modelName,
      promptVersion,
      sourceUrl,
      sourceTitle,
      sourceExcerpt,
      english.headline || null,
      JSON.stringify(Array.isArray(english.top_summary) ? english.top_summary : []),
      english.short_description || null,
      english.long_description || null,
      english.what_to_watch_next || null,
      hindi.headline || null,
      JSON.stringify(Array.isArray(hindi.top_summary) ? hindi.top_summary : []),
      hindi.short_description || null,
      hindi.long_description || null,
      hindi.what_to_watch_next || null,
      rawResponse,
    ]
  );

  return findAiRewriteByNewsId(dbPool, newsId);
}

async function findLatestRewriteCandidatesByCategory(dbPool, category, limit = 1) {
  const [rows] = await dbPool.query(
    `
      SELECT fn.id, fn.category, fn.feed_source, fn.feed_url, fn.search_query, fn.title, fn.source_url, fn.image_link, fn.image_source, fn.fetched_at
      FROM fetched_news fn
      LEFT JOIN ai_news_rewrites air ON air.news_id = fn.id
      WHERE fn.category = ? AND air.news_id IS NULL
      ORDER BY fn.id DESC
      LIMIT ?
    `,
    [category, limit]
  );

  return rows;
}

async function extractArticleTextFromPage(page, articleUrl) {
  await page.goto(articleUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("body", { timeout: 10000 });

  return page.evaluate(() => {
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const articleHost = (() => {
      try {
        return window.location.hostname.toLowerCase();
      } catch {
        return "";
      }
    })();
    const siteNoisePatterns = [
      /cookie|subscribe|newsletter|follow us|advertisement|read more|click here|download app/i,
      /all rights reserved|beta version|designed and maintained|site version/i,
      /directory|judiciary|collector|commissioner|district news|minister|cabinet/i,
      /facebook|twitter|instagram|youtube|whatsapp|telegram/i,
    ];
    const mpInfoNoisePatterns = [
      /© 2006-20\d{2}/i,
      /जनसम्पर्क विभाग/i,
      /साईट का संस्करण/i,
      /जिले के समाचार/i,
      /मंत्रिपरिषद/i,
      /डायरेक्टरी/i,
      /भोपालराजगढ़|ग्वालियरग्वालियर|उज्जैननीमच|जबलपुरकटनी/i,
      /e-संदेश|स्पेशल/i,
    ];
    const activeNoisePatterns = articleHost.includes("mpinfo.org")
      ? [...siteNoisePatterns, ...mpInfoNoisePatterns]
      : siteNoisePatterns;

    const title =
      document.querySelector('meta[property="og:title"]')?.content ||
      document.querySelector("title")?.innerText ||
      document.title ||
      "";

    const metaDescription =
      document.querySelector('meta[name="description"]')?.content ||
      document.querySelector('meta[property="og:description"]')?.content ||
      "";

    const candidateRoots = [
      document.querySelector("article"),
      document.querySelector("main"),
      document.querySelector("[role='main']"),
      document.body,
    ].filter(Boolean);

    const paragraphs = [];
    const seen = new Set();

    for (const root of candidateRoots) {
      const nodes = Array.from(root.querySelectorAll("p, li"));
      for (const node of nodes) {
        const text = normalize(node.textContent);
        if (!text || text.length < 40) {
          continue;
        }

        if (activeNoisePatterns.some((pattern) => pattern.test(text))) {
          continue;
        }

        if (seen.has(text)) {
          continue;
        }

        seen.add(text);
        paragraphs.push(text);

        if (paragraphs.length >= 25) {
          break;
        }
      }

      if (paragraphs.length >= 25) {
        break;
      }
    }

    const combinedText = [title, metaDescription, ...paragraphs].filter(Boolean).join("\n\n");

    return {
      title: normalize(title),
      metaDescription: normalize(metaDescription),
      paragraphs,
      combinedText: normalize(combinedText),
    };
  });
}

function isTransientBrowserError(error) {
  const message = String(error?.message || "");
  return [
    "ERR_CONNECTION_RESET",
    "ERR_CONNECTION_CLOSED",
    "ERR_NETWORK_CHANGED",
    "ERR_TIMED_OUT",
    "Navigation timeout",
    "Timeout",
    "Target closed",
    "Session closed",
  ].some((fragment) => message.includes(fragment));
}

async function withTransientRetry(task, { retries = 2, delayMs = 1200 } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isTransientBrowserError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }

  throw lastError;
}

async function generateAiRewrite(articleRecord, articleText) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured. Set it in .env before using AI rewrite routes.");
  }

  const prompt = `${AI_REWRITE_SYSTEM_PROMPT}

RAW ARTICLE DETAILS
Category: ${articleRecord.category || "uncategorized"}
Feed source: ${articleRecord.feed_source || "unknown"}
Original title: ${articleRecord.title || ""}
Original URL: ${articleRecord.source_url}

RAW ARTICLE TEXT
${truncateText(articleText.combinedText, 14000)}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini request failed with status ${response.status}.`);
  }

  const rawText =
    payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("\n")
      .trim() || "";

  const parsed = validateAiPayload(parseJsonResponse(rawText));

  return {
    model_name: GEMINI_MODEL,
    raw_response: rawText,
    payload: parsed,
  };
}

function formatAiRewriteRecord(record) {
  if (!record) {
    return null;
  }

  const parseSummary = (value) => {
    try {
      const parsed = JSON.parse(value || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  return {
    id: record.id,
    news_id: record.news_id,
    model_name: record.model_name,
    prompt_version: record.prompt_version,
    source_url: record.source_url,
    source_title: record.source_title,
    source_excerpt: record.source_excerpt,
    english: {
      headline: cleanGeneratedText(record.english_headline),
      top_summary: cleanSummaryList(parseSummary(record.english_top_summary)),
      short_description: cleanGeneratedText(record.english_short_description),
      long_description: cleanGeneratedText(record.english_long_description),
      what_to_watch_next: cleanGeneratedText(record.english_what_to_watch_next),
    },
    hindi: {
      headline: cleanGeneratedText(record.hindi_headline),
      top_summary: cleanSummaryList(parseSummary(record.hindi_top_summary)),
      short_description: cleanGeneratedText(record.hindi_short_description),
      long_description: cleanGeneratedText(record.hindi_long_description),
      what_to_watch_next: cleanGeneratedText(record.hindi_what_to_watch_next),
    },
    publication: {
      status: record.publication_status || "draft",
      published_at: record.published_at || null,
      published_by: record.published_by || null,
      slug: record.delivery_slug || null,
    },
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function formatAiRewriteWithNewsRecord(record) {
  if (!record) {
    return null;
  }

  const rewrite = formatAiRewriteRecord(record);

  return {
    ...rewrite,
    news: {
      id: record.news_id,
      category: record.category,
      title: record.news_title,
      source_url: record.news_source_url,
      image_link: record.news_image_link,
      image_source: record.news_image_source,
      fetched_at: record.news_fetched_at,
      feed_source: record.news_feed_source,
      feed_url: record.news_feed_url,
    },
  };
}

async function createOrUpdateRewriteForRecord(dbPool, articleRecord, createBrowserPage) {
  const { browser, page } = await createBrowserPage();

  try {
    const articleText = await withTransientRetry(
      async () => extractArticleTextFromPage(page, articleRecord.source_url)
    );
    if (!articleText.combinedText || articleText.combinedText.length < 120) {
      throw new Error("Could not extract enough article text for AI rewriting.");
    }

    const aiResult = await generateAiRewrite(articleRecord, articleText);
    const savedRewrite = await saveAiRewrite(dbPool, {
      newsId: articleRecord.id,
      modelName: aiResult.model_name,
      promptVersion: AI_PROMPT_VERSION,
      sourceUrl: articleRecord.source_url,
      sourceTitle: articleText.title || articleRecord.title || null,
      sourceExcerpt: truncateText(articleText.combinedText, 4000),
      payload: aiResult.payload,
      rawResponse: aiResult.raw_response,
    });

    return savedRewrite;
  } finally {
    await browser.close();
  }
}

async function listAiRewrites(dbPool, { category = null, limit = 50, publicationStatus = null } = {}) {
  const conditions = [];
  const params = [];

  if (category) {
    conditions.push("fn.category = ?");
    params.push(category);
  }

  if (publicationStatus) {
    conditions.push("air.publication_status = ?");
    params.push(publicationStatus);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const queryText = `
        SELECT
          air.*,
          fn.category,
          fn.title AS news_title,
          fn.source_url AS news_source_url,
          fn.image_link AS news_image_link,
          fn.image_source AS news_image_source,
          fn.fetched_at AS news_fetched_at,
          fn.feed_source AS news_feed_source,
          fn.feed_url AS news_feed_url
        FROM ai_news_rewrites air
        INNER JOIN fetched_news fn ON fn.id = air.news_id
        ${whereClause}
        ORDER BY COALESCE(air.published_at, air.updated_at) DESC, air.id DESC
        LIMIT ?
      `;

  params.push(limit);
  const [rows] = await dbPool.query(queryText, params);
  return rows.map(formatAiRewriteWithNewsRecord);
}

function formatDeliveredRewrite(record, language = "both") {
  const formatted = record?.english && record?.hindi && record?.news
    ? record
    : formatAiRewriteWithNewsRecord(record);
  if (!formatted) {
    return null;
  }

  const payload = {
    id: formatted.id,
    slug: formatted.publication?.slug || null,
    category: formatted.news?.category || "uncategorized",
    publication_status: formatted.publication?.status || "draft",
    published_at: formatted.publication?.published_at || null,
    updated_at: formatted.updated_at,
    news_id: formatted.news_id,
    source: {
      title: formatted.source_title || formatted.news?.title || null,
      url: formatted.source_url || formatted.news?.source_url || null,
      feed_source: formatted.news?.feed_source || null,
      feed_url: formatted.news?.feed_url || null,
      fetched_at: formatted.news?.fetched_at || null,
    },
    media: {
      image_link: formatted.news?.image_link || null,
      image_source: formatted.news?.image_source || null,
    },
  };

  if (language === "english" || language === "hindi") {
    return {
      ...payload,
      language,
      article: formatted[language],
    };
  }

  return {
    ...payload,
    language: "both",
    article: {
      english: formatted.english,
      hindi: formatted.hindi,
    },
  };
}

async function listDeliveredAiRewrites(dbPool, { category = null, limit = 50, language = "both" } = {}) {
  const records = await listAiRewrites(dbPool, {
    category,
    limit,
    publicationStatus: "published",
  });

  return records.map((record) => formatDeliveredRewrite(record, language));
}

async function findDeliveredAiRewrite(dbPool, identifier, { language = "both" } = {}) {
  const isNumericId = /^[0-9]+$/.test(String(identifier || "").trim());
  const queryText = isNumericId
    ? `
        SELECT
          air.*,
          fn.category,
          fn.title AS news_title,
          fn.source_url AS news_source_url,
          fn.image_link AS news_image_link,
          fn.image_source AS news_image_source,
          fn.fetched_at AS news_fetched_at,
          fn.feed_source AS news_feed_source,
          fn.feed_url AS news_feed_url
        FROM ai_news_rewrites air
        INNER JOIN fetched_news fn ON fn.id = air.news_id
        WHERE air.id = ? AND air.publication_status = 'published'
        LIMIT 1
      `
    : `
        SELECT
          air.*,
          fn.category,
          fn.title AS news_title,
          fn.source_url AS news_source_url,
          fn.image_link AS news_image_link,
          fn.image_source AS news_image_source,
          fn.fetched_at AS news_fetched_at,
          fn.feed_source AS news_feed_source,
          fn.feed_url AS news_feed_url
        FROM ai_news_rewrites air
        INNER JOIN fetched_news fn ON fn.id = air.news_id
        WHERE air.delivery_slug = ? AND air.publication_status = 'published'
        LIMIT 1
      `;

  const [rows] = await dbPool.query(queryText, [identifier]);
  return rows[0] ? formatDeliveredRewrite(rows[0], language) : null;
}

async function setAiRewritePublicationStatus(dbPool, rewriteId, { status, publishedBy = null } = {}) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (!["draft", "published"].includes(normalizedStatus)) {
    throw new Error("Publication status must be either 'draft' or 'published'.");
  }

  const [existingRows] = await dbPool.query(
    `
      SELECT air.*, fn.title AS news_title
      FROM ai_news_rewrites air
      INNER JOIN fetched_news fn ON fn.id = air.news_id
      WHERE air.id = ?
      LIMIT 1
    `,
    [rewriteId]
  );

  const existing = existingRows[0];
  if (!existing) {
    return null;
  }

  const nextPublishedAt = normalizedStatus === "published" ? new Date() : null;
  const nextPublishedBy = normalizedStatus === "published" ? String(publishedBy || "").trim() || "admin" : null;
  let nextSlug = existing.delivery_slug;

  if (normalizedStatus === "published" && !nextSlug) {
    const baseSlug = slugifyText(existing.english_headline || existing.source_title || existing.news_title || `rewrite-${rewriteId}`) || `rewrite-${rewriteId}`;
    nextSlug = `${baseSlug}-${rewriteId}`;
  }

  await dbPool.execute(
    `
      UPDATE ai_news_rewrites
      SET publication_status = ?, published_at = ?, published_by = ?, delivery_slug = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [normalizedStatus, nextPublishedAt, nextPublishedBy, nextSlug, rewriteId]
  );

  const [rows] = await dbPool.query(
    `
      SELECT
        air.*,
        fn.category,
        fn.title AS news_title,
        fn.source_url AS news_source_url,
        fn.image_link AS news_image_link,
        fn.image_source AS news_image_source,
        fn.fetched_at AS news_fetched_at,
        fn.feed_source AS news_feed_source,
        fn.feed_url AS news_feed_url
      FROM ai_news_rewrites air
      INNER JOIN fetched_news fn ON fn.id = air.news_id
      WHERE air.id = ?
      LIMIT 1
    `,
    [rewriteId]
  );

  return formatAiRewriteWithNewsRecord(rows[0]);
}

async function runAiRewriteCycleForCategories({ dbPool, categories, createBrowserPage }) {
  const results = [];

  for (const category of categories) {
    try {
      const candidates = await findLatestRewriteCandidatesByCategory(dbPool, category, 1);
      const articleRecord = candidates[0];

      if (!articleRecord) {
        results.push({
          status: "Skipped",
          category,
          message: "No unrevised saved article is available for this category.",
        });
        continue;
      }

      const savedRewrite = await createOrUpdateRewriteForRecord(dbPool, articleRecord, createBrowserPage);
      results.push({
        status: "Success",
        category,
        news_id: articleRecord.id,
        title: articleRecord.title,
        rewrite: formatAiRewriteRecord(savedRewrite),
      });
    } catch (error) {
      results.push({
        status: "Error",
        category,
        message: error.message,
      });
    }
  }

  return results;
}

function registerAiRewriteRoutes(app, { getDbPool, createBrowserPage, normalizeCategory }) {
  app.get("/ai/rewrite/:newsId", async (req, res) => {
    try {
      const dbPool = getDbPool();
      const newsId = Number.parseInt(req.params.newsId, 10);
      if (Number.isNaN(newsId) || newsId < 1) {
        return res.status(400).json({
          status: "Error",
          message: "A valid newsId is required.",
        });
      }

      const articleRecord = await findNewsRecordById(dbPool, newsId);
      if (!articleRecord) {
        return res.status(404).json({
          status: "Error",
          message: "News record not found.",
        });
      }

      const rewrite = await findAiRewriteByNewsId(dbPool, newsId);
      if (!rewrite) {
        return res.status(404).json({
          status: "Error",
          message: "No AI rewrite is saved for this news item yet.",
        });
      }

      return res.json({
        status: "Success",
        news: articleRecord,
        rewrite: formatAiRewriteRecord(rewrite),
      });
    } catch (error) {
      return res.status(500).json({
        status: "Error",
        message: error.message,
      });
    }
  });

  app.post("/ai/rewrite/:newsId", async (req, res) => {
    const force = String(req.query.force || "").toLowerCase() === "true" || req.query.force === "1";
    const newsId = Number.parseInt(req.params.newsId, 10);

    if (Number.isNaN(newsId) || newsId < 1) {
      return res.status(400).json({
        status: "Error",
        message: "A valid newsId is required.",
      });
    }

    try {
      const dbPool = getDbPool();
      const articleRecord = await findNewsRecordById(dbPool, newsId);
      if (!articleRecord) {
        return res.status(404).json({
          status: "Error",
          message: "News record not found.",
        });
      }

      const existingRewrite = await findAiRewriteByNewsId(dbPool, newsId);
      if (existingRewrite && !force) {
        return res.json({
          status: "Success",
          message: "Existing AI rewrite returned. Add ?force=1 to regenerate it.",
          news: articleRecord,
          rewrite: formatAiRewriteRecord(existingRewrite),
        });
      }

        const savedRewrite = await createOrUpdateRewriteForRecord(dbPool, articleRecord, createBrowserPage);

        return res.json({
          status: "Success",
          message: existingRewrite ? "AI rewrite regenerated successfully." : "AI rewrite created successfully.",
          news: articleRecord,
          rewrite: formatAiRewriteRecord(savedRewrite),
        });
    } catch (error) {
      return res.status(500).json({
        status: "Error",
        message: error.message,
      });
    }
  });

  app.post("/ai/rewrite-latest", async (req, res) => {
    const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit, 10) || 3, 10));
    const category = req.query.category ? normalizeCategory(req.query.category) : null;
    const force = String(req.query.force || "").toLowerCase() === "true" || req.query.force === "1";

    try {
      const dbPool = getDbPool();
      const queryText = category
        ? `
            SELECT id, category, feed_source, feed_url, search_query, title, source_url, image_link, image_source, fetched_at
            FROM fetched_news
            WHERE category = ?
            ORDER BY id DESC
            LIMIT ?
          `
        : `
            SELECT id, category, feed_source, feed_url, search_query, title, source_url, image_link, image_source, fetched_at
            FROM fetched_news
            ORDER BY id DESC
            LIMIT ?
          `;

      const [rows] = await dbPool.query(queryText, category ? [category, limit] : [limit]);
      if (!rows.length) {
        return res.status(404).json({
          status: "Error",
          message: "No saved news records were found for AI rewriting.",
        });
      }

      const results = [];
      for (const articleRecord of rows) {
        const existingRewrite = await findAiRewriteByNewsId(dbPool, articleRecord.id);
        if (existingRewrite && !force) {
          results.push({
            status: "Skipped",
            news_id: articleRecord.id,
            title: articleRecord.title,
            message: "AI rewrite already exists. Use ?force=1 to regenerate.",
          });
          continue;
        }

        try {
          const savedRewrite = await createOrUpdateRewriteForRecord(dbPool, articleRecord, createBrowserPage);

          results.push({
            status: "Success",
            news_id: articleRecord.id,
            title: articleRecord.title,
            rewrite: formatAiRewriteRecord(savedRewrite),
          });
        } catch (error) {
          results.push({
            status: "Error",
            news_id: articleRecord.id,
            title: articleRecord.title,
            message: error.message,
          });
        }
      }

      return res.json({
        status: "Success",
        requested_limit: limit,
        category,
        force,
        success_count: results.filter((item) => item.status === "Success").length,
        skipped_count: results.filter((item) => item.status === "Skipped").length,
        failed_count: results.filter((item) => item.status === "Error").length,
        results,
      });
    } catch (error) {
      return res.status(500).json({
        status: "Error",
        message: error.message,
      });
    }
  });

  app.get("/ai/news", async (req, res) => {
    try {
      const dbPool = getDbPool();
      const category = req.query.category ? normalizeCategory(req.query.category) : null;
      const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit, 10) || 100, 200));
      const rewrites = await listAiRewrites(dbPool, { category, limit });

      return res.json({
        status: "Success",
        count: rewrites.length,
        category,
        records: rewrites,
      });
    } catch (error) {
      return res.status(500).json({
        status: "Error",
        message: error.message,
      });
    }
  });

  app.get("/ai/news/grouped", async (req, res) => {
    try {
      const dbPool = getDbPool();
      const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit, 10) || 100, 200));
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

      return res.json({
        status: "Success",
        count: rewrites.length,
        category_count: grouped.length,
        grouped_records: grouped,
      });
    } catch (error) {
      return res.status(500).json({
        status: "Error",
        message: error.message,
      });
    }
  });
}

module.exports = {
  initializeAiRewriteStorage,
  findDeliveredAiRewrite,
  listAiRewrites,
  listDeliveredAiRewrites,
  registerAiRewriteRoutes,
  runAiRewriteCycleForCategories,
  setAiRewritePublicationStatus,
};

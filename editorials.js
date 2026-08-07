const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const EDITORIAL_DAILY_LIMIT = Math.max(1, Number.parseInt(process.env.EDITORIAL_DAILY_LIMIT || "10", 10) || 10);
const EDITORIAL_MIN_SYNC_INTERVAL_MS = Math.max(
  10 * 60 * 1000,
  Number.parseInt(process.env.EDITORIAL_MIN_SYNC_INTERVAL_MS || String(45 * 60 * 1000), 10) || 45 * 60 * 1000
);
const EDITORIAL_MAX_REPAIR_ATTEMPTS = 2;

// Word-count anchors per the editorial desk spec. Headline/sub-headline/summary
// are exact bands; deep_dive is a hard floor only ("at least 1500 words").
const EDITORIAL_PRIMARY_HEADLINE_MIN_WORDS = 4;
const EDITORIAL_PRIMARY_HEADLINE_MAX_WORDS = 6;
const EDITORIAL_SUB_HEADLINE_MIN_WORDS = 10;
const EDITORIAL_SUB_HEADLINE_MAX_WORDS = 14;
const EDITORIAL_SUMMARY_MIN_WORDS = 100;
const EDITORIAL_SUMMARY_MAX_WORDS = 200;
const EDITORIAL_DEEP_DIVE_MIN_WORDS = 1500;

const EDITORIAL_CATEGORIES = [
  "National Governance & Judiciary",
  "Economy & Business",
  "Environment & Climate",
  "Public Security & Cyber Fraud",
  "Science & Technology",
  "Social Security & Labor",
  "Education & Testing",
  "Infrastructure",
  "Agriculture",
  "International Relations",
];

const EDITORIAL_DISCOVERY_PROMPT = `You are the daily assignment editor for a national Hindi editorial desk.

TASK:
1. Determine today's current date yourself (day, month, year) using your live search results. Do not assume or hardcode a date.
2. Using real-time web search, identify exactly ${EDITORIAL_DAILY_LIMIT} major, distinct national issues in India that were reported or updated within the last 24 hours.
3. Scan across these categories (cover as many distinct categories as the day's real news supports; do not force a story into a category it does not fit):
${EDITORIAL_CATEGORIES.map((category) => `- ${category}`).join("\n")}

For each issue, return:
- "category": one of the category names above, verbatim.
- "topic_title": a short English working title for internal use only (not published).
- "brief": 3 to 5 sentences in English summarizing the verified facts: what happened, who is involved, when, and why it matters. Base this only on what your search actually finds.
- "key_facts": an array of 3 to 6 short factual bullet strings (names, numbers, dates, institutions) drawn from the search results, used to ground later writing and prevent fabrication.

Rules:
- All ${EDITORIAL_DAILY_LIMIT} issues must be genuinely distinct stories, not the same story from different angles.
- Prioritize high-impact, high-public-interest national issues over minor regional items.
- Do not invent facts. If fewer than ${EDITORIAL_DAILY_LIMIT} sufficiently significant, verifiable stories exist today, return as many as you can verify rather than padding with fabricated ones.

Return ONLY a JSON code block with this exact shape, no other text:
\`\`\`json
{
  "date": "YYYY-MM-DD",
  "issues": [
    { "category": "", "topic_title": "", "brief": "", "key_facts": ["", ""] }
  ]
}
\`\`\``;

const EDITORIAL_WRITER_SYSTEM_PROMPT = `You are a senior Hindi editorial writer for a national policy journal, producing analytical editorial packages on India's top current issues.

Permanent rules:
- Write only in Hindi (Devanagari). Return only valid JSON.
- Base every fact strictly on the supplied topic brief and key facts. Do not invent names, numbers, dates, quotes, statistics or events beyond what is supplied.
- You may add well-established general background, historical context, and standard policy/analytical framing that an informed editorial writer would know, provided it does not contradict or fabricate specifics about this particular story.
- Maintain a neutral, authoritative, analytical editorial voice suitable for a serious policy journal. No clickbait, no sensationalism.
- Carry proper nouns (people, institutions, places, schemes, laws) through consistently in standard Hindi newspaper spelling.

JSON schema:
{
  "primary_headline": "",
  "sub_headline": "",
  "executive_summary": "",
  "deep_dive": ""
}

Part-by-part requirements:
- primary_headline: a standalone, meaningful Hindi headline, STRICTLY ${EDITORIAL_PRIMARY_HEADLINE_MIN_WORDS} to ${EDITORIAL_PRIMARY_HEADLINE_MAX_WORDS} words. No clickbait. Must reflect the core policy or event theme.
- sub_headline: a standalone, meaningful Hindi sub-headline, STRICTLY ${EDITORIAL_SUB_HEADLINE_MIN_WORDS} to ${EDITORIAL_SUB_HEADLINE_MAX_WORDS} words, expanding directly on primary_headline with essential context or policy implications. Do not repeat primary_headline's wording.
- executive_summary: a concise Hindi paragraph, STRICTLY ${EDITORIAL_SUMMARY_MIN_WORDS} to ${EDITORIAL_SUMMARY_MAX_WORDS} words, summarizing the core facts, background, key stakeholders, and immediate developments.
- deep_dive: an exhaustive analytical Hindi editorial, a hard MINIMUM of ${EDITORIAL_DEEP_DIVE_MIN_WORDS} words (more is fine and encouraged; less is not acceptable). Structure it using markdown subheadings ("### ") covering, in order:
  ### पृष्ठभूमि और संरचनात्मक संदर्भ
  ### प्रमुख चुनौतियाँ और खामियाँ
  ### हितधारकों पर प्रभाव और सामाजिक-आर्थिक निहितार्थ
  ### नीतिगत सुझाव और आगे की राह
  Each section must contain substantive analysis, context, stakeholder perspectives and, where relevant, realistic policy references — not filler text.
- Do not repeat primary_headline, sub_headline or executive_summary verbatim inside deep_dive.`;

let lastEditorialSyncAt = 0;

function parseJsonResponse(rawText) {
  const text = String(rawText || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1].trim() : text);
}

function countWords(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function hasHindiText(value) {
  return /[ऀ-ॿ]/.test(String(value || ""));
}

async function callGeminiGenerateContent({ prompt, tools = null, responseMimeType = null, temperature = 0.3, maxOutputTokens = 8000 }) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const generationConfig = { temperature, maxOutputTokens };
  if (responseMimeType) {
    generationConfig.responseMimeType = responseMimeType;
  }

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig,
  };
  if (tools) {
    body.tools = tools;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini request failed with status ${response.status}.`);
  }

  const rawText = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";
  return { rawText, payload };
}

// One grounded call per day discovers today's issues; forcing JSON response
// mode is unreliable together with tool/grounding use, so this asks for a
// fenced JSON block in plain text instead (parseJsonResponse already handles that).
async function discoverTodayIssues() {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const prompt = attempt === 0
        ? EDITORIAL_DISCOVERY_PROMPT
        : `${EDITORIAL_DISCOVERY_PROMPT}

The previous attempt returned fewer than ${EDITORIAL_DAILY_LIMIT} usable issues. Try again and make sure to return exactly ${EDITORIAL_DAILY_LIMIT} distinct, verifiable issues if today's news supports it.`;

      const { rawText } = await callGeminiGenerateContent({
        prompt,
        tools: [{ google_search: {} }],
        temperature: 0.4,
        maxOutputTokens: 8000,
      });

      const parsed = parseJsonResponse(rawText);
      const issues = Array.isArray(parsed?.issues) ? parsed.issues : [];
      const usable = issues
        .map((issue) => ({
          category: String(issue?.category || "").trim() || "National Governance & Judiciary",
          topic_title: String(issue?.topic_title || "").trim(),
          brief: String(issue?.brief || "").trim(),
          key_facts: Array.isArray(issue?.key_facts)
            ? issue.key_facts.map((fact) => String(fact || "").trim()).filter(Boolean).slice(0, 6)
            : [],
        }))
        .filter((issue) => issue.topic_title && issue.brief);

      if (usable.length >= EDITORIAL_DAILY_LIMIT) {
        return { date: String(parsed?.date || "").trim(), issues: usable.slice(0, EDITORIAL_DAILY_LIMIT) };
      }
      if (usable.length > 0 && attempt === 1) {
        return { date: String(parsed?.date || "").trim(), issues: usable };
      }
      lastError = new Error(`Editorial discovery returned only ${usable.length} usable issues.`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Editorial discovery failed.");
}

function buildEditorialWriterPrompt(issue) {
  return `${EDITORIAL_WRITER_SYSTEM_PROMPT}

TOPIC
Category: ${issue.category}
Working title: ${issue.topic_title}
Verified brief: ${issue.brief}
Key facts:
${issue.key_facts.length ? issue.key_facts.map((fact) => `- ${fact}`).join("\n") : "- (no additional facts supplied; rely on the brief only)"}`;
}

function inspectPartWordCount(value, minWords, maxWords) {
  const words = countWords(value);
  if (!value || !hasHindiText(value)) {
    return { valid: false, reason: "missing_or_not_hindi", words };
  }
  if (words < minWords || words > maxWords) {
    return { valid: false, reason: "word_count", words };
  }
  return { valid: true, reason: null, words };
}

function inspectDeepDive(value, minWords) {
  const words = countWords(value);
  if (!value || !hasHindiText(value)) {
    return { valid: false, reason: "missing_or_not_hindi", words };
  }
  if (words < minWords) {
    return { valid: false, reason: "too_short", words };
  }
  return { valid: true, reason: null, words };
}

function validateEditorialPackage(parsed) {
  const invalidFields = [];
  const details = {};
  const primaryHeadline = String(parsed?.primary_headline || "").trim();
  const subHeadline = String(parsed?.sub_headline || "").trim();
  const executiveSummary = String(parsed?.executive_summary || "").trim();
  const deepDive = String(parsed?.deep_dive || "").trim();

  const bandChecks = [
    ["primary_headline", primaryHeadline, EDITORIAL_PRIMARY_HEADLINE_MIN_WORDS, EDITORIAL_PRIMARY_HEADLINE_MAX_WORDS],
    ["sub_headline", subHeadline, EDITORIAL_SUB_HEADLINE_MIN_WORDS, EDITORIAL_SUB_HEADLINE_MAX_WORDS],
    ["executive_summary", executiveSummary, EDITORIAL_SUMMARY_MIN_WORDS, EDITORIAL_SUMMARY_MAX_WORDS],
  ];
  for (const [field, value, minWords, maxWords] of bandChecks) {
    const check = inspectPartWordCount(value, minWords, maxWords);
    if (!check.valid) {
      invalidFields.push(field);
      details[field] = { reason: check.reason, words: check.words, min: minWords, max: maxWords };
    }
  }

  const deepDiveCheck = inspectDeepDive(deepDive, EDITORIAL_DEEP_DIVE_MIN_WORDS);
  if (!deepDiveCheck.valid) {
    invalidFields.push("deep_dive");
    details.deep_dive = { reason: deepDiveCheck.reason, words: deepDiveCheck.words, min: EDITORIAL_DEEP_DIVE_MIN_WORDS };
  }

  if (invalidFields.length) {
    const error = new Error(`Editorial package failed validation: ${invalidFields.join(", ")}.`);
    error.invalidFields = invalidFields;
    error.validationDetails = details;
    throw error;
  }

  return {
    primary_headline: primaryHeadline,
    sub_headline: subHeadline,
    executive_summary: executiveSummary,
    deep_dive: deepDive,
    deep_dive_word_count: deepDiveCheck.words,
  };
}

async function repairEditorialPackage(issue, payload, invalidFields) {
  const fieldSpecs = {
    primary_headline: `STRICT ${EDITORIAL_PRIMARY_HEADLINE_MIN_WORDS} to ${EDITORIAL_PRIMARY_HEADLINE_MAX_WORDS} Hindi words, standalone and meaningful.`,
    sub_headline: `STRICT ${EDITORIAL_SUB_HEADLINE_MIN_WORDS} to ${EDITORIAL_SUB_HEADLINE_MAX_WORDS} Hindi words, expanding on the primary headline.`,
    executive_summary: `STRICT ${EDITORIAL_SUMMARY_MIN_WORDS} to ${EDITORIAL_SUMMARY_MAX_WORDS} Hindi words.`,
    deep_dive: `a hard MINIMUM of ${EDITORIAL_DEEP_DIVE_MIN_WORDS} Hindi words with the same four markdown subheadings as before; more is fine, less is not acceptable.`,
  };

  const repairPrompt = `${buildEditorialWriterPrompt(issue)}

REPAIR MODE
The following fields failed validation and must be replaced. Return ONLY a JSON object containing just these keys, with corrected values: ${invalidFields.join(", ")}.
${invalidFields.map((field) => `- ${field}: ${fieldSpecs[field] || "regenerate this field to meet the schema above."}`).join("\n")}`;

  const { rawText } = await callGeminiGenerateContent({
    prompt: repairPrompt,
    responseMimeType: "application/json",
    temperature: 0.25,
    maxOutputTokens: 8000,
  });

  const patch = parseJsonResponse(rawText);
  return { ...payload, ...patch };
}

async function generateEditorialPackage(issue) {
  const { rawText } = await callGeminiGenerateContent({
    prompt: buildEditorialWriterPrompt(issue),
    responseMimeType: "application/json",
    temperature: 0.35,
    maxOutputTokens: 12000,
  });

  let workingPayload = parseJsonResponse(rawText);
  let lastError = null;

  for (let attempt = 0; attempt <= EDITORIAL_MAX_REPAIR_ATTEMPTS; attempt += 1) {
    try {
      return validateEditorialPackage(workingPayload);
    } catch (error) {
      lastError = error;
      if (attempt === EDITORIAL_MAX_REPAIR_ATTEMPTS) {
        break;
      }
      workingPayload = await repairEditorialPackage(issue, workingPayload, error.invalidFields);
    }
  }

  throw lastError;
}

async function initializeEditorialStorage(dbPool) {
  if (dbPool.dialect === "postgres") {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS editorial_packages (
        id BIGSERIAL PRIMARY KEY,
        run_date DATE NOT NULL,
        category VARCHAR(100),
        topic_title TEXT,
        primary_headline TEXT,
        sub_headline TEXT,
        executive_summary TEXT,
        deep_dive TEXT,
        deep_dive_word_count INT,
        raw_response TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await dbPool.query("CREATE INDEX IF NOT EXISTS idx_editorial_packages_run_date ON editorial_packages (run_date)");
  } else {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS editorial_packages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        run_date DATE NOT NULL,
        category VARCHAR(100),
        topic_title TEXT,
        primary_headline TEXT,
        sub_headline TEXT,
        executive_summary MEDIUMTEXT,
        deep_dive LONGTEXT,
        deep_dive_word_count INT,
        raw_response LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_editorial_packages_run_date (run_date)
      )
    `);
  }
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

async function countEditorialsForDate(dbPool, dateStr) {
  const [rows] = await dbPool.query(
    "SELECT COUNT(*) AS total FROM editorial_packages WHERE run_date = ?",
    [dateStr]
  );
  return Number(rows[0]?.total || 0);
}

async function listEditorials(dbPool, { limit = 15 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 15, 50));
  const [rows] = await dbPool.query(
    `
      SELECT *
      FROM editorial_packages
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `,
    [safeLimit]
  );

  return rows.map((row) => ({
    id: row.id,
    category: row.category || "Editorial",
    title: row.primary_headline,
    secondary_headline: row.sub_headline,
    summary: row.executive_summary,
    article: row.deep_dive,
    state: row.category || "",
    subheadings: [],
    fetched_at: row.created_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

async function syncEditorials(dbPool, { limit = EDITORIAL_DAILY_LIMIT, force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastEditorialSyncAt < EDITORIAL_MIN_SYNC_INTERVAL_MS) {
    return {
      status: "Skipped",
      message: "Editorial sync is throttled to avoid excessive Gemini calls.",
      saved_count: 0,
      skipped_count: 0,
      failed_count: 0,
    };
  }
  lastEditorialSyncAt = now;

  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || EDITORIAL_DAILY_LIMIT, EDITORIAL_DAILY_LIMIT));
  const runDate = todayDateString();
  const existingCount = await countEditorialsForDate(dbPool, runDate);
  if (!force && existingCount >= safeLimit) {
    return {
      status: "Skipped",
      message: `Today's editorial packages already exist (${existingCount}).`,
      run_date: runDate,
      already_today: existingCount,
      saved_count: 0,
      skipped_count: 0,
      failed_count: 0,
    };
  }

  let discovery;
  try {
    discovery = await discoverTodayIssues();
  } catch (error) {
    return {
      status: "Error",
      message: `Editorial discovery failed: ${error.message}`,
      run_date: runDate,
      saved_count: 0,
      skipped_count: 0,
      failed_count: 0,
    };
  }

  const issuesToWrite = discovery.issues.slice(0, safeLimit);
  const results = [];

  for (const issue of issuesToWrite) {
    try {
      const built = await generateEditorialPackage(issue);
      const [insertResult] = await dbPool.execute(
        dbPool.dialect === "postgres"
          ? `
            INSERT INTO editorial_packages (
              run_date, category, topic_title, primary_headline, sub_headline, executive_summary, deep_dive, deep_dive_word_count, raw_response
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
          `
          : `
            INSERT INTO editorial_packages (
              run_date, category, topic_title, primary_headline, sub_headline, executive_summary, deep_dive, deep_dive_word_count, raw_response
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        [
          runDate,
          issue.category,
          issue.topic_title,
          built.primary_headline,
          built.sub_headline,
          built.executive_summary,
          built.deep_dive,
          built.deep_dive_word_count,
          JSON.stringify(built),
        ]
      );

      results.push({
        status: "Success",
        id: insertResult.insertId || insertResult.rows?.[0]?.id || null,
        category: issue.category,
        title: built.primary_headline,
        word_count: built.deep_dive_word_count,
      });
    } catch (error) {
      results.push({ status: "Error", category: issue.category, title: issue.topic_title, message: error.message });
    }
  }

  return {
    status: results.some((result) => result.status === "Success") ? "Success" : "Error",
    run_date: runDate,
    requested: issuesToWrite.length,
    already_today: existingCount,
    saved_count: results.filter((result) => result.status === "Success").length,
    skipped_count: 0,
    failed_count: results.filter((result) => result.status === "Error").length,
    results,
  };
}

module.exports = {
  EDITORIAL_DAILY_LIMIT,
  initializeEditorialStorage,
  listEditorials,
  syncEditorials,
  __test: {
    discoverTodayIssues,
    generateEditorialPackage,
    repairEditorialPackage,
    validateEditorialPackage,
    inspectPartWordCount,
    inspectDeepDive,
    parseJsonResponse,
    countWords,
    callGeminiGenerateContent,
    buildEditorialWriterPrompt,
  },
};

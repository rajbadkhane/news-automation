const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const AI_PROMPT_VERSION = "hindi-ui-news-v7-structured-flatten";
const HINDI_NEWS_CATEGORIES = [
  "राजनीति",
  "सरकारी योजना",
  "अर्थव्यवस्था",
  "शिक्षा",
  "स्वास्थ्य",
  "प्रौद्योगिकी",
  "कानून व्यवस्था",
  "कृषि",
  "बुनियादी ढांचा",
  "राष्ट्रीय",
];
const AI_REWRITE_SYSTEM_PROMPT = `आप एक वरिष्ठ खोजी हिंदी पत्रकार हैं, जो राष्ट्रीय स्तर के अखबार के कड़े संपादकीय मानकों के लिए लिखते हैं।

काम: दिए गए शीर्षक, संक्षिप्त विवरण और कच्चे समाचार इनपुट को 100, 300 और 600 शब्दों के प्रकाशन योग्य हिंदी समाचार लेखों में बदलना। आउटपुट केवल वैध JSON हो।

सामान्य नियम:
- केवल दिए गए कच्चे इनपुट, लिंक, चित्र और उपलब्ध संदर्भ पर आधारित रहें।
- कोई तथ्य, आंकड़ा, उद्धरण, तारीख, आरोप या दावा न गढ़ें। यदि व्यापक नीति संदर्भ दें तो उसे सामान्य और सावधान भाषा में रखें।
- आउटपुट 100 प्रतिशत हिंदी हो। संस्था, कानून, योजना या तकनीकी नाम मूल रूप में रह सकते हैं।
- JSON keys अंग्रेजी में रहेंगी, लेकिन JSON values पूरी तरह हिंदी में लिखें।
- "Main Heading", "Photo Caption", "Full News Article Body" जैसे अंग्रेजी निर्देशों को output में न लिखें। उनकी जगह वास्तविक हिंदी शीर्षक, हिंदी फोटो कैप्शन और हिंदी article body लिखें।
- केवल section label "Subheadings" को इसी अंग्रेजी spelling में रखें, क्योंकि frontend/parser को वही label चाहिए। बाकी सभी content हिंदी रहे।
- heading, subheading, caption और article body में अंग्रेजी वाक्य न आएं।
- किसी समाचार एजेंसी, प्रकाशन, अखबार, टीवी चैनल, वेबसाइट, पोर्टल या मैगजीन का नाम article text, title, subheading, caption, keywords या source में न लिखें।
- विशेष रूप से ऐसे नामों से बचें: आज तक, टाइम्स ऑफ इंडिया, हिंदुस्तान टाइम्स, द हिंदू, इंडिया टुडे, पत्रिका, मैगजीन, पीटीआई, एएनआई, रायटर्स, एपी, एएफपी।
- किसी भी जगह em dash या en dash जैसे चिन्ह न लगाएं।
- शैली साफ, तथ्य आधारित, संतुलित और PIB तथा CBC दिशानिर्देशों के अनुरूप हो।
- क्लिकबेट, राय, अतिशयोक्ति, HTML, मार्कडाउन, बुलेट सूची और डुप्लिकेट सामग्री से बचें।

title नियम:
- केवल एक मुख्य शीर्षक दें।
- 10 से 16 शब्द।
- असरदार, लयदार, तात्कालिक और फ्रंट-पेज जैसा हो।
- समाचार एजेंसी या प्रकाशन का नाम न हो।

short_100 नियम:
- यह 80 से 100 शब्दों का बहुत संक्षिप्त breaking-news style article हो।
- पूरे short_100 output में 100 शब्दों से अधिक न हों।
- हर शब्द जरूरी हो, कोई अतिरिक्त व्याख्या न हो।
- नीचे दी गई संरचना और क्रम बिल्कुल रखें:
1. Main Heading
2. Subheading Section Label: Subheadings
3. Subheading 1 numbered
4. Subheading 2 numbered
5. Subheading 3 numbered
6. Subheading 4 numbered
7. Photo Caption immediately after subheading 4
8. Full News Article Body after photo caption
- short_100 में "Subheadings" label ठीक इसी तरह हो।
- Main Heading 8 से 14 शब्दों का sharp, urgent और attention-grabbing हो।
- चारों subheading numbered format में हों: 1. 2. 3. 4.
- हर subheading 10 से 14 शब्दों की mini-headline हो, action और context के साथ।
- Photo Caption एक छोटी factual line हो।
- article body सिर्फ 1 बहुत tight paragraph हो और compressed form में 5W1H शामिल करे।
- सिर्फ 1 sharp stat या fact जोड़ें, वह भी relevant हो तो।

medium_300 नियम:
- यह 300 से 350 शब्दों का संक्षिप्त लेकिन high-impact article हो।
- किसी भी हालत में 350 शब्दों से अधिक न हो।
- नीचे दी गई संरचना और क्रम बिल्कुल रखें:
1. Main Heading
2. Subheading Section Label: Subheadings
3. Subheading 1 numbered
4. Subheading 2 numbered
5. Subheading 3 numbered
6. Subheading 4 numbered
7. Photo Caption immediately after subheading 4
8. Full News Article Body after photo caption
- medium_300 में "Subheadings" label ठीक इसी तरह हो।
- चारों subheading numbered format में हों: 1. 2. 3. 4.
- हर subheading 14 से 20 शब्दों की पूरी mini-headline हो, जिसमें action, context और consequence हो।
- Photo Caption छोटा, तथ्यात्मक और पत्रकारिता शैली में हो।
- article body inverted pyramid में हो: पहले 5W1H, फिर विवरण, फिर संदर्भ, फिर असर।
- body शुरू होने से पहले कोई अलग पैराग्राफ न हो।
- अंत मजबूत और आगे की दिशा दिखाने वाली पंक्ति से हो।

long_500 नियम:
- यह 600 शब्दों का संस्करण है। field name compatibility के लिए long_500 ही रहेगा।
- पूर्ण long_500 अधिकतम 600 शब्द, लक्ष्य 520 से 600 शब्द।
- नीचे दी गई संरचना और क्रम बिल्कुल रखें:
1. Main Heading
2. Subheading Section Label: Subheadings
3. Subheading 1 numbered
4. Subheading 2 numbered
5. Subheading 3 numbered
6. Subheading 4 numbered
7. Photo Caption immediately after subheading 4
8. Full News Article Body after photo caption
- long_500 में "Subheadings" label ठीक इसी तरह हो।
- चारों subheading numbered format में हों: 1. 2. 3. 4.
- हर subheading 14 से 20 शब्दों की पूरी mini-headline हो, जिसमें action, context और consequence हो।
- Photo Caption छोटा, तथ्यात्मक और पत्रकारिता शैली में हो।
- article body inverted pyramid में हो: पहले सबसे जरूरी तथ्य, फिर विवरण, फिर पृष्ठभूमि, फिर विश्लेषण और असर।
- body शुरू होने से पहले कोई अलग पैराग्राफ न हो।
- अंत मजबूत और आगे की दिशा दिखाने वाली पंक्ति से हो।

डेटा नियम:
- तीनों संस्करण अलग गहराई के हों, एक-दूसरे की कॉपी न हों।
- state सामग्री या स्रोत से पहचानें। न मिले तो "राष्ट्रीय" लिखें।
- category केवल इनमें से एक हो: राजनीति, सरकारी योजना, अर्थव्यवस्था, शिक्षा, स्वास्थ्य, प्रौद्योगिकी, कानून व्यवस्था, कृषि, बुनियादी ढांचा, राष्ट्रीय।
- keywords में 3 से 5 हिंदी कीवर्ड दें।
- source में प्रकाशन, एजेंसी, चैनल, वेबसाइट या मैगजीन का नाम न दें। "आधिकारिक स्रोत" या विषय आधारित सामान्य स्रोत लिखें।
- image_url वैध और दिया गया हो तो उसे बिना बदले लौटाएं।
- image_url खाली हो तो image_url खाली रखें और image_prompt बनाएं: "भारत में {state} से संबंधित समाचार दृश्य: {headline}, यथार्थवादी फोटो पत्रकारिता शैली, प्राकृतिक रोशनी, बिना टेक्स्ट, 16:9"
- image_url हो तो image_prompt खाली स्ट्रिंग रखें।
- कोई भी JSON field गायब न हो।

केवल वैध JSON लौटाएं:
{
  "title": "",
  "short_100": "",
  "medium_300": "",
  "long_500": "",
  "keywords": [],
  "category": "",
  "state": "",
  "image_url": "",
  "image_prompt": "",
  "source": "",
  "link": ""
}`;

const AI_REWRITE_SIZE_OVERRIDE = `
OUTPUT SIZE OVERRIDE:
- short_100 must be a complete raw Hindi article version of 80 to 100 words.
- medium_300 must be a complete raw Hindi article version of 280 to 320 words.
- long_500 must be a complete raw Hindi article version of 520 to 600 words. It is the 600-word version; the field name remains long_500 only for database compatibility.
- Do not create or change the image. If the input image URL exists, return the exact same image URL.
- Keep these three versions in the JSON and make them independently publishable raw article bodies.
`;

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
        ui_title TEXT,
        ui_short_100 TEXT,
        ui_medium_300 TEXT,
        ui_long_500 TEXT,
        ui_keywords_json TEXT,
        ui_category VARCHAR(100),
        ui_state VARCHAR(150),
        ui_image_url TEXT,
        ui_image_prompt TEXT,
        ui_source TEXT,
        ui_link TEXT,
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
        ui_title TEXT,
        ui_short_100 MEDIUMTEXT,
        ui_medium_300 MEDIUMTEXT,
        ui_long_500 LONGTEXT,
        ui_keywords_json TEXT,
        ui_category VARCHAR(100),
        ui_state VARCHAR(150),
        ui_image_url TEXT,
        ui_image_prompt TEXT,
        ui_source TEXT,
        ui_link TEXT,
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
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_title TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_short_100 TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_medium_300 TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_long_500 TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_keywords_json TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_category VARCHAR(100)",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_state VARCHAR(150)",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_image_url TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_image_prompt TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_source TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_link TEXT",
        "CREATE UNIQUE INDEX unique_delivery_slug ON ai_news_rewrites (delivery_slug)",
      ]
    : [
        "ALTER TABLE ai_news_rewrites ADD COLUMN publication_status VARCHAR(20) NOT NULL DEFAULT 'draft'",
        "ALTER TABLE ai_news_rewrites ADD COLUMN published_at TIMESTAMP NULL DEFAULT NULL",
        "ALTER TABLE ai_news_rewrites ADD COLUMN published_by VARCHAR(150) NULL",
        "ALTER TABLE ai_news_rewrites ADD COLUMN delivery_slug VARCHAR(191) NULL",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_title TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_short_100 MEDIUMTEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_medium_300 MEDIUMTEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_long_500 LONGTEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_keywords_json TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_category VARCHAR(100)",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_state VARCHAR(150)",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_image_url TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_image_prompt TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_source TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_link TEXT",
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

function stringifyGeneratedValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stringifyGeneratedValue(item)).filter(Boolean).join("\n");
  }

  if (value && typeof value === "object") {
    const preferredKeys = [
      "title",
      "heading",
      "main_heading",
      "headline",
      "subheading_label",
      "subheadings",
      "photo_caption",
      "caption",
      "body",
      "article",
      "article_body",
      "text",
      "content",
    ];
    const orderedValues = [];
    const usedKeys = new Set();

    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        orderedValues.push(stringifyGeneratedValue(value[key]));
        usedKeys.add(key);
      }
    }

    for (const [key, item] of Object.entries(value)) {
      if (!usedKeys.has(key)) {
        orderedValues.push(stringifyGeneratedValue(item));
      }
    }

    return orderedValues.filter(Boolean).join("\n");
  }

  return String(value || "");
}

function cleanGeneratedText(value) {
  return stringifyGeneratedValue(value)
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/[—–]/g, "-")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removePublisherMentions(value) {
  return cleanGeneratedText(value)
    .replace(/\b(?:Aaj Tak|Times of India|Hindustan Times|The Hindu|India Today|Reuters|ANI|PTI|Associated Press|AP|AFP|BBC|CNN)\b/gi, "")
    .replace(/(?:आज तक|टाइम्स ऑफ इंडिया|हिंदुस्तान टाइम्स|द हिंदू|इंडिया टुडे|रायटर्स|एएनआई|पीटीआई|एपी|एएफपी|बीबीसी|सीएनएन|समाचार एजेंसी|न्यूज एजेंसी|मैगजीन|पत्रिका)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function cleanSummaryList(values) {
  return (Array.isArray(values) ? values : [])
    .map((item) => cleanGeneratedText(item))
    .filter(Boolean);
}

function isLikelyValidImageUrl(value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.startsWith("data:")) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function normalizeUiHindiPayload(payload) {
  const normalized = payload && typeof payload === "object" ? payload : {};
  const keywords = Array.isArray(normalized.keywords)
    ? normalized.keywords.map((item) => removePublisherMentions(item)).filter(Boolean).slice(0, 5)
    : [];
  const imageUrl = isLikelyValidImageUrl(normalized.image_url) ? String(normalized.image_url).trim() : "";

  return {
    title: removePublisherMentions(normalized.title),
    short_100: removePublisherMentions(normalized.short_100),
    medium_300: removePublisherMentions(normalized.medium_300),
    long_500: removePublisherMentions(normalized.long_500),
    keywords,
    category: HINDI_NEWS_CATEGORIES.includes(normalized.category) ? normalized.category : "राष्ट्रीय",
    state: removePublisherMentions(normalized.state) || "राष्ट्रीय",
    image_url: imageUrl,
    image_prompt: imageUrl ? "" : removePublisherMentions(normalized.image_prompt),
    source: removePublisherMentions(normalized.source) || "आधिकारिक स्रोत",
    link: String(normalized.link || "").trim(),
  };
}

function buildImagePrompt(title, state) {
  return `भारत में ${state || "राष्ट्रीय"} से संबंधित समाचार दृश्य: ${title || "समाचार"}, यथार्थवादी फोटो पत्रकारिता शैली, प्राकृतिक रोशनी, बिना टेक्स्ट, 16:9`;
}

function hasHindiText(value) {
  return /[\u0900-\u097F]/.test(String(value || ""));
}

function hasUiHindiShape(payload) {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      Object.prototype.hasOwnProperty.call(payload, "short_100") &&
      Object.prototype.hasOwnProperty.call(payload, "medium_300") &&
      Object.prototype.hasOwnProperty.call(payload, "long_500")
  );
}

function createLegacyPayloadFromUiHindi(uiHindi) {
  const summary = uiHindi.keywords.length ? uiHindi.keywords : [uiHindi.category, uiHindi.state].filter(Boolean);
  return {
    english: {
      headline: uiHindi.title,
      top_summary: summary,
      short_description: uiHindi.short_100,
      long_description: uiHindi.long_500,
      what_to_watch_next: uiHindi.medium_300,
    },
    hindi: {
      headline: uiHindi.title,
      top_summary: summary,
      short_description: uiHindi.short_100,
      long_description: uiHindi.long_500,
      what_to_watch_next: uiHindi.medium_300,
    },
  };
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

  if (hasUiHindiShape(payload)) {
    const uiHindi = normalizeUiHindiPayload(payload);
    const requiredFields = ["title", "short_100", "medium_300", "long_500", "category", "state", "source", "link"];
    for (const field of requiredFields) {
      if (!uiHindi[field]) {
        throw new Error(`Gemini response is missing ${field}.`);
      }
    }

    for (const field of ["title", "short_100", "medium_300", "long_500"]) {
      if (!hasHindiText(uiHindi[field])) {
        throw new Error(`Gemini response field ${field} is not Hindi.`);
      }
    }

    if (!uiHindi.image_url && !uiHindi.image_prompt) {
      uiHindi.image_prompt = buildImagePrompt(uiHindi.title, uiHindi.state);
    }

    return {
      ...createLegacyPayloadFromUiHindi(uiHindi),
      ui_hindi: uiHindi,
    };
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
  const normalizedPayload = hasUiHindiShape(payload) ? validateAiPayload(payload) : payload;
  const english = normalizedPayload.english || {};
  const hindi = normalizedPayload.hindi || {};
  const uiHindi = normalizedPayload.ui_hindi || (hasUiHindiShape(payload) ? normalizeUiHindiPayload(payload) : null);

  await dbPool.execute(
    dbPool.dialect === "postgres"
      ? `
          INSERT INTO ai_news_rewrites (
            news_id, model_name, prompt_version, source_url, source_title, source_excerpt,
            english_headline, english_top_summary, english_short_description, english_long_description, english_what_to_watch_next,
            hindi_headline, hindi_top_summary, hindi_short_description, hindi_long_description, hindi_what_to_watch_next,
            ui_title, ui_short_100, ui_medium_300, ui_long_500, ui_keywords_json, ui_category, ui_state,
            ui_image_url, ui_image_prompt, ui_source, ui_link,
            raw_response
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            ui_title = EXCLUDED.ui_title,
            ui_short_100 = EXCLUDED.ui_short_100,
            ui_medium_300 = EXCLUDED.ui_medium_300,
            ui_long_500 = EXCLUDED.ui_long_500,
            ui_keywords_json = EXCLUDED.ui_keywords_json,
            ui_category = EXCLUDED.ui_category,
            ui_state = EXCLUDED.ui_state,
            ui_image_url = EXCLUDED.ui_image_url,
            ui_image_prompt = EXCLUDED.ui_image_prompt,
            ui_source = EXCLUDED.ui_source,
            ui_link = EXCLUDED.ui_link,
            raw_response = EXCLUDED.raw_response,
            updated_at = CURRENT_TIMESTAMP
        `
      : `
          INSERT INTO ai_news_rewrites (
            news_id, model_name, prompt_version, source_url, source_title, source_excerpt,
            english_headline, english_top_summary, english_short_description, english_long_description, english_what_to_watch_next,
            hindi_headline, hindi_top_summary, hindi_short_description, hindi_long_description, hindi_what_to_watch_next,
            ui_title, ui_short_100, ui_medium_300, ui_long_500, ui_keywords_json, ui_category, ui_state,
            ui_image_url, ui_image_prompt, ui_source, ui_link,
            raw_response
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            ui_title = VALUES(ui_title),
            ui_short_100 = VALUES(ui_short_100),
            ui_medium_300 = VALUES(ui_medium_300),
            ui_long_500 = VALUES(ui_long_500),
            ui_keywords_json = VALUES(ui_keywords_json),
            ui_category = VALUES(ui_category),
            ui_state = VALUES(ui_state),
            ui_image_url = VALUES(ui_image_url),
            ui_image_prompt = VALUES(ui_image_prompt),
            ui_source = VALUES(ui_source),
            ui_link = VALUES(ui_link),
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
      uiHindi?.title || null,
      uiHindi?.short_100 || null,
      uiHindi?.medium_300 || null,
      uiHindi?.long_500 || null,
      JSON.stringify(Array.isArray(uiHindi?.keywords) ? uiHindi.keywords : []),
      uiHindi?.category || null,
      uiHindi?.state || null,
      uiHindi?.image_url || null,
      uiHindi?.image_prompt || null,
      uiHindi?.source || null,
      uiHindi?.link || null,
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
    const removePatternMatches = (value, patterns) => {
      let output = String(value || "");
      for (const pattern of patterns) {
        output = output.replace(pattern, " ");
      }
      return normalize(output);
    };
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
      /©\s*2006-20\d{2}[\s\S]*$/i,
      /जनसम्पर्क विभाग[\s\S]*$/i,
      /जिले के समाचार[\s\S]*$/i,
      /मंत्रिपरिषद[\s\S]*$/i,
      /डायरेक्टरी[\s\S]*$/i,
      /e-संदेश[\s\S]*$/i,
      /स्पेशल[\s\S]*$/i,
      /भोपाल.*462003[\s\S]*$/i,
    ];
    const ddNoisePatterns = [
      /tweets by ddnewslive/i,
      /your browser does not support javascript/i,
      /\b\d+\s*(mins?|minutes?|hours?|days?) ago\b/i,
      /ministry of [a-z &-]+/i,
      /government sources have clarified[\s\S]*$/i,
      /shared responsibility, stronger outcomes[\s\S]*$/i,
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
    const sourceSpecificNoisePatterns = articleHost.includes("mpinfo.org")
      ? mpInfoNoisePatterns
      : articleHost.includes("ddnews.gov.in")
        ? ddNoisePatterns
        : [];
    const activeNoisePatterns = [...siteNoisePatterns, ...sourceSpecificNoisePatterns];

    const title =
      document.querySelector('meta[property="og:title"]')?.content ||
      document.querySelector("title")?.innerText ||
      document.title ||
      "";

    const metaDescription =
      document.querySelector('meta[name="description"]')?.content ||
      document.querySelector('meta[property="og:description"]')?.content ||
      "";

    for (const selector of [
      "header",
      "footer",
      "nav",
      "aside",
      ".sidebar",
      ".widget",
      ".social-share",
      ".share-tools",
      ".related-posts",
      ".recommended",
      ".newsletter",
      ".comment-form",
      ".comments",
      ".breadcrumb",
      ".advertisement",
      ".ads",
      ".twitter-timeline",
      ".instagram-media",
      ".elementor-widget-sidebar",
    ]) {
      document.querySelectorAll(selector).forEach((node) => node.remove());
    }

    document.querySelectorAll("script, style, noscript, iframe").forEach((node) => node.remove());

    const candidateRoots = [
      document.querySelector("article .entry-content"),
      document.querySelector(".entry-content"),
      document.querySelector(".post-content"),
      document.querySelector(".article-content"),
      document.querySelector(".story-content"),
      document.querySelector("[itemprop='articleBody']"),
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
        const text = removePatternMatches(node.textContent, sourceSpecificNoisePatterns);
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

    const cleanedTitle = removePatternMatches(title, sourceSpecificNoisePatterns);
    const cleanedMetaDescription = removePatternMatches(metaDescription, sourceSpecificNoisePatterns);
    const combinedText = [cleanedTitle, cleanedMetaDescription, ...paragraphs].filter(Boolean).join("\n\n");

    return {
      title: cleanedTitle,
      metaDescription: cleanedMetaDescription,
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
${AI_REWRITE_SIZE_OVERRIDE}

RAW ARTICLE DETAILS
Category: ${articleRecord.category || "uncategorized"}
Feed source: ${articleRecord.feed_source || "unknown"}
Original title: ${articleRecord.title || ""}
Original URL: ${articleRecord.source_url}
Image URL: ${articleRecord.image_link || ""}
Source name: ${articleRecord.feed_source || "RSS"}

RAW ARTICLE TEXT
${truncateText(articleText.combinedText, 14000)}`;

  let rawText = "";
  let parsed = null;
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptPrompt = attempt === 0
      ? prompt
      : `${prompt}

कड़ा सुधार निर्देश: पिछला उत्तर अस्वीकार हुआ क्योंकि कोई field पूरी तरह हिंदी में नहीं थी। अब सभी JSON values हिंदी में लिखें। केवल "Subheadings" label अंग्रेजी spelling में रह सकता है।`;

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
              parts: [{ text: attemptPrompt }],
            },
          ],
          generationConfig: {
            temperature: attempt === 0 ? 0.45 : 0.2,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const payload = await response.json();

    if (!response.ok) {
      lastError = new Error(payload?.error?.message || `Gemini request failed with status ${response.status}.`);
      if (response.status === 429 || response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
      throw lastError;
    }

    rawText =
      payload?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("\n")
        .trim() || "";

    try {
      parsed = validateAiPayload(parseJsonResponse(rawText));
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 0 && /not Hindi|missing|JSON/i.test(error.message)) {
        continue;
      }
      throw error;
    }
  }

  if (!parsed) {
    throw lastError || new Error("Gemini did not return a valid Hindi rewrite.");
  }

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

  const parseUiHindi = () => {
    if (record.ui_short_100 || record.ui_medium_300 || record.ui_long_500) {
      const uiHindi = normalizeUiHindiPayload({
        title: record.ui_title || record.hindi_headline || record.english_headline || record.source_title,
        short_100: record.ui_short_100,
        medium_300: record.ui_medium_300,
        long_500: record.ui_long_500,
        keywords: parseSummary(record.ui_keywords_json),
        category: record.ui_category,
        state: record.ui_state,
        image_url: record.ui_image_url,
        image_prompt: record.ui_image_prompt,
        source: record.ui_source,
        link: record.ui_link || record.source_url,
      });
      if (!uiHindi.image_url && !uiHindi.image_prompt) {
        uiHindi.image_prompt = buildImagePrompt(uiHindi.title, uiHindi.state);
      }
      return uiHindi;
    }

    try {
      const parsed = JSON.parse(record.raw_response || "{}");
      if (hasUiHindiShape(parsed)) {
        const uiHindi = normalizeUiHindiPayload(parsed);
        if (!uiHindi.image_url && !uiHindi.image_prompt) {
          uiHindi.image_prompt = buildImagePrompt(uiHindi.title, uiHindi.state);
        }
        return uiHindi;
      }
    } catch {
      // Older records may contain non-JSON or legacy JSON only.
    }

    const fallbackTitle = cleanGeneratedText(record.hindi_headline || record.english_headline || record.source_title);
    const fallbackState = "राष्ट्रीय";
    return {
      title: fallbackTitle,
      short_100: cleanGeneratedText(record.hindi_short_description || record.english_short_description),
      medium_300: cleanGeneratedText(record.hindi_what_to_watch_next || record.english_what_to_watch_next),
      long_500: cleanGeneratedText(record.hindi_long_description || record.english_long_description),
      keywords: cleanSummaryList(parseSummary(record.hindi_top_summary || record.english_top_summary)).slice(0, 5),
      category: "राष्ट्रीय",
      state: fallbackState,
      image_url: "",
      image_prompt: buildImagePrompt(fallbackTitle, fallbackState),
      source: cleanGeneratedText(record.source_title || "समाचार स्रोत"),
      link: record.source_url || "",
    };
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
    ui_hindi: parseUiHindi(),
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
  if (rewrite?.ui_hindi) {
    if (isLikelyValidImageUrl(record.news_image_link)) {
      rewrite.ui_hindi.image_url = record.news_image_link;
    }

    if (rewrite.ui_hindi.image_url) {
      rewrite.ui_hindi.image_prompt = "";
    } else if (!rewrite.ui_hindi.image_prompt) {
      rewrite.ui_hindi.image_prompt = buildImagePrompt(rewrite.ui_hindi.title, rewrite.ui_hindi.state);
    }
  }

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

async function createOrUpdateRewriteForRecord(dbPool, articleRecord, createBrowserPage, afterSave = null) {
  const { browser, page } = await createBrowserPage();

  try {
    let articleText = await withTransientRetry(
      async () => extractArticleTextFromPage(page, articleRecord.source_url)
    );

    const scrapedText = normalizeWhitespace(articleRecord.scraped_content_text || "");
    if ((!articleText.combinedText || articleText.combinedText.length < 120) && scrapedText.length >= 120) {
      articleText = {
        title: articleRecord.title || articleRecord.scraped_subtitle || "",
        metaDescription: articleRecord.scraped_subtitle || "",
        paragraphs: scrapedText
          .split(/\n{2,}|(?<=[।.!?])\s+/)
          .map((paragraph) => normalizeWhitespace(paragraph))
          .filter((paragraph) => paragraph.length >= 40)
          .slice(0, 25),
        combinedText: scrapedText,
      };
    }

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

    const publishedRewrite = await setAiRewritePublicationStatus(dbPool, savedRewrite.id, {
      status: "published",
      publishedBy: "ai-system",
    });

    if (typeof afterSave === "function") {
      try {
        await afterSave(publishedRewrite);
      } catch (error) {
        console.warn(`Retention cleanup trigger after AI save failed: ${error.message}`);
      }
    }

    return publishedRewrite;
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
      image_link: formatted.ui_hindi?.image_url || formatted.news?.image_link || null,
      image_source: formatted.news?.image_source || null,
    },
    raw_articles: {
      words_100: formatted.ui_hindi?.short_100 || formatted.hindi?.short_description || "",
      words_300: formatted.ui_hindi?.medium_300 || formatted.hindi?.what_to_watch_next || "",
      words_600: formatted.ui_hindi?.long_500 || formatted.hindi?.long_description || "",
      words_500: formatted.ui_hindi?.long_500 || formatted.hindi?.long_description || "",
    },
    ui_hindi: {
      ...(formatted.ui_hindi || {}),
      image_url: formatted.ui_hindi?.image_url || formatted.news?.image_link || "",
      image_prompt:
        formatted.ui_hindi?.image_url || formatted.news?.image_link
          ? ""
          : formatted.ui_hindi?.image_prompt || buildImagePrompt(formatted.hindi?.headline, "राष्ट्रीय"),
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

async function runAiRewriteCycleForCategories({ dbPool, categories, createBrowserPage, afterRewriteSaved = null }) {
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

      const savedRewrite = await createOrUpdateRewriteForRecord(
        dbPool,
        articleRecord,
        createBrowserPage,
        afterRewriteSaved
      );
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

function registerAiRewriteRoutes(app, { getDbPool, createBrowserPage, normalizeCategory, afterRewriteSaved = null }) {
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

        const savedRewrite = await createOrUpdateRewriteForRecord(
          dbPool,
          articleRecord,
          createBrowserPage,
          afterRewriteSaved
        );

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
          const savedRewrite = await createOrUpdateRewriteForRecord(
            dbPool,
            articleRecord,
            createBrowserPage,
            afterRewriteSaved
          );

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
  createOrUpdateRewriteForRecord,
  initializeAiRewriteStorage,
  findDeliveredAiRewrite,
  listAiRewrites,
  listDeliveredAiRewrites,
  registerAiRewriteRoutes,
  runAiRewriteCycleForCategories,
  setAiRewritePublicationStatus,
};

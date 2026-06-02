const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const {
  DEFAULT_UNIFIED_CATEGORY,
  UNIFIED_NEWS_CATEGORIES,
  normalizeCategory: normalizeUnifiedCategory,
  normalizeCategoryToken,
} = require("./config/news-categories");
const AI_PROMPT_VERSION = "hindi-ui-news-v8-journalist-grade-ge";
const HINDI_NEWS_CATEGORIES = UNIFIED_NEWS_CATEGORIES;
const DEFAULT_HINDI_NEWS_CATEGORY = DEFAULT_UNIFIED_CATEGORY;
const AI_REWRITE_SYSTEM_PROMPT = `भूमिका: आप राष्ट्रीय समाचार एजेंसी GE News Hub के Lead Investigative Reporter हैं। आपका काम न्यूनतम इनपुट को PCI यानी Press Council of India की मर्यादा, तथ्यात्मक संतुलन और उच्च-विश्वसनीयता वाली हिंदी रिपोर्ट में बदलना है।

काम: दिए गए शीर्षक, संक्षिप्त विवरण, लिंक, चित्र और कच्चे समाचार इनपुट को 100, 300 और 600 शब्दों के अलग-अलग प्रकाशन योग्य हिंदी समाचार संस्करणों में बदलना। आउटपुट केवल वैध JSON हो।

मुख्य संपादकीय नियम:
- GE News Hub को ही एकमात्र रिपोर्टिंग संस्था मानें। किसी अन्य समाचार एजेंसी, प्रकाशन, अखबार, टीवी चैनल, वेबसाइट, पोर्टल या मैगजीन का नाम article text, title, subheading, caption, keywords या source में न लिखें।
- विशेष रूप से ऐसे नामों से बचें: आज तक, टाइम्स ऑफ इंडिया, हिंदुस्तान टाइम्स, द हिंदू, इंडिया टुडे, पत्रिका, मैगजीन, पीटीआई, एएनआई, रायटर्स, एपी, एएफपी।
- कोई तथ्य, आंकड़ा, तारीख, आरोप, एफआईआर विवरण, गिरफ्तारी, मौत, घायल, नुकसान, कानूनी कार्रवाई या उद्धरण न गढ़ें।
- यदि raw data पतला हो तो रिपोर्टर की तरह विस्तार करें, लेकिन केवल सुरक्षित संदर्भ, पृष्ठभूमि और सावधान भाषा जोड़ें। वास्तविक स्रोत न मिलने पर direct quote न बनाएं।
- विवादित या अपुष्ट बात अपनी ओर से न लिखें। हमेशा ऐसे attribution phrases का प्रयोग करें: "आधिकारिक रिकॉर्ड के अनुसार", "प्रारंभिक जानकारी के अनुसार", "पुलिस के प्रारंभिक बयान के मुताबिक", "प्रशासनिक सूत्रों के अनुसार", "जांच से जुड़े अधिकारियों ने बताया"।
- कम से कम दो attributed official statements शामिल करें। यदि वास्तविक quote उपलब्ध हो तो quotation marks में लिखें। यदि quote उपलब्ध नहीं है तो indirect statement लिखें, जैसे: जिला प्रशासन के अनुसार राहत और जांच की प्रक्रिया जारी है।
- Ground element जरूर जोड़ें, जैसे मौके पर भीड़, पुलिस व्यवस्था, रास्ता बंद, स्थानीय लोगों की प्रतिक्रिया, बचाव कार्य या प्रशासनिक गतिविधि। इसे तभी factual tone में लिखें जब इनपुट से समर्थित हो; वरना "स्थानीय स्तर पर मिली शुरुआती जानकारी के अनुसार" जैसी सावधान भाषा रखें।
- आउटपुट में HTML, markdown heading, required subheading bullets के अलावा अनावश्यक bullets, क्लिकबेट, राय, अतिशयोक्ति और डुप्लिकेट सामग्री न हो।
- किसी भी जगह em dash या en dash जैसे चिन्ह न लगाएं।
- भाषा मुख्य रूप से शुद्ध हिंदी हो। शीर्षक में उर्दू-प्रधान शब्दों से बचें। तकनीकी नाम, संस्था नाम, कानूनी नाम और Agency GE News Hub मूल रूप में रह सकते हैं।

हर article field का अनिवार्य output structure:
पहली पंक्ति: 10 से 20 शब्दों का तथ्यात्मक-काव्यात्मक हिंदी मुख्य शीर्षक, जिसमें घटना साफ दिखे।
दूसरी पंक्ति: Subheadings:
अगली चार पंक्तियां:
• घटना का चौंकाने वाला पहलू
• आधिकारिक बयान या प्रतिक्रिया
• मौके की स्थिति या Ground Reality
• लंबित जांच, कानूनी कार्रवाई या अगला कदम
इसके बाद: Agency GE News Hub से body शुरू करें।
अंतिम पंक्ति: Photo Caption: के बाद ठीक 30 शब्दों का हिंदी caption लिखें, जो घटना के किसी खास दृश्य detail पर केंद्रित हो।

Agency body rules:
- body की शुरुआत "Agency GE News Hub" से ही हो। इसके पहले body में कोई अलग intro न लिखें।
- inverted pyramid अपनाएं। सबसे महत्वपूर्ण, ताजा और असरदार तथ्य पहले आए।
- लंबा तथ्यात्मक वाक्य लिखने के बाद छोटा और असरदार वाक्य रखें।
- कम से कम दो attributed official statements या responses body में आएं।
- "पहला", "दूसरा", "तीसरा" जैसी सूचीबद्ध संरचना से बचें।
- GE News Hub के अलावा किसी दूसरे reporter, agency या publication का उल्लेख न हो।

title field नियम:
- केवल मुख्य शीर्षक दें।
- 10 से 20 शब्द।
- शुद्ध हिंदी, तथ्यात्मक-काव्यात्मक, actual event साफ हो।
- समाचार एजेंसी या प्रकाशन का नाम न हो।

short_100 नियम:
- यह 100 शब्दों का संस्करण है। कुल target 90 से 110 शब्द रखें।
- ऊपर दिया गया पूरा output structure रखें।
- heading 10 से 14 शब्दों का हो।
- चार subheadings बहुत छोटी और अलग angles वाली हों।
- body 1 tight paragraph हो, जिसमें 5W1H, दो compressed attributed references और ground element आए।
- Photo Caption ठीक 30 शब्दों का हो।

medium_300 नियम:
- यह 300 शब्दों का संस्करण है। कुल target 280 से 320 शब्द रखें।
- ऊपर दिया गया पूरा output structure रखें।
- heading 10 से 18 शब्दों का हो।
- चार subheadings 10 से 16 शब्दों की mini-headline हों।
- body 2 से 4 छोटे paragraphs में हो।
- कम से कम दो official attributed statements और एक ground detail जरूर हो।
- Photo Caption ठीक 30 शब्दों का हो।

long_500 नियम:
- यह 600 शब्दों का संस्करण है। field name compatibility के लिए long_500 ही रहेगा।
- कुल target 520 से 600 शब्द रखें।
- ऊपर दिया गया पूरा output structure रखें।
- heading 10 से 20 शब्दों का हो।
- चार subheadings 12 से 20 शब्दों की मजबूत mini-headline हों।
- body 4 से 7 छोटे paragraphs में हो।
- official response, ground reality, legal action, background और public impact को विस्तार से जोड़ें।
- कम से कम दो attributed official statements जरूर हों।
- Photo Caption ठीक 30 शब्दों का हो।

डेटा नियम:
- तीनों संस्करण अलग गहराई के हों, एक-दूसरे की कॉपी न हों।
- state सामग्री या स्रोत से पहचानें। न मिले तो "राष्ट्रीय" लिखें।
- category केवल इनमें से एक हो: National/State, International, Business, Science, Health, Technology, Sports, Entertainment।
- keywords में 3 से 5 हिंदी कीवर्ड दें।
- source में किसी publication या agency का नाम न दें। "GE News Hub रिपोर्ट" या "आधिकारिक स्रोत" लिखें।
- image_url वैध और दिया गया हो तो उसे बिना बदले लौटाएं।
- image_url खाली हो तो image_url और image_prompt दोनों खाली स्ट्रिंग रखें। कोई fallback image या generated image prompt न बनाएं।
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
- short_100 must be a complete journalist-grade GE News Hub Hindi article version of 90 to 110 words.
- medium_300 must be a complete journalist-grade GE News Hub Hindi article version of 280 to 320 words.
- long_500 must be a complete raw Hindi article version of 520 to 600 words. It is the 600-word version; the field name remains long_500 only for database compatibility.
- Each version must contain the required structure: poetic Hindi heading, Subheadings:, four angle subheadings, Agency GE News Hub body, and exactly 30-word Photo Caption.
- Include attribution and official-response language, but do not fabricate direct quotes or unsupported facts.
- Do not create or change the image. If the input image URL exists, return the exact same image URL.
- Keep these three versions in the JSON and make them independently publishable raw article bodies.
`;

const AI_CATEGORY_OVERRIDE = `
CATEGORY OVERRIDE:
- category must be exactly one of: ${HINDI_NEWS_CATEGORIES.join(", ")}.
- Decide category by reading the final regenerated title, short_100, medium_300 and long_500, not by copying the RSS/API/source category.
- Use Madhyapradesh for MP Info district feed, Madhya Pradesh district, Bhopal, Indore, Jabalpur, Gwalior, Ujjain, Rewa, Sagar, Shahdol, Narmadapuram, Chambal and other Madhya Pradesh local/district stories.
- Use National/State for national, state, regional, local, government, policy, administration, public-service and India stories that are not specifically Madhya Pradesh district stories.
- Use International for world, global and foreign stories.
- Use Business for business, finance, economy, market and stock stories.
- Use Science for science, space, research, discoveries, ISRO/NASA and climate science stories.
- Use Health for healthcare, medical, medicine, public health, disease, wellness and hospital stories.
- Use Technology for technology, AI, gadgets, startups, cybersecurity, internet, software and telecom stories.
- Use Sports for sports, cricket, football, hockey and tournament stories.
- Use Entertainment for entertainment, cinema, film, Bollywood, TV and celebrity stories.
`;

const { isDuplicateColumnError, isDuplicateKeyError } = require("./db");
const AI_REWRITE_CANDIDATE_LIMIT = Math.max(
  1,
  Math.min(Number.parseInt(process.env.AI_REWRITE_CANDIDATE_LIMIT || "30", 10), 50)
);
const AI_REWRITES_PER_CATEGORY_RUN = Math.max(
  1,
  Math.min(Number.parseInt(process.env.AI_REWRITES_PER_CATEGORY_RUN || "6", 10) || 6, 15)
);
const AI_REWRITE_AUTO_PUBLISH = !["false", "0", "no"].includes(
  String(process.env.AI_REWRITE_AUTO_PUBLISH || "true").toLowerCase()
);

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
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS ai_rewrite_skips (
        news_id BIGINT PRIMARY KEY,
        reason TEXT,
        attempts INT NOT NULL DEFAULT 1,
        last_error TEXT,
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
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS ai_rewrite_skips (
        news_id INT PRIMARY KEY,
        reason TEXT,
        attempts INT NOT NULL DEFAULT 1,
        last_error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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

function isLikelyDecorativeImageUrl(value) {
  const normalized = String(value || "").toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    normalized.startsWith("data:") ||
    normalized.endsWith(".svg") ||
    normalized.includes("overlay-base64=") ||
    normalized.includes("overlay-width=") ||
    normalized.includes("overlay-align=") ||
    normalized.includes("/overlays/") ||
    normalized.includes("tg-live.png") ||
    /(?:^|[/?&_.-])(?:logo|favicon|icon|sprite|avatar|banner|ads?|advert|placeholder|default|fallback|og-image|brand|branding|no-image|missing-image|image-not-available|profile|attention|qrcode|qr-code|qr|wechat|weibo|follow|subscribe|rhs|promo|sponsor|newsletter|subscription)(?:[/?&_.=-]|$)/.test(normalized) ||
    /(?:theme-assets|img\.etimg\.com\/photo\/msid-|attention\.jpg|share_icon|about-news|gwab|resource\/default\/img\/icon|facebook|twitter|instagram|cdninstagram|fbcdn|twimg|whatsapp|youtube|google-play|play-store|app-store|download-app|mobile-app|store-badge|app-badge)/.test(normalized)
  );
}

function isLikelyValidImageUrl(value) {
  const normalized = String(value || "").trim();
  if (!normalized || isLikelyDecorativeImageUrl(normalized)) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function normalizeCategoryText(value) {
  return normalizeCategoryToken(value);
}

function normalizeSmartNewsCategory(value) {
  return normalizeUnifiedCategory(value);
}

function chooseSmartNewsCategory(payload) {
  const keywordsText = Array.isArray(payload?.keywords) ? payload.keywords.join(" ") : "";
  const exactCategory = normalizeSmartNewsCategory(payload?.category);
  if (exactCategory && exactCategory !== DEFAULT_HINDI_NEWS_CATEGORY) {
    return exactCategory;
  }

  return normalizeUnifiedCategory([
    payload?.title,
    payload?.short_100,
    payload?.medium_300,
    payload?.long_500,
    keywordsText,
    payload?.state,
  ].filter(Boolean).join(" "));
}

function normalizeUiHindiPayload(payload) {
  const normalized = payload && typeof payload === "object" ? payload : {};
  const keywords = Array.isArray(normalized.keywords)
    ? normalized.keywords.map((item) => removePublisherMentions(item)).filter(Boolean).slice(0, 5)
    : [];
  const cleanedPayload = {
    title: removePublisherMentions(normalized.title),
    short_100: removePublisherMentions(normalized.short_100),
    medium_300: removePublisherMentions(normalized.medium_300),
    long_500: removePublisherMentions(normalized.long_500),
    keywords,
    category: normalized.category,
    state: removePublisherMentions(normalized.state) || "राष्ट्रीय",
  };

  return {
    title: cleanedPayload.title,
    short_100: cleanedPayload.short_100,
    medium_300: cleanedPayload.medium_300,
    long_500: cleanedPayload.long_500,
    keywords,
    category: chooseSmartNewsCategory(cleanedPayload),
    state: cleanedPayload.state,
    image_url: "",
    image_prompt: "",
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
      null,
      null,
      uiHindi?.source || null,
      uiHindi?.link || null,
      rawResponse,
    ]
  );

  const savedRewrite = await findAiRewriteByNewsId(dbPool, newsId);
  if (AI_REWRITE_AUTO_PUBLISH && savedRewrite?.id && savedRewrite.publication_status !== "published") {
    const baseSlug = slugifyText(
      savedRewrite.english_headline || savedRewrite.source_title || `rewrite-${savedRewrite.id}`
    ) || `rewrite-${savedRewrite.id}`;
    const deliverySlug = `${baseSlug}-${savedRewrite.id}`;
    await dbPool.execute(
      `
        UPDATE ai_news_rewrites
        SET publication_status = 'published',
            published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
            published_by = COALESCE(published_by, ?),
            delivery_slug = COALESCE(delivery_slug, ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      ["ai-auto", deliverySlug, savedRewrite.id]
    );
    return findAiRewriteByNewsId(dbPool, newsId);
  }

  return savedRewrite;
}

async function findLatestRewriteCandidatesByCategory(dbPool, category, limit = 1) {
  const [rows] = await dbPool.query(
    `
      SELECT
        fn.id, fn.category, fn.feed_source, fn.feed_url, fn.search_query, fn.title, fn.source_url,
        fn.image_link, fn.image_source, fn.source_excerpt, fn.source_content, fn.source_published_at, fn.fetched_at
      FROM fetched_news fn
      LEFT JOIN ai_news_rewrites air ON air.news_id = fn.id
      LEFT JOIN ai_rewrite_skips ars ON ars.news_id = fn.id
      WHERE fn.category = ? AND air.news_id IS NULL AND ars.news_id IS NULL
      ORDER BY fn.id DESC
      LIMIT ?
    `,
    [category, limit]
  );

  return rows;
}

async function recordAiRewriteSkip(dbPool, articleRecord, error, reason = "unreadable_article") {
  const message = truncateText(error?.message || String(error || reason), 1000);

  if (dbPool.dialect === "postgres") {
    await dbPool.execute(
      `
        INSERT INTO ai_rewrite_skips (news_id, reason, attempts, last_error)
        VALUES (?, ?, 1, ?)
        ON CONFLICT (news_id) DO UPDATE SET
          attempts = ai_rewrite_skips.attempts + 1,
          reason = EXCLUDED.reason,
          last_error = EXCLUDED.last_error,
          updated_at = CURRENT_TIMESTAMP
      `,
      [articleRecord.id, reason, message]
    );
    return;
  }

  await dbPool.execute(
    `
      INSERT INTO ai_rewrite_skips (news_id, reason, attempts, last_error)
      VALUES (?, ?, 1, ?)
      ON DUPLICATE KEY UPDATE
        attempts = attempts + 1,
        reason = VALUES(reason),
        last_error = VALUES(last_error),
        updated_at = CURRENT_TIMESTAMP
    `,
    [articleRecord.id, reason, message]
  );
}

async function extractArticleTextFromPage(page, articleUrl) {
  await page.goto(articleUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (typeof page.waitForLoadState === "function") {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
  } else if (typeof page.waitForSelector === "function") {
    await page.waitForSelector("body", { timeout: 5000 }).catch(() => {});
  }

  return page.evaluate(() => {
    if (!document.body) {
      return {
        title: document.title || "",
        metaDescription: "",
        paragraphs: [],
        combinedText: document.title || "",
      };
    }

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

function isSkippableRewriteInputError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("Could not extract enough article text") ||
    message.includes("Waiting for selector") ||
    message.includes("Navigation timeout") ||
    message.includes("ERR_ABORTED") ||
    message.includes("ERR_CONNECTION_RESET") ||
    message.includes("ERR_TIMED_OUT")
  );
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
${AI_CATEGORY_OVERRIDE}

RAW ARTICLE DETAILS
Category: ${articleRecord.category || "uncategorized"}
Feed source: ${articleRecord.feed_source || "unknown"}
Original title: ${articleRecord.title || ""}
Original URL: ${articleRecord.source_url}
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

कड़ा सुधार निर्देश: पिछला उत्तर अस्वीकार हुआ क्योंकि जरूरी भाषा या structure पूरा नहीं था। अब JSON values मुख्य रूप से हिंदी में लिखें। केवल "Subheadings:", "Agency GE News Hub" और "Photo Caption:" ये labels इसी spelling में रह सकते हैं।`;

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
      return uiHindi;
    }

    try {
      const parsed = JSON.parse(record.raw_response || "{}");
      if (hasUiHindiShape(parsed)) {
        return normalizeUiHindiPayload(parsed);
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
      image_prompt: "",
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
    rewrite.ui_hindi.image_url = isLikelyValidImageUrl(record.news_image_link)
      ? record.news_image_link
      : "";
    rewrite.ui_hindi.image_prompt = "";
  }

  return {
    ...rewrite,
    news: {
      id: record.news_id,
      category: rewrite?.ui_hindi?.category || record.category,
      source_category: record.category,
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
  let browser = null;
  let page = null;

  try {
    const scrapedText = normalizeWhitespace(
      articleRecord.scraped_content_text ||
        articleRecord.source_content ||
        articleRecord.source_excerpt ||
        ""
    );
    const scrapedSubtitle = articleRecord.scraped_subtitle || articleRecord.source_excerpt || "";
    let articleText = null;
    let extractionError = null;

    if (scrapedText.length >= 120) {
      articleText = {
        title: articleRecord.title || scrapedSubtitle || "",
        metaDescription: scrapedSubtitle || "",
        paragraphs: scrapedText
          .split(/\n{2,}|(?<=[।.!?])\s+/)
          .map((paragraph) => normalizeWhitespace(paragraph))
          .filter((paragraph) => paragraph.length >= 40)
          .slice(0, 25),
        combinedText: scrapedText,
      };
    } else {
      try {
        ({ browser, page } = await createBrowserPage());
        articleText = await withTransientRetry(
          async () => extractArticleTextFromPage(page, articleRecord.source_url)
        );
      } catch (error) {
        extractionError = error;
      }
    }
    if ((!articleText?.combinedText || articleText.combinedText.length < 120) && scrapedText.length >= 120) {
      articleText = {
        title: articleRecord.title || scrapedSubtitle || "",
        metaDescription: scrapedSubtitle || "",
        paragraphs: scrapedText
          .split(/\n{2,}|(?<=[।.!?])\s+/)
          .map((paragraph) => normalizeWhitespace(paragraph))
          .filter((paragraph) => paragraph.length >= 40)
          .slice(0, 25),
        combinedText: scrapedText,
      };
    }

    if (!articleText?.combinedText || articleText.combinedText.length < 120) {
      throw extractionError || new Error("Could not extract enough article text for AI rewriting.");
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
    if (browser) {
      await browser.close();
    }
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

  const deliveredImageUrl = isLikelyValidImageUrl(formatted.news?.image_link)
    ? formatted.news.image_link
    : "";
  const sourceCategory = formatted.news?.source_category
    ? normalizeUnifiedCategory(formatted.news.source_category)
    : formatted.news?.category
      ? normalizeUnifiedCategory(formatted.news.category)
      : "";
  const uiCategory = formatted.ui_hindi?.category ? normalizeUnifiedCategory(formatted.ui_hindi.category) : "";
  const feedSource = String(formatted.news?.feed_source || "").toLowerCase();
  const preferredUiCategory =
    uiCategory &&
    uiCategory !== DEFAULT_HINDI_NEWS_CATEGORY &&
    !(uiCategory === "Madhyapradesh" && sourceCategory !== "Madhyapradesh" && !feedSource.startsWith("mpinfo-"))
      ? uiCategory
      : "";
  const deliveryCategory = sourceCategory === "Madhyapradesh" || feedSource.startsWith("mpinfo-")
    ? "Madhyapradesh"
    : preferredUiCategory || sourceCategory || uiCategory || chooseSmartNewsCategory({
    title: formatted.ui_hindi?.title || formatted.hindi?.headline || formatted.english?.headline,
    short_100: formatted.ui_hindi?.short_100 || formatted.hindi?.short_description,
    medium_300: formatted.ui_hindi?.medium_300 || formatted.hindi?.what_to_watch_next,
    long_500: formatted.ui_hindi?.long_500 || formatted.hindi?.long_description,
    keywords: [],
    category: formatted.news?.category,
    state: formatted.ui_hindi?.state,
  });

  const payload = {
    id: formatted.id,
    slug: formatted.publication?.slug || null,
    category: deliveryCategory,
    source_category: formatted.news?.source_category || formatted.news?.category || "uncategorized",
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
      image_link: deliveredImageUrl || null,
      image_source: deliveredImageUrl ? formatted.news?.image_source || null : null,
    },
    raw_articles: {
      words_100: formatted.ui_hindi?.short_100 || formatted.hindi?.short_description || "",
      words_300: formatted.ui_hindi?.medium_300 || formatted.hindi?.what_to_watch_next || "",
      words_600: formatted.ui_hindi?.long_500 || formatted.hindi?.long_description || "",
      words_500: formatted.ui_hindi?.long_500 || formatted.hindi?.long_description || "",
    },
    ui_hindi: {
      ...(formatted.ui_hindi || {}),
      category: deliveryCategory,
      image_url: deliveredImageUrl,
      image_prompt: "",
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

function getDeliveryImageKey(record) {
  const imageUrl = record?.media?.image_link;
  if (!imageUrl) {
    return "";
  }

  try {
    const parsed = new URL(imageUrl);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, "$1");
    return parsed.href.toLowerCase();
  } catch {
    return String(imageUrl).trim().toLowerCase().replace(/-\d+x\d+(\.[a-z0-9]+)(?:[?#].*)?$/i, "$1");
  }
}

function removeRepeatedDeliveryImages(records) {
  const seen = new Set();
  const weakImageSources = new Set(["rss-image", "html-image", "article-image", "cliff-image", "cliff-featured-image"]);

  return records.map((record) => {
    const key = getDeliveryImageKey(record);
    const imageSource = String(record?.media?.image_source || "").toLowerCase();
    const shouldHideRepeatedImage = key && seen.has(key) && weakImageSources.has(imageSource);

    if (!shouldHideRepeatedImage) {
      if (key) {
        seen.add(key);
      }
      return record;
    }

    return {
      ...record,
      media: {
        ...(record.media || {}),
        image_link: null,
        image_source: null,
      },
      ui_hindi: record.ui_hindi
        ? {
            ...record.ui_hindi,
            image_url: "",
            image_prompt: "",
          }
        : record.ui_hindi,
    };
  });
}

async function listDeliveredAiRewrites(dbPool, { category = null, limit = 50, language = "both" } = {}) {
  const records = await listAiRewrites(dbPool, {
    category,
    limit,
    publicationStatus: "published",
  });

  return removeRepeatedDeliveryImages(records.map((record) => formatDeliveredRewrite(record, language)));
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
    const skippedCandidates = [];

    try {
      const candidates = await findLatestRewriteCandidatesByCategory(dbPool, category, AI_REWRITE_CANDIDATE_LIMIT);

      if (!candidates.length) {
        results.push({
          status: "Skipped",
          category,
          message: "No unrevised saved article is available for this category.",
        });
        continue;
      }

      const savedRewrites = [];
      for (const articleRecord of candidates) {
        if (savedRewrites.length >= AI_REWRITES_PER_CATEGORY_RUN) {
          break;
        }

        try {
          const savedRewrite = await createOrUpdateRewriteForRecord(
            dbPool,
            articleRecord,
            createBrowserPage,
            afterRewriteSaved
          );
          savedRewrites.push({
            news_id: articleRecord.id,
            title: articleRecord.title,
            rewrite: formatAiRewriteRecord(savedRewrite),
          });
        } catch (error) {
          if (!isSkippableRewriteInputError(error)) {
            throw error;
          }

          skippedCandidates.push({
            news_id: articleRecord.id,
            title: articleRecord.title,
            message: error.message,
          });
          await recordAiRewriteSkip(dbPool, articleRecord, error);
        }
      }

      if (savedRewrites.length > 0) {
        results.push({
          status: "Success",
          category,
          news_id: savedRewrites[0].news_id,
          title: savedRewrites[0].title,
          saved_count: savedRewrites.length,
          requested_limit: AI_REWRITES_PER_CATEGORY_RUN,
          skipped_candidates: skippedCandidates,
          rewrites: savedRewrites,
          rewrite: savedRewrites[0].rewrite,
        });
      } else {
        results.push({
          status: "Skipped",
          category,
          skipped_count: skippedCandidates.length,
          message: "No pending article in this category had enough readable text for AI rewriting.",
          skipped_candidates: skippedCandidates,
        });
      }
    } catch (error) {
      results.push({
        status: "Error",
        category,
        message: error.message,
        skipped_candidates: skippedCandidates,
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
    const category = req.query.category ? normalizeUnifiedCategory(req.query.category) : null;
    const force = String(req.query.force || "").toLowerCase() === "true" || req.query.force === "1";

    try {
      const dbPool = getDbPool();
      const queryText = category
        ? `
            SELECT
              id, category, feed_source, feed_url, search_query, title, source_url, image_link, image_source,
              source_excerpt, source_content, source_published_at, fetched_at
            FROM fetched_news
            WHERE category = ?
            ORDER BY id DESC
            LIMIT ?
          `
        : `
            SELECT
              id, category, feed_source, feed_url, search_query, title, source_url, image_link, image_source,
              source_excerpt, source_content, source_published_at, fetched_at
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
      const category = req.query.category ? normalizeUnifiedCategory(req.query.category) : null;
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
          const key = normalizeUnifiedCategory(item.ui_hindi?.category || item.news?.category || DEFAULT_HINDI_NEWS_CATEGORY);
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

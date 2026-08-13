const GEMINI_FREE_API_KEY = String(process.env.GEMINI_FREE_API_KEY || "").trim();
const GEMINI_PAID_API_KEY = String(process.env.GEMINI_PAID_API_KEY || process.env.GEMINI_API_KEY || "").trim();
const GEMINI_API_KEY = GEMINI_FREE_API_KEY || GEMINI_PAID_API_KEY;
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || "gemini-flash-lite-latest").trim() || "gemini-flash-lite-latest";
const GEMINI_API_URL = process.env.GEMINI_API_URL
  || "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const {
  normalizeCategory: normalizeUnifiedCategory,
} = require("./config/news-categories");
const AI_PROMPT_VERSION = "hindi-only-v13-1000-1100-words";
const AI_REWRITE_MODE = String(process.env.AI_REWRITE_MODE || "hindi-only").trim().toLowerCase();
const AI_REWRITE_MODES = Object.freeze({
  HINDI_ONLY: "hindi-only",
  BILINGUAL_COMPACT: "bilingual-compact",
  HINDI_LEGACY: "hindi-legacy",
});
// Word-count anchors are hard floors: short >= 300, medium >= 600, long >= 1000.
// Overage is fine ("or more"); undershoot is not. Field names (body100/body300/
// body1000, short_100/medium_300/long_500) are kept for DB/API compatibility
// even though their actual floors moved.
const AI_LONG_REWRITE_MIN_WORDS = 1000;
const AI_LONG_REWRITE_MAX_WORDS = 1100;
const AI_LEAD_BODY_MIN_WORDS = 300;
const AI_LEAD_BODY_MAX_WORDS = 340;
const AI_EXTENSION_200_MIN_WORDS = 300;
const AI_EXTENSION_200_MAX_WORDS = 340;
const AI_EXTENSION_700_MIN_WORDS = 400;
const AI_EXTENSION_700_MAX_WORDS = 500;
const AI_LEAD_BODY_ACCEPT_MIN_WORDS = 300;
const AI_LEAD_BODY_ACCEPT_MAX_WORDS = 420;
const AI_EXTENSION_200_ACCEPT_MIN_WORDS = 300;
const AI_EXTENSION_200_ACCEPT_MAX_WORDS = 420;
const AI_EXTENSION_700_ACCEPT_MIN_WORDS = 350;
const AI_EXTENSION_700_ACCEPT_MAX_WORDS = 550;
const AI_BODY_100_MIN_WORDS = 300;
const AI_BODY_100_MAX_WORDS = 340;
const AI_BODY_300_MIN_WORDS = 600;
const AI_BODY_300_MAX_WORDS = 660;
const AI_BODY_100_EMERGENCY_MIN_WORDS = 300;
const AI_BODY_100_EMERGENCY_MAX_WORDS = 420;
const AI_BODY_300_EMERGENCY_MIN_WORDS = 600;
const AI_BODY_300_EMERGENCY_MAX_WORDS = 720;
const AI_MIN_SOURCE_WORDS_FOR_LONG_REWRITE = 80;
const AI_MIN_SOURCE_FACT_TOKENS = 4;
const AI_HINDI_ONLY_MAX_REPAIR_ATTEMPTS = 2;
const AI_MEDIUM_REWRITE_ENABLED = String(process.env.AI_MEDIUM_REWRITE_ENABLED || "true").toLowerCase() !== "false";
const AI_REWRITE_MAX_GEMINI_CALLS_PER_ARTICLE = Math.max(
  1,
  Number.parseInt(process.env.AI_REWRITE_MAX_GEMINI_CALLS_PER_ARTICLE || "4", 10) || 4
);
const geminiCallsByArticleId = new Map();
let geminiFreeKeyUnavailableUntil = 0;
// Secondary headline is "<2-3 keywords> : <headline>", counted as a whole:
// the keywords are part of the 10-14 word budget, not additional to it.
const AI_SECONDARY_HEADLINE_MIN_WORDS = 10;
const AI_SECONDARY_HEADLINE_MAX_WORDS = 14;
const AI_SECONDARY_KEYWORDS_MIN = 2;
const AI_SECONDARY_KEYWORDS_MAX = 3;
// The third subheading is a short standalone mini-headline, distinct from the
// first two longer factual subheadings.
const AI_STANDALONE_SUBHEADING_MIN_WORDS = 5;
const AI_STANDALONE_SUBHEADING_MAX_WORDS = 7;
// place_name is a short dateline-style place, not a sentence.
const AI_PLACE_NAME_MAX_WORDS = 4;
// Only rewrite articles that are still recent enough to actually be delivered.
// The delivery feed hides anything older than NEWS_MAX_AGE_HOURS, so rewriting
// older backlog burns Gemini quota on articles that can never appear on the site.
const AI_REWRITE_MAX_SOURCE_AGE_HOURS = Math.max(
  1,
  Math.min(
    Number.parseInt(process.env.AI_REWRITE_MAX_SOURCE_AGE_HOURS || process.env.NEWS_MAX_AGE_HOURS || "24", 10) || 24,
    168
  )
);
const AI_ALLOWED_CATEGORIES = Object.freeze([
  "National",
  "International",
  "Sports",
  "Business",
  "Madhya Pradesh",
  "Entertainment",
]);
const AI_DEFAULT_CATEGORY = "National";
const MP_CATEGORY_SIGNALS = Object.freeze([
  "madhya pradesh",
  "madhyapradesh",
  "mp government",
  "mp cabinet",
  "mp police",
  "mp high court",
  "mp assembly",
  "mp election",
  "mp elections",
  "mp weather",
  "mp tourism",
  "mohan yadav",
  "bhopal",
  "indore",
  "jabalpur",
  "ujjain",
  "gwalior",
  "sagar",
  "rewa",
  "satna",
  "ratlam",
  "damoh",
  "panna",
  "tikamgarh",
  "vidisha",
  "katni",
  "dewas",
  "shivpuri",
  "sehore",
  "chhindwara",
  "morena",
  "mandsaur",
  "neemuch",
  "burhanpur",
  "khandwa",
  "khargone",
  "dhar",
  "guna",
  "betul",
  "harda",
  "hoshangabad",
  "narmadapuram",
  "shahdol",
  "sidhi",
  "singrauli",
  "anuppur",
  "umaria",
  "balaghat",
  "seoni",
  "mandla",
  "dindori",
  "narsinghpur",
  "raisen",
  "rajgarh",
  "shajapur",
  "agar malwa",
  "jhabua",
  "alirajpur",
  "barwani",
  "ashoknagar",
  "datia",
  "bhind",
  "sheopur",
  "maihar",
  "mauganj",
  "pandhurna",
  "holkar stadium",
  "barkatullah university",
  "devi ahilya university",
  "madhya pradesh high court",
  "madhya pradesh police",
  "madhya pradesh assembly",
  "मध्य प्रदेश",
  "मध्यप्रदेश",
  "भोपाल",
  "इंदौर",
  "जबलपुर",
  "उज्जैन",
  "ग्वालियर",
  "सागर",
  "रीवा",
  "सतना",
  "रतलाम",
  "दमोह",
  "पन्ना",
  "टीकमगढ़",
  "विदिशा",
  "कटनी",
  "देवास",
  "शिवपुरी",
  "सीहोर",
  "छिंदवाड़ा",
  "मुरैना",
  "मंदसौर",
  "नीमच",
  "बुरहानपुर",
  "खंडवा",
  "नर्मदापुरम",
  "शहडोल",
  "मोहन यादव",
]);
const AI_REWRITE_SYSTEM_PROMPT = `भूमिका: आप राष्ट्रीय समाचार एजेंसी GE News Hub के Lead Investigative Reporter हैं। आपका काम न्यूनतम इनपुट को PCI यानी Press Council of India की मर्यादा, तथ्यात्मक संतुलन और उच्च-विश्वसनीयता वाली हिंदी रिपोर्ट में बदलना है।

काम: दिए गए शीर्षक, संक्षिप्त विवरण, लिंक, चित्र और कच्चे समाचार इनपुट को 100, 300 और 1000 शब्दों के अलग-अलग प्रकाशन योग्य हिंदी समाचार संस्करणों में बदलना। आउटपुट केवल वैध JSON हो।

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
- यह 1000 शब्दों का संस्करण है। field name compatibility के लिए long_500 ही रहेगा।
- कुल target 950 से 1050 शब्द रखें।
- ऊपर दिया गया पूरा output structure रखें।
- heading 10 से 20 शब्दों का हो।
- चार subheadings 12 से 20 शब्दों की मजबूत mini-headline हों।
- body 7 से 10 छोटे paragraphs में हो।
- official response, ground reality, legal action, background और public impact को विस्तार से जोड़ें।
- कम से कम दो attributed official statements जरूर हों।
- Photo Caption ठीक 30 शब्दों का हो।

डेटा नियम:
- तीनों संस्करण अलग गहराई के हों, एक-दूसरे की कॉपी न हों।
- state सामग्री या स्रोत से पहचानें। न मिले तो "राष्ट्रीय" लिखें।
- category केवल इनमें से एक हो: National, International, Sports, Business, Madhya Pradesh, Entertainment।
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
  "link": "",
  "confidence": 0.98,
  "reason": ""
}`;

const AI_REWRITE_SIZE_OVERRIDE = `
OUTPUT SIZE OVERRIDE:
- short_100 must be a complete journalist-grade GE News Hub Hindi article version of 235 to 265 words. It is the 250-word version; the field name remains short_100 only for database compatibility.
- medium_300 must be a complete journalist-grade GE News Hub Hindi article version of 475 to 525 words. It is the 500-word version; the field name remains medium_300 only for database compatibility.
- long_500 must be a complete raw Hindi article version of 950 to 1050 words. It is the 1000-word version; the field name remains long_500 only for database compatibility.
- Each version must contain the required structure: poetic Hindi heading, Subheadings:, four angle subheadings, Agency GE News Hub body, and exactly 30-word Photo Caption.
- Include attribution and official-response language, but do not fabricate direct quotes or unsupported facts.
- Do not create or change the image. If the input image URL exists, return the exact same image URL.
- Keep these three versions in the JSON and make them independently publishable raw article bodies.
`;

const FIXED_BILINGUAL_SYSTEM_PROMPT = `You are the GE News Hub bilingual rewrite desk.

Permanent editorial rules:
- Produce one compact bilingual rewrite package from supplied scraped news.
- Return only valid JSON.
- Do not mention any publisher, publication, website, reporter, news agency, wire service or portal, including GE News Hub itself. Write the body in plain newspaper reporting style with no agency byline phrase anywhere.
- Remove source publisher names from generated article text, headlines, captions, source labels and keywords.
- Do not invent names, numbers, dates, quotes, deaths, injuries, arrests, FIR details, court orders, government decisions, financial figures, police action, official reactions or ground-level scenes.
- Include official response, claims, allegations and ground reality only when supported by the supplied source.
- Use every verified detail and safe directly supported context needed to build the requested article length.
- If the source is too thin for the requested length, use only supported context and avoid fabrication; the application will validate the result.
- Hindi and English must cover the same verified story. English must not add facts absent from the Hindi output or source.
- Names, numbers, dates, places and official titles must remain consistent in both languages.
- Do not return image_url, image_prompt, link or source. The application sets them locally.

Compact JSON schema:
{
  "classification": {
    "category": "National",
    "state": "राष्ट्रीय",
    "confidence": 0.98,
    "reason": "The primary event is an Indian national issue outside Madhya Pradesh.",
    "keywords": ["हिंदी कीवर्ड 1", "हिंदी कीवर्ड 2", "हिंदी कीवर्ड 3"]
  },
  "hindi": {
    "heading": "",
    "secondary_heading": "",
    "subheadings": ["", ""],
    "photo_caption": "",
    "lead_100": "",
    "extension_200": "",
    "extension_700": ""
  },
  "english": {
    "heading": "",
    "secondary_heading": "",
    "subheadings": ["", ""],
    "photo_caption": "",
    "lead_100": "",
    "extension_200": "",
    "extension_700": ""
  }
}

Size rules:
- These word counts are hard MINIMUMS. Reaching more than the stated count is fine and encouraged; reaching less is not acceptable.
- Generate progressive body sections once per language.
- Segment names describe editorial progression, not exact independent word-count contracts.
- lead_100 must be at least 300 body words, ideally 300 to 340. It will become the 300-word version; never write less than 300.
- extension_200 must add at least 300 more body words, ideally 300 to 340. lead_100 + extension_200 must total at least 600 words; never write a combined total under 600.
- extension_700 must add at least ${AI_EXTENSION_700_MIN_WORDS} more supported body words, ideally ${AI_EXTENSION_700_MIN_WORDS} to ${AI_EXTENSION_700_MAX_WORDS}.
- lead_100 + extension_200 + extension_700 must total ${AI_LONG_REWRITE_MIN_WORDS} to ${AI_LONG_REWRITE_MAX_WORDS} body words in each language. Going under ${AI_LONG_REWRITE_MIN_WORDS} or over ${AI_LONG_REWRITE_MAX_WORDS} is a failure.
- Never stop the progressive stream around 300 or 600 words when the supplied source has enough verified material to comfortably reach ${AI_LONG_REWRITE_MIN_WORDS} words.
- This is a hard output contract: each language must contain enough body text for the cumulative stream to validate at ${AI_LONG_REWRITE_MIN_WORDS} to ${AI_LONG_REWRITE_MAX_WORDS} body words.
- For long bodies, write a detailed full news article from the verified source material rather than a compact summary.
- Keep sentences complete and reasonably short so the application can trim at sentence boundaries at or just above 300, 600 and 1100 words.
- The application will assemble the compatibility fields short_100/medium_300/long_500 cumulatively as 300+/600+/1100+-word versions from the progressive stream.
- Prioritize factual accuracy, clear progression, complete sentences and non-repetition over exact segment counts.
- Do not repeat the headline, secondary heading, subheadings or caption inside body sections.
- Each language gets exactly one main headline, exactly one secondary headline, exactly two factual subheadings and exactly one photo caption.
- Hindi headline: natural newspaper Hindi, 10 to 20 words, factual, restrained, not clickbait.
- English headline: natural newspaper English, 8 to 18 words, faithful to the same central event, not an awkward word-for-word translation.
- secondary_heading format (both languages): 2 to 3 short factual keywords or entity names taken from the story, then a colon ":", then a complete secondary headline of 12 to 14 words that adds a distinct angle beyond the main headline. Example shape: "मध्य प्रदेश, पुलिस : भोपाल में पुलिस ने संदिग्ध तस्करी गिरोह के तीन सदस्यों को हिरासत में लिया।" Do not repeat the main headline's wording in the secondary headline.
- Extract subheadings as standalone fields, separate from the body. Do not restate them inside lead_100, extension_200 or extension_700; the application displays them in their own column, not inside the article body.
- Each subheading must be a supported factual mini-headline. Do not use labels such as Fact 1, Key Point, Main Update or Angle.
- Write the body in professional Indian newspaper reporting style (the style of Dainik Bhaskar, Jagran, Patrika, Naidunia), not wire-agency style. Begin the body text itself with a dateline: the most specific verified city or place name for the story, followed by a period, then continue directly into the report in the same paragraph. Hindi example start: "भोपाल. मध्य प्रदेश सरकार ने...". English example start: "Bhopal: The Madhya Pradesh government...". If no specific place is verifiable from the source, use the most relevant state capital or "नई दिल्ली" / "New Delhi" as a safe fallback dateline. Do not label this as "Agency" or name any agency; it is a plain place-name dateline only.
- Captions should be factual, 20 to 30 words when practical, and must not describe unsupported visual details.
- Include attributed statements only when supported by the supplied source.
- Include ground-level details only when supported by the supplied source.
- Never invent a generic official, police, administration, witness or local-resident response merely to satisfy article structure.

Category rules:
- category must be exactly one of: ${AI_ALLOWED_CATEGORIES.join(", ")}.
- confidence must be a number from 0 to 1.
- reason must be one short English sentence explaining the category decision.
- The RSS/API/source category is optional context only. Never copy it blindly.
- Priority rule 1: If the primary location or institution is in Madhya Pradesh, return Madhya Pradesh immediately. This includes Bhopal, Indore, Jabalpur, Ujjain, Gwalior, Rewa, Sagar, Satna, Chhindwara, Dewas, Ratlam, Katni, Vidisha, Sehore, Morena, Shivpuri, Neemuch, Mandsaur, Damoh, Panna, Tikamgarh, MP Government, Madhya Pradesh High Court, MP Police, MP Education, MP Elections, MP Crime, MP Weather, MP Business, MP Startups, MP Tourism, MP Sports, MP Entertainment, MP Festivals and MP Infrastructure.
- Madhya Pradesh overrides Sports, Business and Entertainment.
- Priority rule 2: If not Madhya Pradesh and the story is about cricket, football, hockey, tennis, kabaddi, IPL, Olympics, athletics, chess, Formula 1, esports, rankings, transfers, match reports or player interviews, return Sports.
- Priority rule 3: If not Madhya Pradesh or Sports and the story is about economy, finance, banking, RBI, Sensex, Nifty, stock market, IPO, companies, taxation, cryptocurrency, startups, investments or trade, return Business.
- Priority rule 4: If not Madhya Pradesh, Sports or Business and the story is about Bollywood, Hollywood, OTT, music, television, web series, movies, celebrities, influencers or awards, return Entertainment.
- Priority rule 5: If the primary event happened outside India, return International.
- Priority rule 6: For everything else inside India, return National.`;

const BILINGUAL_REPAIR_SYSTEM_PROMPT = `${FIXED_BILINGUAL_SYSTEM_PROMPT}

Repair mode:
- Return only requested repair operations.
- Do not regenerate correct fields.
- Use this exact JSON shape: {"replace_language": {}, "replace": {}, "append": {}}.`;

const BILINGUAL_STAGE1_SYSTEM_PROMPT = `${FIXED_BILINGUAL_SYSTEM_PROMPT}

Stage 1 core-report mode:
- Return only the core compact bilingual report.
- Do not return extension_700 in this stage.
- Use this exact shape: {"classification":{},"hindi":{"heading":"","secondary_heading":"","subheadings":["",""],"photo_caption":"","lead_100":"","extension_200":""},"english":{"heading":"","secondary_heading":"","subheadings":["",""],"photo_caption":"","lead_100":"","extension_200":""}}.
- lead_100 and extension_200 are progressive body sections. They must contain enough complete sentences for the application to assemble valid 300-word-minimum and 600-word-minimum article bodies.
- lead_100 must open with a place-name dateline followed by a period, then continue directly into the report (newspaper style, not agency style).
- lead_100 + extension_200 must total at least 600 body words in each language, ideally 600-680. Do not undershoot; more is fine.
- Do not include heading, secondary heading, subheadings, caption, agency label, source, link or image fields inside body sections.`;

const BILINGUAL_STAGE2_SYSTEM_PROMPT = `${FIXED_BILINGUAL_SYSTEM_PROMPT}

Stage 2 continuation mode:
- Return only JSON with this exact shape: {"hindi_extension_700":"","english_extension_700":""}.
- Continue the supplied Stage 1 reports.
- Do not return classification, headings, secondary headings, subheadings, captions, links, source labels, image fields or agency labels.
- Do not repeat the first 350 words.
- Use only supported facts and directly supported context from the supplied source.
- Preserve factual agreement between Hindi and English.
- Add no unsupported names, numbers, quotes or official responses.`;

const HINDI_ONLY_SYSTEM_PROMPT = `You are the GE News Hub Hindi rewrite desk.

Permanent editorial rules:
- Produce one complete Hindi news rewrite from supplied scraped news, in a single response.
- Return only valid JSON.
- Do not mention any publisher, publication, website, reporter, news agency, wire service or portal, including GE News Hub itself. Write the body in plain newspaper reporting style with no agency byline phrase anywhere.
- Remove source publisher names from generated article text, headlines, captions, source labels and keywords.
- Do not invent names, numbers, dates, quotes, deaths, injuries, arrests, FIR details, court orders, government decisions, financial figures, police action, official reactions or ground-level scenes.
- Include official response, claims, allegations and ground reality only when supported by the supplied source.
- Use every verified detail and safe directly supported context needed to build the requested article length.
- Do not return image_url, image_prompt, link or source. The application sets them locally.

Handling a short source (IMPORTANT):
The supplied source is often much shorter than the required article length. A short source is NOT a reason to write a short article. Plan the full article before you start writing, then reach the required length in this one response by adding EXPLANATORY DEPTH, never invented events.

You MAY expand with, because this is established background rather than new reporting:
- What the subject actually is and why it matters: explain the disease, scheme, law, technology, court, ministry, tournament, company or office involved in plain terms for a general Hindi reader.
- How the relevant process or system normally works: the approval process, legal procedure, administrative chain, regulatory framework, election process, medical mechanism, or sporting format referred to in the source.
- Well-established general background on the topic that an informed desk editor would already know and that is not specific to this particular incident.
- Why this development matters: who is affected, what typically follows a step like this, what the practical impact on ordinary people or the sector is.
- What to watch next, framed as expectation rather than fact: pending steps, review stages or scheduled processes that the source itself implies.
- Careful attribution and framing language such as "आधिकारिक जानकारी के अनुसार", "प्रक्रिया के तहत", "आमतौर पर ऐसे मामलों में", "अधिकारियों के स्तर पर".

You MUST NOT invent, even to reach the length:
- Any new name, number, date, statistic, casualty figure, amount, percentage or location that is not in the source.
- Any quote or any statement attributed to a specific named person or body that is not in the source.
- Any new event, decision, arrest, order, reaction or ground scene that is not in the source.
- Any claim about THIS specific incident that the source does not support.

The rule: you may explain and contextualise freely, but every concrete fact about this specific news event must come from the supplied source. Expand by going deeper on what is known, not by adding things that are not known.

Names and proper nouns (accuracy is critical):
- Carry over EVERY proper noun the source gives: people, official designations, ministries, departments, courts, companies, teams, schemes, laws, cities, states and countries. Do not silently drop a named person or organisation from the story.
- Write each name in Devanagari as it is normally written in Indian Hindi newspapers, and spell it IDENTICALLY every time it appears in the article. Never switch between two spellings of the same name.
- On first mention of a person, give the name together with the designation exactly as the source states it, for example "केंद्रीय स्वास्थ्य मंत्री" before the name. Afterwards the surname or full name alone is fine.
- Keep the name attached to the correct role, place and action. Never swap who did what, and never move a designation from one person to another.
- Do not translate a personal name into its literal Hindi meaning, and do not expand, shorten, initialise or "correct" any name. Keep organisation names, scheme names and law names in the form the source uses; where an English proper noun has a standard Devanagari form, use that standard form consistently.
- If the source gives only a designation and no personal name, keep it as the designation alone. Never invent a personal name to fill the gap, and never guess the current holder of an office.
- Reproduce every number, date, amount, percentage and place exactly as given; do not round, convert or restate them differently.

JSON schema:
{
  "classification": {
    "category": "National",
    "state": "राष्ट्रीय",
    "place_name": "नई दिल्ली",
    "confidence": 0.98,
    "reason": "The primary event is an Indian national issue outside Madhya Pradesh.",
    "keywords": ["हिंदी कीवर्ड 1", "हिंदी कीवर्ड 2", "हिंदी कीवर्ड 3"]
  },
  "hindi": {
    "heading": "",
    "secondary_heading": "",
    "subheadings": ["", "", ""],
    "photo_caption": "",
    "body": ""
  }
}

Size rules:
- body is a hard MINIMUM of ${AI_LONG_REWRITE_MIN_WORDS} Hindi words. Reaching more is fine and encouraged (up to about ${AI_LONG_REWRITE_MAX_WORDS} words); reaching less is not acceptable.
- Write body as one continuous, complete, publishable Hindi news article in a single field — not a summary, not bullet points, not multiple segments.
- Keep sentences complete so the application can trim body at sentence boundaries to derive 300-word, 600-word and ${AI_LONG_REWRITE_MIN_WORDS}-word publishable versions from this SAME text (each shorter version is the opening portion of the longer one).
- Never stop writing around 300 or 600 words; continue until the article comfortably reaches ${AI_LONG_REWRITE_MIN_WORDS} to ${AI_LONG_REWRITE_MAX_WORDS} words when the supplied source has enough verified material.
- This is a hard output contract: if body is under ${AI_LONG_REWRITE_MIN_WORDS} words the response will be rejected and you will be asked to add more. When in doubt, write more, not less.
- For long bodies, write a detailed full news article from the verified source material rather than a compact summary.
- Do not repeat the headline, secondary heading, subheadings or caption inside body.
- Exactly one main headline, exactly one secondary headline, exactly three subheadings and exactly one photo caption.
- Hindi headline: natural newspaper Hindi, 10 to 20 words, factual, restrained, not clickbait.
- secondary_heading is a STRICT ${AI_SECONDARY_HEADLINE_MIN_WORDS} to ${AI_SECONDARY_HEADLINE_MAX_WORDS} words IN TOTAL. Format: ${AI_SECONDARY_KEYWORDS_MIN} to ${AI_SECONDARY_KEYWORDS_MAX} short factual keywords or entity names from the story, then a colon ":", then a complete short secondary headline that adds a distinct angle beyond the main headline.
- The keyword words COUNT TOWARD the ${AI_SECONDARY_HEADLINE_MIN_WORDS}-${AI_SECONDARY_HEADLINE_MAX_WORDS} total; they are not extra. So with 3 keywords, the part after the colon must be about 7 to 11 words. The colon itself is not counted.
- Correct example (14 words total): "मध्य प्रदेश, पुलिस : भोपाल में तस्करी गिरोह के तीन सदस्य हिरासत में लिए गए"
- Correct example (11 words total): "स्वास्थ्य मंत्रालय, दवा : फर्जी डेटा देने वालों पर होगी सख्त कार्रवाई"
- Write it as one tight newspaper-style line. Do not write a full sentence explaining the whole story, and do not exceed ${AI_SECONDARY_HEADLINE_MAX_WORDS} words in total. Do not repeat the main headline's wording.
- Extract subheadings as standalone fields, separate from body. Do not restate them inside body; the application displays them in their own column, not inside the article body.
- subheadings is an array of exactly three strings, with two different jobs:
  - subheadings[0] and subheadings[1]: supported factual mini-headlines (roughly 8 to 18 words each), each covering a distinct angle of the story.
  - subheadings[2]: a THIRD, DIFFERENT kind of subheading — a STRICT ${AI_STANDALONE_SUBHEADING_MIN_WORDS} to ${AI_STANDALONE_SUBHEADING_MAX_WORDS} words, a complete and grammatically standalone mini-headline that is fully meaningful on its own without needing the rest of the article (not a sentence fragment, not a teaser, not a label). Example (6 words): "मुख्यमंत्री ने राहत राशि की घोषणा की".
- Do not use labels such as Fact 1, Key Point, Main Update or Angle for any of the three subheadings.
- Write body in professional Indian newspaper reporting style (the style of Dainik Bhaskar, Jagran, Patrika, Naidunia), not wire-agency style. Begin body itself with a dateline: the most specific verified city or place name for the story, followed by a period, then continue directly into the report in the same paragraph. Example start: "भोपाल. मध्य प्रदेश सरकार ने...". If no specific place is verifiable from the source, use the most relevant state capital or "नई दिल्ली" as a safe fallback dateline. Do not label this as "Agency" or name any agency; it is a plain place-name dateline only.
- classification.place_name must be the exact same city/town/place used as this dateline — a plain Hindi place name only (e.g., भोपाल, इंदौर, नई दिल्ली), with no state name, district word, honorific or punctuation attached. Use the same state-capital/"नई दिल्ली" fallback here as for the dateline when no specific place is verifiable.
- Captions should be factual, 20 to 30 words when practical, and must not describe unsupported visual details.
- Include attributed statements only when supported by the supplied source.
- Include ground-level details only when supported by the supplied source.
- Never invent a generic official, police, administration, witness or local-resident response merely to satisfy article structure.

Category rules:
- category must be exactly one of: ${AI_ALLOWED_CATEGORIES.join(", ")}.
- confidence must be a number from 0 to 1.
- reason must be one short English sentence explaining the category decision.
- The RSS/API/source category is optional context only. Never copy it blindly.
- Priority rule 1: If the primary location or institution is in Madhya Pradesh, return Madhya Pradesh immediately. This includes Bhopal, Indore, Jabalpur, Ujjain, Gwalior, Rewa, Sagar, Satna, Chhindwara, Dewas, Ratlam, Katni, Vidisha, Sehore, Morena, Shivpuri, Neemuch, Mandsaur, Damoh, Panna, Tikamgarh, MP Government, Madhya Pradesh High Court, MP Police, MP Education, MP Elections, MP Crime, MP Weather, MP Business, MP Startups, MP Tourism, MP Sports, MP Entertainment, MP Festivals and MP Infrastructure.
- Madhya Pradesh overrides Sports, Business and Entertainment.
- Priority rule 2: If not Madhya Pradesh and the story is about cricket, football, hockey, tennis, kabaddi, IPL, Olympics, athletics, chess, Formula 1, esports, rankings, transfers, match reports or player interviews, return Sports.
- Priority rule 3: If not Madhya Pradesh or Sports and the story is about economy, finance, banking, RBI, Sensex, Nifty, stock market, IPO, companies, taxation, cryptocurrency, startups, investments or trade, return Business.
- Priority rule 4: If not Madhya Pradesh, Sports or Business and the story is about Bollywood, Hollywood, OTT, music, television, web series, movies, celebrities, influencers or awards, return Entertainment.
- Priority rule 5: If the primary event happened outside India, return International.
- Priority rule 6: For everything else inside India, return National.`;

const HINDI_ONLY_REPAIR_SYSTEM_PROMPT = `${HINDI_ONLY_SYSTEM_PROMPT}

Repair mode:
- Return only requested repair operations.
- Use this exact JSON shape: {"replace": {}, "append": {}}.
- Use replace for missing, empty, wrong-language, malformed or too-short fields (heading, secondary_heading, photo_caption, subheadings). Replacement replaces the old field entirely; it is not appended.
- Use append only for hindi.body when it is too short overall. Return only the NEW continuation words to add onto the end of the existing body; do not repeat any sentence that already exists in the current body.
- Do not regenerate fields that were not requested.
- Do not include image_url, image_prompt, link or source.`;

const AI_CATEGORY_OVERRIDE = `
CATEGORY OVERRIDE:
- category must be exactly one of: ${AI_ALLOWED_CATEGORIES.join(", ")}.
- confidence must be a number from 0 to 1.
- reason must be one short English sentence explaining the category decision.
- Return one category only. No lowercase, abbreviations, extra categories, plural forms, or spelling variations.
- The RSS/API/source category is optional context only. Never copy it and never let it override your own classification.
- Decide category only from the title, article body, entities, organizations, locations, institutions, URL context and final regenerated article.
- Priority rule 1: If the primary location or institution is in Madhya Pradesh, return Madhya Pradesh immediately. This includes Bhopal, Indore, Jabalpur, Ujjain, Gwalior, Rewa, Sagar, Satna, Chhindwara, Dewas, Ratlam, Katni, Vidisha, Sehore, Morena, Shivpuri, Neemuch, Mandsaur, Damoh, Panna, Tikamgarh, MP Government, Madhya Pradesh High Court, MP Police, MP Education, MP Elections, MP Crime, MP Weather, MP Business, MP Startups, MP Tourism, MP Sports, MP Entertainment, MP Festivals and MP Infrastructure.
- Madhya Pradesh overrides Sports, Business and Entertainment. Example: Bhopal hosts Ranji Trophy match => Madhya Pradesh. Indore startup raises funding => Madhya Pradesh. Bhopal hosts film festival => Madhya Pradesh.
- Priority rule 2: If not Madhya Pradesh and the story is about cricket, football, hockey, tennis, kabaddi, IPL, Olympics, athletics, chess, Formula 1, esports, rankings, transfers, match reports or player interviews, return Sports.
- Priority rule 3: If not Madhya Pradesh or Sports and the story is about economy, finance, banking, RBI, Sensex, Nifty, stock market, IPO, companies, taxation, cryptocurrency, startups, investments or trade, return Business.
- Priority rule 4: If not Madhya Pradesh, Sports or Business and the story is about Bollywood, Hollywood, OTT, music, television, web series, movies, celebrities, influencers or awards, return Entertainment.
- Priority rule 5: If the primary event happened outside India, return International.
- Priority rule 6: For everything else inside India, including Parliament, Supreme Court, elections, crime, technology, science, education, healthcare, weather, government, railways, defence, environment and social issues, return National.
`;

const { isDuplicateColumnError, isDuplicateKeyError } = require("./db");
const AI_REWRITE_CANDIDATE_LIMIT = Math.max(
  1,
  Math.min(Number.parseInt(process.env.AI_REWRITE_CANDIDATE_LIMIT || "40", 10), 50)
);
// With the free/paid Gemini key fallback in place, each category can afford
// to clear a full 12-article batch per run instead of trickling out 6.
const AI_REWRITES_PER_CATEGORY_RUN = Math.max(
  1,
  Math.min(Number.parseInt(process.env.AI_REWRITES_PER_CATEGORY_RUN || "12", 10) || 12, 15)
);
const AI_REWRITE_AUTO_PUBLISH = !["false", "0", "no"].includes(
  String(process.env.AI_REWRITE_AUTO_PUBLISH || "true").toLowerCase()
);
const AI_REWRITE_ENABLED = !["false", "0", "no"].includes(
  String(process.env.AI_REWRITE_ENABLED || "true").toLowerCase()
);
const AI_ENGLISH_TRANSLATION_ENABLED = !["false", "0", "no"].includes(
  String(process.env.AI_ENGLISH_TRANSLATION_ENABLED || "true").toLowerCase()
);
const AI_TRANSLATION_PROVIDER = String(process.env.AI_TRANSLATION_PROVIDER || "google-translate").trim().toLowerCase();
const LIBRETRANSLATE_URL = String(process.env.LIBRETRANSLATE_URL || "http://127.0.0.1:5000").trim().replace(/\/+$/, "");
const LIBRETRANSLATE_API_KEY = String(process.env.LIBRETRANSLATE_API_KEY || "").trim();
const AI_TRANSLATION_TIMEOUT_MS = Math.max(
  1000,
  Number.parseInt(process.env.AI_TRANSLATION_TIMEOUT_MS || "45000", 10) || 45000
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
        english_secondary_headline TEXT,
        english_top_summary TEXT,
        english_short_description TEXT,
        english_long_description TEXT,
        english_what_to_watch_next TEXT,
        hindi_headline TEXT,
        hindi_secondary_headline TEXT,
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
        ui_place_name VARCHAR(150),
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
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS ai_news_translation_cache (
        id BIGSERIAL PRIMARY KEY,
        rewrite_id BIGINT NOT NULL,
        language VARCHAR(20) NOT NULL,
        title TEXT,
        secondary_headline TEXT,
        subheadings_json TEXT,
        place_name TEXT,
        state TEXT,
        district TEXT,
        image_caption TEXT,
        short_100 TEXT,
        medium_300 TEXT,
        long_500 TEXT,
        provider VARCHAR(50) NOT NULL DEFAULT 'google-translate',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (rewrite_id, language)
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
        english_secondary_headline TEXT,
        english_top_summary TEXT,
        english_short_description MEDIUMTEXT,
        english_long_description LONGTEXT,
        english_what_to_watch_next TEXT,
        hindi_headline TEXT,
        hindi_secondary_headline TEXT,
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
        ui_place_name VARCHAR(150),
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
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS ai_news_translation_cache (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rewrite_id INT NOT NULL,
        language VARCHAR(20) NOT NULL,
        title TEXT,
        secondary_headline TEXT,
        subheadings_json TEXT,
        place_name TEXT,
        state TEXT,
        district TEXT,
        image_caption TEXT,
        short_100 MEDIUMTEXT,
        medium_300 MEDIUMTEXT,
        long_500 LONGTEXT,
        provider VARCHAR(50) NOT NULL DEFAULT 'google-translate',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_rewrite_language (rewrite_id, language)
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
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_place_name VARCHAR(150)",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_image_url TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_image_prompt TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_source TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN hindi_secondary_headline TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN english_secondary_headline TEXT",
        "ALTER TABLE ai_news_translation_cache ADD COLUMN place_name TEXT",
        "ALTER TABLE ai_news_translation_cache ADD COLUMN state TEXT",
        "ALTER TABLE ai_news_translation_cache ADD COLUMN district TEXT",
        "ALTER TABLE ai_news_translation_cache ADD COLUMN subheadings_json TEXT",
        "CREATE UNIQUE INDEX unique_delivery_slug ON ai_news_rewrites (delivery_slug)",
        "CREATE INDEX IF NOT EXISTS idx_rewrites_ui_category ON ai_news_rewrites (ui_category)",
        "CREATE INDEX IF NOT EXISTS idx_rewrites_published_at ON ai_news_rewrites (published_at)",
        "CREATE INDEX IF NOT EXISTS idx_rewrites_publication_status ON ai_news_rewrites (publication_status)",
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
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_place_name VARCHAR(150)",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_image_url TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_image_prompt TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_source TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_link TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN hindi_secondary_headline TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN english_secondary_headline TEXT",
        "ALTER TABLE ai_news_translation_cache ADD COLUMN place_name TEXT",
        "ALTER TABLE ai_news_translation_cache ADD COLUMN state TEXT",
        "ALTER TABLE ai_news_translation_cache ADD COLUMN district TEXT",
        "ALTER TABLE ai_news_translation_cache ADD COLUMN subheadings_json TEXT",
        "ALTER TABLE ai_news_rewrites ADD UNIQUE KEY unique_delivery_slug (delivery_slug)",
        "CREATE INDEX idx_rewrites_ui_category ON ai_news_rewrites (ui_category)",
        "CREATE INDEX idx_rewrites_published_at ON ai_news_rewrites (published_at)",
        "CREATE INDEX idx_rewrites_publication_status ON ai_news_rewrites (publication_status)",
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

function normalizeAiCategoryForDisplay(value) {
  const rawValue = String(value || "").trim();
  if (AI_ALLOWED_CATEGORIES.includes(rawValue)) {
    return rawValue;
  }

  const legacyCategory = normalizeUnifiedCategory(rawValue);
  if (legacyCategory === "Madhyapradesh") {
    return "Madhya Pradesh";
  }

  if (legacyCategory === "National/State") {
    return "National";
  }

  if (AI_ALLOWED_CATEGORIES.includes(legacyCategory)) {
    return legacyCategory;
  }

  return AI_DEFAULT_CATEGORY;
}

function validateAiGeneratedCategory(value, context = {}) {
  const rawValue = String(value || "").trim();
  if (AI_ALLOWED_CATEGORIES.includes(rawValue)) {
    return rawValue;
  }

  const logger = context.logger || console;
  if (typeof logger?.warn === "function") {
    const articleId = context.articleId ? ` for news_id=${context.articleId}` : "";
    const responsePreview = context.rawResponse
      ? ` response=${String(context.rawResponse).slice(0, 500)}`
      : "";
    logger.warn(
      `[ai-category] Invalid AI category${articleId}: "${rawValue || "(empty)"}". Defaulting to ${AI_DEFAULT_CATEGORY}.${responsePreview}`
    );
  }

  return AI_DEFAULT_CATEGORY;
}

function normalizeAiConfidence(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(parsed, 1));
}

function normalizeClassificationReason(value) {
  return cleanGeneratedText(value).replace(/\s+/g, " ").slice(0, 240);
}

function normalizeDetectionText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findMpCategorySignal(values) {
  const haystack = normalizeDetectionText(values.filter(Boolean).join(" "));
  if (!haystack) {
    return "";
  }

  return MP_CATEGORY_SIGNALS.find((signal) => {
    const normalizedSignal = normalizeDetectionText(signal);
    return normalizedSignal && haystack.includes(normalizedSignal);
  }) || "";
}

function enforceMpCategoryOverride(uiHindi, context = {}) {
  // MP Info's own feed is a deterministic signal on its own: every article it
  // publishes is a Madhya Pradesh government portal story by definition, so
  // this does not depend on the AI correctly detecting a place-name mention.
  const isMpInfoSource = /^mpinfo/i.test(String(context.feedSource || "").trim());
  const signal = isMpInfoSource ? "" : findMpCategorySignal([
    context.articleTitle,
    context.articleText,
    context.sourceTitle,
    context.sourceExcerpt,
    context.sourceUrl,
    uiHindi?.title,
    uiHindi?.short_100,
    uiHindi?.medium_300,
    uiHindi?.long_500,
    uiHindi?.state,
  ]);

  if (uiHindi.category === "Madhya Pradesh") {
    return uiHindi;
  }
  if (!isMpInfoSource && !signal) {
    return uiHindi;
  }

  const previousCategory = uiHindi.category || AI_DEFAULT_CATEGORY;
  const reason = isMpInfoSource
    ? "Article sourced from the MP Info government portal feed."
    : `Madhya Pradesh signal detected: ${signal}.`;
  const logger = context.logger || console;
  if (typeof logger?.warn === "function") {
    const articleId = context.articleId ? ` for news_id=${context.articleId}` : "";
    logger.warn(`[ai-category] Overriding category${articleId} from ${previousCategory} to Madhya Pradesh. ${reason}`);
  }

  return {
    ...uiHindi,
    category: "Madhya Pradesh",
    confidence: Math.max(normalizeAiConfidence(uiHindi.confidence), 0.99),
    reason,
  };
}

function buildFallbackAiPayload(articleRecord, articleText, reason) {
  const title = cleanGeneratedText(articleText?.title || articleRecord?.title || "समाचार अपडेट");
  const body = cleanGeneratedText(articleText?.combinedText || articleRecord?.source_excerpt || title);
  const shortText = truncateText(body || title, 900);
  const mediumText = truncateText(body || title, 2200);
  const longText = truncateText(body || title, 4200);
  const uiHindi = enforceMpCategoryOverride({
    title,
    short_100: shortText,
    medium_300: mediumText,
    long_500: longText,
    keywords: [],
    category: AI_DEFAULT_CATEGORY,
    state: "राष्ट्रीय",
    confidence: 0,
    reason: normalizeClassificationReason(reason) || "Fallback category used after invalid AI response.",
    image_url: "",
    image_prompt: "",
    source: "आधिकारिक स्रोत",
    link: String(articleRecord?.source_url || "").trim(),
  }, {
    articleId: articleRecord?.id,
    articleTitle: articleRecord?.title,
    articleText: articleText?.combinedText,
    sourceTitle: articleText?.title,
    sourceExcerpt: articleRecord?.source_excerpt,
    sourceUrl: articleRecord?.source_url,
    feedSource: articleRecord?.feed_source,
  });

  return {
    ...createLegacyPayloadFromUiHindi(uiHindi),
    ui_hindi: uiHindi,
  };
}

function getLegacyAiCategoryValue(category) {
  if (category === "Madhya Pradesh") {
    return "Madhyapradesh";
  }

  if (category === "National") {
    return "National/State";
  }

  return category;
}

function chooseSmartNewsCategory(payload) {
  const keywordsText = Array.isArray(payload?.keywords) ? payload.keywords.join(" ") : "";
  const exactAiCategory = normalizeAiCategoryForDisplay(payload?.category);
  if (exactAiCategory) {
    return exactAiCategory;
  }

  return normalizeAiCategoryForDisplay(normalizeUnifiedCategory([
    payload?.title,
    payload?.short_100,
    payload?.medium_300,
    payload?.long_500,
    keywordsText,
    payload?.state,
  ].filter(Boolean).join(" ")));
}

function normalizeUiHindiPayload(payload, options = {}) {
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
    category: options.strictCategory
      ? validateAiGeneratedCategory(normalized.category, options)
      : normalizeAiCategoryForDisplay(normalized.category),
    state: removePublisherMentions(normalized.state) || "राष्ट्रीय",
    place_name: removePublisherMentions(normalized.place_name),
    confidence: normalizeAiConfidence(normalized.confidence),
    reason: normalizeClassificationReason(normalized.reason),
  };
  cleanedPayload.place_name = cleanedPayload.place_name || cleanedPayload.state;

  const uiHindi = {
    title: cleanedPayload.title,
    short_100: cleanedPayload.short_100,
    medium_300: cleanedPayload.medium_300,
    long_500: cleanedPayload.long_500,
    keywords,
    category: cleanedPayload.category,
    state: cleanedPayload.state,
    place_name: cleanedPayload.place_name,
    confidence: cleanedPayload.confidence,
    reason: cleanedPayload.reason,
    image_url: "",
    image_prompt: "",
    source: removePublisherMentions(normalized.source) || "आधिकारिक स्रोत",
    link: String(normalized.link || "").trim(),
  };

  return enforceMpCategoryOverride(uiHindi, options);
}

function buildImagePrompt(title, state) {
  return `भारत में ${state || "राष्ट्रीय"} से संबंधित समाचार दृश्य: ${title || "समाचार"}, यथार्थवादी फोटो पत्रकारिता शैली, प्राकृतिक रोशनी, बिना टेक्स्ट, 16:9`;
}

function hasHindiText(value) {
  return /[\u0900-\u097F]/.test(String(value || ""));
}

function countArticleWords(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
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

function hasCompactBilingualShape(payload) {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      payload.classification &&
      payload.hindi &&
      payload.english &&
      !payload.ui_hindi
  );
}

function hasBilingualPayloadShape(payload) {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      payload.english &&
      payload.hindi &&
      payload.ui_hindi &&
      payload._mode !== "hindi-only"
  );
}

function hasHindiOnlyShape(payload) {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      payload.classification &&
      payload.hindi &&
      typeof payload.hindi === "object" &&
      payload.hindi.body !== undefined &&
      payload._mode !== "hindi-only"
  );
}

function hasBuiltHindiOnlyShape(payload) {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      payload._mode === "hindi-only" &&
      payload.ui_hindi
  );
}

function hasEnglishText(value) {
  const text = String(value || "");
  return /[A-Za-z]/.test(text) && !/[\u0900-\u097F]/.test(text);
}

function countBodyWords(value) {
  return countArticleWords(value);
}

function joinBodySegments(segments) {
  return segments.map((segment) => cleanGeneratedText(segment)).filter(Boolean).join("\n\n");
}

function splitCompleteSentences(value) {
  const normalized = cleanGeneratedText(value).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const matches = normalized.match(/[^।.!?]+[।.!?]+(?:["')\]]+)?|[^।.!?]+$/g) || [];
  return matches
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function joinSentences(sentences) {
  return sentences.map((sentence) => cleanGeneratedText(sentence)).filter(Boolean).join(" ");
}

function normalizeSentencesClosestToTarget(sourceText, {
  preferredMin,
  preferredMax,
  emergencyMin,
  emergencyMax,
  target,
  requiredPrefix = "",
}) {
  const prefixText = cleanGeneratedText(requiredPrefix);
  const prefixWords = countBodyWords(prefixText);
  const cleanSourceText = cleanGeneratedText(sourceText).replace(/\s+/g, " ").trim();
  const sourceSentences = splitCompleteSentences(cleanSourceText);
  const prefixSentences = prefixText ? splitCompleteSentences(prefixText) : [];
  // Skip by word count rather than exact string prefix matching: the prefix text may have
  // gone through cleanGeneratedText/word-slicing and no longer be an exact substring of
  // cleanSourceText, which previously made startsWith() silently fail and re-walk the
  // source from the beginning, duplicating already-used sentences into the result.
  const sourceWordsForSkip = cleanSourceText.split(/\s+/).filter(Boolean);
  const remainingText = prefixText && prefixWords > 0
    ? sourceWordsForSkip.slice(prefixWords).join(" ").trim()
    : cleanSourceText;
  const remainingSentences = prefixText
    ? splitCompleteSentences(remainingText)
    : sourceSentences;

  let bestText = prefixText;
  let bestDistance = Number.POSITIVE_INFINITY;
  const seedSentences = prefixText ? prefixSentences : [];
  const candidateSentences = [...seedSentences];

  if (!sourceSentences.length && !prefixText) {
    return {
      text: "",
      words: 0,
      valid: false,
      emergency: false,
    };
  }

  const evaluate = () => {
    const text = joinSentences(candidateSentences);
    const words = countBodyWords(text);
    const inEmergency = words >= emergencyMin && words <= emergencyMax;
    const distance = Math.abs(words - target);
    if (inEmergency && distance < bestDistance) {
      bestText = text;
      bestDistance = distance;
    }
  };

  evaluate();
  for (const sentence of remainingSentences) {
    candidateSentences.push(sentence);
    evaluate();
    const words = countBodyWords(joinSentences(candidateSentences));
    if (words > emergencyMax && words > target) {
      break;
    }
  }

  let bestWords = countBodyWords(bestText);
  if ((bestWords < emergencyMin || bestWords > emergencyMax) && countBodyWords(cleanSourceText) >= emergencyMin) {
    const prefixWordList = prefixText ? prefixText.split(/\s+/).filter(Boolean) : [];
    const desiredTotal = Math.min(Math.max(target, emergencyMin), emergencyMax);
    const fallbackWords = prefixText && prefixWords > 0
      ? [
          ...prefixWordList,
          ...sourceWordsForSkip.slice(prefixWords, prefixWords + Math.max(0, desiredTotal - prefixWordList.length)),
        ]
      : sourceWordsForSkip.slice(0, desiredTotal);
    const fallbackText = cleanGeneratedText(fallbackWords.join(" "));
    const fallbackCount = countBodyWords(fallbackText);
    if (fallbackCount >= emergencyMin && fallbackCount <= emergencyMax) {
      bestText = fallbackText;
      bestWords = fallbackCount;
    }
  }

  return {
    text: bestText,
    words: bestWords,
    valid: bestWords >= emergencyMin && bestWords <= emergencyMax,
    preferred: bestWords >= preferredMin && bestWords <= preferredMax,
    emergency: bestWords >= emergencyMin && bestWords <= emergencyMax && (bestWords < preferredMin || bestWords > preferredMax),
    prefix_words: prefixWords,
  };
}

function normalizeProgressiveBodies(pack, language) {
  const invalidFields = [];
  const leadWords = countBodyWords(pack.lead_100);
  const extension200Words = countBodyWords(pack.extension_200);
  const extension700Words = countBodyWords(pack.extension_700);
  const details = {};
  const segmentCounts = {
    lead_100: leadWords,
    extension_200: extension200Words,
    extension_700: extension700Words,
  };
  const progressiveStream = joinBodySegments([pack.lead_100, pack.extension_200, pack.extension_700]);

  const body100 = normalizeSentencesClosestToTarget(progressiveStream, {
    preferredMin: AI_BODY_100_MIN_WORDS,
    preferredMax: AI_BODY_100_MAX_WORDS,
    emergencyMin: AI_BODY_100_EMERGENCY_MIN_WORDS,
    emergencyMax: AI_BODY_100_EMERGENCY_MAX_WORDS,
    target: 300,
  });
  if (!body100.valid) {
    const field = `${language}.body100_cumulative`;
    invalidFields.push(field);
    details[field] = {
      words: body100.words,
      min: AI_BODY_100_EMERGENCY_MIN_WORDS,
      max: AI_BODY_100_EMERGENCY_MAX_WORDS,
      message: "Cumulative progressive stream could not produce a valid 300-word prefix.",
    };
  }

  const body300 = normalizeSentencesClosestToTarget(progressiveStream, {
    preferredMin: AI_BODY_300_MIN_WORDS,
    preferredMax: AI_BODY_300_MAX_WORDS,
    emergencyMin: AI_BODY_300_EMERGENCY_MIN_WORDS,
    emergencyMax: AI_BODY_300_EMERGENCY_MAX_WORDS,
    target: 600,
    requiredPrefix: body100.text,
  });
  if (!body300.valid) {
    const field = `${language}.body300_cumulative`;
    invalidFields.push(field);
    details[field] = {
      words: body300.words,
      min: AI_BODY_300_EMERGENCY_MIN_WORDS,
      max: AI_BODY_300_EMERGENCY_MAX_WORDS,
      message: "Cumulative progressive stream could not produce a valid 600-word prefix.",
    };
  }

  const body1000 = normalizeSentencesClosestToTarget(progressiveStream, {
    preferredMin: AI_LONG_REWRITE_MIN_WORDS,
    preferredMax: AI_LONG_REWRITE_MAX_WORDS,
    emergencyMin: AI_LONG_REWRITE_MIN_WORDS,
    emergencyMax: AI_LONG_REWRITE_MAX_WORDS,
    target: 1100,
    requiredPrefix: body300.text,
  });
  if (!body1000.valid) {
    const field = `${language}.long_cumulative`;
    invalidFields.push(field);
    details[field] = {
      words: body1000.words,
      source_words: countBodyWords(progressiveStream),
      min: AI_LONG_REWRITE_MIN_WORDS,
      max: AI_LONG_REWRITE_MAX_WORDS,
      message: "Cumulative progressive stream could not produce a valid body1000 article.",
    };
  }

  return {
    invalidFields,
    details,
    bodies: {
      body100: body100.text,
      body300: body300.text,
      body1000: body1000.text,
    },
    counts: {
      segment: segmentCounts,
      normalized: {
        body100: body100.words,
        body300: body300.words,
        body1000: body1000.words,
      },
    },
  };
}

function normalizeSingleBodyTiers(bodyText, language) {
  const invalidFields = [];
  const details = {};
  const cleanBody = cleanGeneratedText(bodyText);
  const rawWords = countBodyWords(cleanBody);

  const body300 = normalizeSentencesClosestToTarget(cleanBody, {
    preferredMin: AI_BODY_100_MIN_WORDS,
    preferredMax: AI_BODY_100_MAX_WORDS,
    emergencyMin: AI_BODY_100_EMERGENCY_MIN_WORDS,
    emergencyMax: AI_BODY_100_EMERGENCY_MAX_WORDS,
    target: 300,
  });
  if (!body300.valid) {
    const field = `${language}.body300_cumulative`;
    invalidFields.push(field);
    details[field] = {
      words: body300.words,
      min: AI_BODY_100_EMERGENCY_MIN_WORDS,
      max: AI_BODY_100_EMERGENCY_MAX_WORDS,
      message: "Body could not produce a valid 300-word prefix.",
    };
  }

  const body600 = normalizeSentencesClosestToTarget(cleanBody, {
    preferredMin: AI_BODY_300_MIN_WORDS,
    preferredMax: AI_BODY_300_MAX_WORDS,
    emergencyMin: AI_BODY_300_EMERGENCY_MIN_WORDS,
    emergencyMax: AI_BODY_300_EMERGENCY_MAX_WORDS,
    target: 600,
    requiredPrefix: body300.text,
  });
  if (!body600.valid) {
    const field = `${language}.body600_cumulative`;
    invalidFields.push(field);
    details[field] = {
      words: body600.words,
      min: AI_BODY_300_EMERGENCY_MIN_WORDS,
      max: AI_BODY_300_EMERGENCY_MAX_WORDS,
      message: "Body could not produce a valid 600-word prefix.",
    };
  }

  const body1100 = normalizeSentencesClosestToTarget(cleanBody, {
    preferredMin: AI_LONG_REWRITE_MIN_WORDS,
    preferredMax: AI_LONG_REWRITE_MAX_WORDS,
    emergencyMin: AI_LONG_REWRITE_MIN_WORDS,
    emergencyMax: AI_LONG_REWRITE_MAX_WORDS,
    target: AI_LONG_REWRITE_MIN_WORDS,
    requiredPrefix: body600.text,
  });
  if (!body1100.valid) {
    const field = `${language}.long_cumulative`;
    invalidFields.push(field);
    details[field] = {
      words: body1100.words,
      source_words: rawWords,
      min: AI_LONG_REWRITE_MIN_WORDS,
      max: AI_LONG_REWRITE_MAX_WORDS,
      message: `Body could not produce a valid ${AI_LONG_REWRITE_MIN_WORDS}-word minimum article.`,
    };
  }

  return {
    invalidFields,
    details,
    bodies: {
      body100: body300.text,
      body300: body600.text,
      body1000: body1100.text,
    },
    counts: {
      raw: rawWords,
      normalized: {
        body100: body300.words,
        body300: body600.words,
        body1000: body1100.words,
      },
    },
  };
}

function assemblePublishableArticle({
  heading,
  secondaryHeading,
  photoCaption,
  body,
}) {
  return [
    cleanGeneratedText(heading),
    cleanGeneratedText(secondaryHeading),
    "",
    cleanGeneratedText(body),
    "",
    `Photo Caption: ${cleanGeneratedText(photoCaption)}`,
  ].join("\n");
}

function getSubheadingCount(articleText) {
  const lines = String(articleText || "").split(/\r?\n/);
  const labelIndex = lines.findIndex((line) => line.trim() === "Subheadings:");
  if (labelIndex < 0) {
    return 0;
  }

  let count = 0;
  for (let index = labelIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      break;
    }
    if (/^\u2022\s+/.test(line)) {
      count += 1;
    }
  }
  return count;
}

function hasExactlyOneLabel(articleText, label) {
  const matches = String(articleText || "").match(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"));
  return (matches || []).length === 1;
}

function assertWordRange(value, min, max, fieldPath, invalidFields) {
  const count = countBodyWords(value);
  if (count < min || count > max) {
    invalidFields.push(fieldPath);
  }
  return count;
}

function createAiValidationError(message, invalidFields = [], details = {}) {
  const error = new Error(message);
  error.invalidFields = Array.from(new Set(invalidFields.filter(Boolean)));
  error.validationDetails = details && typeof details === "object" ? details : {};
  return error;
}

function getPathValue(source, path) {
  return String(path || "").split(".").reduce((current, key) => (
    current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined
  ), source);
}

function setPathValue(target, path, value) {
  const keys = String(path || "").split(".").filter(Boolean);
  if (!keys.length) {
    return;
  }

  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
}

function coerceRepairValue(value) {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    for (const key of ["text", "value", "content", "replacement", "continuation", "body", "extension_700", "lead_100", "extension_200"]) {
      if (typeof value[key] === "string") {
        return value[key];
      }
      if (Array.isArray(value[key])) {
        return value[key];
      }
    }
  }
  return value;
}

function normalizeSubheadingList(values) {
  return (Array.isArray(values) ? values : [])
    .map((item) => removePublisherMentions(item).replace(/^\s*(?:Fact|Key Point|Main Update|Angle)\s*\d*\s*[:.-]?\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 2);
}

function hasBadSubheadingLabel(value) {
  return /^\s*(?:Fact\s*\d+|Key Point|Important Fact|Main Update|Angle\s*\d+|\d+[\).:-])\b/i.test(String(value || ""));
}

function extractNumberFacts(value) {
  return Array.from(String(value || "").matchAll(/\b\d+(?:[.,]\d+)*%?\b/g)).map((match) => match[0]).sort();
}

function assertSameNumberFacts(hindiBody, englishBody, invalidFields) {
  const hindiNumbers = extractNumberFacts(hindiBody).join("|");
  const englishNumbers = extractNumberFacts(englishBody).join("|");
  if (hindiNumbers !== englishNumbers) {
    console.warn("[ai-rewrite-validation] Hindi/English numeric tokens differ; continuing with source-grounded validation.");
  }
}

function normalizeSecondaryHeading(value, cleaner) {
  const cleaned = cleaner(value).replace(/\s*[:：]\s*/, " : ").trim();
  return cleaned;
}

// The colon is a separator, not a word, so it must not consume part of the
// 10-14 word budget.
function countSecondaryHeadlineWords(value) {
  return countBodyWords(String(value || "").replace(/\s*[:：]\s*/g, " "));
}

function inspectSecondaryHeadline(value) {
  const text = String(value || "").trim();
  const match = text.match(/^([\s\S]*?)\s*[:：]\s*([\s\S]*)$/);
  if (!match) {
    return { valid: false, reason: "missing_colon", totalWords: countSecondaryHeadlineWords(text), keywordWords: 0 };
  }

  const keywordWords = countBodyWords(match[1].replace(/[,،]/g, " "));
  const headlineWords = countBodyWords(match[2]);
  const totalWords = keywordWords + headlineWords;

  if (keywordWords < AI_SECONDARY_KEYWORDS_MIN || keywordWords > AI_SECONDARY_KEYWORDS_MAX) {
    return { valid: false, reason: "keyword_count", totalWords, keywordWords };
  }
  if (!headlineWords) {
    return { valid: false, reason: "missing_headline", totalWords, keywordWords };
  }
  if (totalWords < AI_SECONDARY_HEADLINE_MIN_WORDS || totalWords > AI_SECONDARY_HEADLINE_MAX_WORDS) {
    return { valid: false, reason: "total_word_count", totalWords, keywordWords };
  }

  return { valid: true, reason: null, totalWords, keywordWords };
}

// Hindi-only mode uses three subheadings (two factual + one short standalone
// one), unlike the legacy bilingual mode's two, so it gets its own normalizer
// rather than changing the shared slice(0, 2) used by the legacy path.
function normalizeHindiOnlySubheadingList(values) {
  return (Array.isArray(values) ? values : [])
    .map((item) => removePublisherMentions(item).replace(/^\s*(?:Fact|Key Point|Main Update|Angle)\s*\d*\s*[:.-]?\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function inspectStandaloneSubheading(value) {
  const text = String(value || "").trim();
  const totalWords = countBodyWords(text);
  if (!text || !hasHindiText(text)) {
    return { valid: false, reason: "missing", totalWords };
  }
  if (hasBadSubheadingLabel(text)) {
    return { valid: false, reason: "bad_label", totalWords };
  }
  if (totalWords < AI_STANDALONE_SUBHEADING_MIN_WORDS || totalWords > AI_STANDALONE_SUBHEADING_MAX_WORDS) {
    return { valid: false, reason: "word_count", totalWords };
  }
  return { valid: true, reason: null, totalWords };
}

function inspectPlaceName(value) {
  const text = String(value || "").trim();
  const totalWords = countBodyWords(text);
  if (!text || !hasHindiText(text)) {
    return { valid: false, reason: "missing", totalWords };
  }
  if (totalWords > AI_PLACE_NAME_MAX_WORDS) {
    return { valid: false, reason: "too_long", totalWords };
  }
  return { valid: true, reason: null, totalWords };
}

// Best-effort fallback only: derives the place from the body's own opening
// dateline (e.g. "भोपाल. ...") so place_name is never empty even if the model
// omits classification.place_name. Not used to reject/retry a response.
function derivePlaceNameFromBody(body) {
  const text = String(body || "").trim();
  const match = text.match(/^([ऀ-ॿ][ऀ-ॿ\s]{0,28}?)\s*[.।]\s/);
  return match ? match[1].trim() : "";
}

function buildFallbackSecondaryHeading(heading, language) {
  const words = cleanGeneratedText(heading).split(/\s+/).filter(Boolean);
  if (!words.length) {
    return "";
  }
  const keywordCount = Math.min(3, Math.max(2, Math.floor(words.length / 4)));
  const keywords = words.slice(0, keywordCount).join(language === "hindi" ? ", " : ", ");
  return `${keywords} : ${cleanGeneratedText(heading)}`;
}

function normalizeCompactLanguagePackage(languagePayload, language) {
  const normalized = languagePayload && typeof languagePayload === "object" ? languagePayload : {};
  const cleaner = language === "hindi" ? removePublisherMentions : cleanGeneratedText;
  const heading = cleaner(normalized.heading);
  const secondaryHeading = normalizeSecondaryHeading(normalized.secondary_heading, cleaner) ||
    buildFallbackSecondaryHeading(heading, language);
  return {
    heading,
    secondary_heading: secondaryHeading,
    subheadings: normalizeSubheadingList(normalized.subheadings),
    photo_caption: cleaner(normalized.photo_caption),
    lead_100: cleaner(normalized.lead_100),
    extension_200: cleaner(normalized.extension_200),
    extension_700: cleaner(normalized.extension_700),
  };
}

function buildCompactBilingualPayload(compactPayload, articleRecord, articleText, options = {}) {
  const invalidFields = [];
  const validationDetails = {};
  const normalized = compactPayload && typeof compactPayload === "object" ? compactPayload : {};
  const classification = normalized.classification && typeof normalized.classification === "object"
    ? normalized.classification
    : {};
  const category = validateAiGeneratedCategory(classification.category, {
    ...options,
    articleId: articleRecord?.id,
    articleTitle: articleRecord?.title,
    articleText: articleText?.combinedText,
    sourceTitle: articleText?.title,
    sourceExcerpt: articleRecord?.source_excerpt,
    sourceUrl: articleRecord?.source_url,
  });
  const confidence = normalizeAiConfidence(classification.confidence);
  const reason = normalizeClassificationReason(classification.reason);
  const keywords = Array.isArray(classification.keywords)
    ? classification.keywords.map((item) => removePublisherMentions(item)).filter(Boolean).slice(0, 5)
    : [];
  const hindi = normalizeCompactLanguagePackage(normalized.hindi, "hindi");
  const english = normalizeCompactLanguagePackage(normalized.english, "english");

  if (!normalized.classification || typeof normalized.classification !== "object") {
    invalidFields.push("classification");
  }
  if (!AI_ALLOWED_CATEGORIES.includes(String(classification.category || "").trim())) {
    invalidFields.push("classification.category");
  }
  if (!Number.isFinite(Number(classification.confidence)) || Number(classification.confidence) < 0 || Number(classification.confidence) > 1) {
    invalidFields.push("classification.confidence");
  }
  if (!reason) {
    invalidFields.push("classification.reason");
  }
  if (!normalized.hindi || typeof normalized.hindi !== "object") {
    invalidFields.push("hindi");
  }
  if (!normalized.english || typeof normalized.english !== "object") {
    invalidFields.push("english");
  }

  for (const language of ["hindi", "english"]) {
    const pack = language === "hindi" ? hindi : english;
    const textCheck = language === "hindi" ? hasHindiText : hasEnglishText;
    const oppositeCheck = language === "hindi" ? hasEnglishText : hasHindiText;
    for (const field of ["heading", "photo_caption", "lead_100", "extension_200", "extension_700"]) {
      if (!pack[field]) {
        invalidFields.push(`${language}.${field}`);
      } else if (!textCheck(pack[field])) {
        invalidFields.push(`${language}.${field}`);
      }
    }

    if (!Array.isArray(pack.subheadings) || pack.subheadings.length !== 2) {
      invalidFields.push(`${language}.subheadings`);
    }
    pack.subheadings.forEach((subheading, index) => {
      if (!subheading || !textCheck(subheading) || oppositeCheck(subheading) || hasBadSubheadingLabel(subheading)) {
        invalidFields.push(`${language}.subheadings.${index}`);
      }
    });
  }

  if (cleanGeneratedText(english.heading).toLowerCase() === cleanGeneratedText(hindi.heading).toLowerCase()) {
    invalidFields.push("english.heading");
  }
  if (hasHindiText([
    english.heading,
    english.photo_caption,
    english.lead_100,
    english.extension_200,
    english.extension_700,
    ...english.subheadings,
  ].join(" "))) {
    invalidFields.push("english");
  }
  const hindiProgressive = normalizeProgressiveBodies(hindi, "hindi");
  const englishProgressive = normalizeProgressiveBodies(english, "english");
  invalidFields.push(...hindiProgressive.invalidFields, ...englishProgressive.invalidFields);
  Object.assign(validationDetails, hindiProgressive.details, englishProgressive.details);

  assertSameNumberFacts(
    hindiProgressive.bodies.body1000,
    englishProgressive.bodies.body1000,
    invalidFields
  );

  for (const language of ["hindi", "english"]) {
    const source = normalized[language] || {};
    if (source.image_url || source.image_prompt || source.link || source.source) {
      invalidFields.push(`${language}.image_url`);
    }
  }
  if (normalized.image_url || normalized.image_prompt || classification.image_url || classification.image_prompt) {
    invalidFields.push("image_url");
  }

  if (invalidFields.length) {
    throw createAiValidationError(
      `Gemini compact bilingual response failed validation: ${Array.from(new Set(invalidFields)).join(", ")}.`,
      invalidFields,
      validationDetails
    );
  }

  let uiHindi = enforceMpCategoryOverride({
    title: hindi.heading,
    secondary_headline: hindi.secondary_heading,
    subheadings: hindi.subheadings,
    short_100: assemblePublishableArticle({
      heading: hindi.heading,
      secondaryHeading: hindi.secondary_heading,
      photoCaption: hindi.photo_caption,
      body: hindiProgressive.bodies.body100,
    }),
    medium_300: assemblePublishableArticle({
      heading: hindi.heading,
      secondaryHeading: hindi.secondary_heading,
      photoCaption: hindi.photo_caption,
      body: hindiProgressive.bodies.body300,
    }),
    long_500: assemblePublishableArticle({
      heading: hindi.heading,
      secondaryHeading: hindi.secondary_heading,
      photoCaption: hindi.photo_caption,
      body: hindiProgressive.bodies.body1000,
    }),
    keywords,
    category,
    state: removePublisherMentions(classification.state) || "\u0930\u093e\u0937\u094d\u091f\u094d\u0930\u0940\u092f",
    confidence,
    reason,
    image_url: "",
    image_prompt: "",
    source: "GE News Hub \u0930\u093f\u092a\u094b\u0930\u094d\u091f",
    link: String(articleRecord?.source_url || "").trim(),
  }, {
    articleId: articleRecord?.id,
    articleTitle: articleRecord?.title,
    articleText: articleText?.combinedText,
    sourceTitle: articleText?.title,
    sourceExcerpt: articleRecord?.source_excerpt,
    sourceUrl: articleRecord?.source_url,
  });

  const englishShort100 = assemblePublishableArticle({
    heading: english.heading,
    secondaryHeading: english.secondary_heading,
    photoCaption: english.photo_caption,
    body: englishProgressive.bodies.body100,
  });
  const englishMedium300 = assemblePublishableArticle({
    heading: english.heading,
    secondaryHeading: english.secondary_heading,
    photoCaption: english.photo_caption,
    body: englishProgressive.bodies.body300,
  });
  const englishLong1000 = assemblePublishableArticle({
    heading: english.heading,
    secondaryHeading: english.secondary_heading,
    photoCaption: english.photo_caption,
    body: englishProgressive.bodies.body1000,
  });

  const assembledArticles = [
    uiHindi.short_100,
    uiHindi.medium_300,
    uiHindi.long_500,
    englishShort100,
    englishMedium300,
    englishLong1000,
  ];
  for (const article of assembledArticles) {
    if (!hasExactlyOneLabel(article, "Photo Caption:")) {
      throw createAiValidationError("Assembled bilingual article structure is invalid.", ["hindi.photo_caption", "english.photo_caption"]);
    }
  }

  return {
    english: {
      headline: english.heading,
      secondary_headline: english.secondary_heading,
      top_summary: english.subheadings,
      short_description: englishShort100,
      long_description: englishLong1000,
      what_to_watch_next: englishMedium300,
    },
    hindi: {
      headline: hindi.heading,
      secondary_headline: hindi.secondary_heading,
      top_summary: hindi.subheadings,
      short_description: uiHindi.short_100,
      long_description: uiHindi.long_500,
      what_to_watch_next: uiHindi.medium_300,
    },
    ui_hindi: {
      ...uiHindi,
      secondary_headline: hindi.secondary_heading,
      subheadings: hindi.subheadings,
    },
    ui_english: {
      title: english.heading,
      secondary_headline: english.secondary_heading,
      short_100: englishShort100,
      medium_300: englishMedium300,
      long_500: englishLong1000,
      subheadings: english.subheadings,
      category: uiHindi.category,
      state: uiHindi.state,
      source: uiHindi.source,
      link: uiHindi.link,
      image_url: "",
      image_prompt: "",
    },
    _compact_counts: {
      hindi: hindiProgressive.counts,
      english: englishProgressive.counts,
    },
    _compact_repair_plan: normalized._compact_repair_plan || null,
  };
}

function buildHindiOnlyPayload(rawPayload, articleRecord, articleText, options = {}) {
  const invalidFields = [];
  const validationDetails = {};
  const normalized = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const classification = normalized.classification && typeof normalized.classification === "object"
    ? normalized.classification
    : {};
  const category = validateAiGeneratedCategory(classification.category, {
    ...options,
    articleId: articleRecord?.id,
    articleTitle: articleRecord?.title,
    articleText: articleText?.combinedText,
    sourceTitle: articleText?.title,
    sourceExcerpt: articleRecord?.source_excerpt,
    sourceUrl: articleRecord?.source_url,
  });
  const confidence = normalizeAiConfidence(classification.confidence);
  const reason = normalizeClassificationReason(classification.reason);
  const keywords = Array.isArray(classification.keywords)
    ? classification.keywords.map((item) => removePublisherMentions(item)).filter(Boolean).slice(0, 5)
    : [];

  const hindiRaw = normalized.hindi && typeof normalized.hindi === "object" ? normalized.hindi : {};
  const heading = removePublisherMentions(hindiRaw.heading);
  const secondaryHeading = normalizeSecondaryHeading(hindiRaw.secondary_heading, removePublisherMentions) ||
    buildFallbackSecondaryHeading(heading, "hindi");
  const subheadings = normalizeHindiOnlySubheadingList(hindiRaw.subheadings);
  const photoCaption = removePublisherMentions(hindiRaw.photo_caption);
  const body = removePublisherMentions(hindiRaw.body);

  if (!normalized.classification || typeof normalized.classification !== "object") {
    invalidFields.push("classification");
  }
  if (!AI_ALLOWED_CATEGORIES.includes(String(classification.category || "").trim())) {
    invalidFields.push("classification.category");
  }
  if (!Number.isFinite(Number(classification.confidence)) || Number(classification.confidence) < 0 || Number(classification.confidence) > 1) {
    invalidFields.push("classification.confidence");
  }
  if (!reason) {
    invalidFields.push("classification.reason");
  }
  if (!heading || !hasHindiText(heading)) {
    invalidFields.push("hindi.heading");
  }
  const secondaryCheck = inspectSecondaryHeadline(secondaryHeading);
  if (!secondaryHeading || !hasHindiText(secondaryHeading) || !secondaryCheck.valid) {
    invalidFields.push("hindi.secondary_heading");
    validationDetails["hindi.secondary_heading"] = {
      reason: secondaryCheck.reason || "missing",
      total_words: secondaryCheck.totalWords,
      keyword_words: secondaryCheck.keywordWords,
      min: AI_SECONDARY_HEADLINE_MIN_WORDS,
      max: AI_SECONDARY_HEADLINE_MAX_WORDS,
    };
  }
  if (!photoCaption || !hasHindiText(photoCaption)) {
    invalidFields.push("hindi.photo_caption");
  }
  if (!body || !hasHindiText(body)) {
    invalidFields.push("hindi.body");
  }
  if (subheadings.length !== 3) {
    invalidFields.push("hindi.subheadings");
  }
  subheadings.forEach((subheading, index) => {
    if (!subheading || !hasHindiText(subheading) || hasBadSubheadingLabel(subheading)) {
      invalidFields.push(`hindi.subheadings.${index}`);
    }
  });
  if (subheadings.length === 3) {
    const standaloneCheck = inspectStandaloneSubheading(subheadings[2]);
    if (!standaloneCheck.valid) {
      invalidFields.push("hindi.subheadings.2");
      validationDetails["hindi.subheadings.2"] = {
        reason: standaloneCheck.reason,
        total_words: standaloneCheck.totalWords,
        min: AI_STANDALONE_SUBHEADING_MIN_WORDS,
        max: AI_STANDALONE_SUBHEADING_MAX_WORDS,
      };
    }
  }

  const rawPlaceName = removePublisherMentions(classification.place_name);
  const placeNameCheck = inspectPlaceName(rawPlaceName);
  const placeName = placeNameCheck.valid
    ? rawPlaceName
    : (derivePlaceNameFromBody(body) || removePublisherMentions(classification.state) || "राष्ट्रीय");

  const tiers = normalizeSingleBodyTiers(body, "hindi");
  invalidFields.push(...tiers.invalidFields);
  Object.assign(validationDetails, tiers.details);

  if (normalized.image_url || normalized.image_prompt || classification.image_url || classification.image_prompt || hindiRaw.image_url) {
    invalidFields.push("image_url");
  }

  if (invalidFields.length) {
    throw createAiValidationError(
      `Gemini Hindi-only response failed validation: ${Array.from(new Set(invalidFields)).join(", ")}.`,
      invalidFields,
      validationDetails
    );
  }

  let uiHindi = enforceMpCategoryOverride({
    title: heading,
    secondary_headline: secondaryHeading,
    subheadings,
    short_100: assemblePublishableArticle({
      heading,
      secondaryHeading,
      photoCaption,
      body: tiers.bodies.body100,
    }),
    medium_300: AI_MEDIUM_REWRITE_ENABLED
      ? assemblePublishableArticle({
          heading,
          secondaryHeading,
          photoCaption,
          body: tiers.bodies.body300,
        })
      : "",
    long_500: assemblePublishableArticle({
      heading,
      secondaryHeading,
      photoCaption,
      body: tiers.bodies.body1000,
    }),
    keywords,
    category,
    state: removePublisherMentions(classification.state) || "राष्ट्रीय",
    place_name: placeName,
    confidence,
    reason,
    image_url: "",
    image_prompt: "",
    source: "GE News Hub रिपोर्ट",
    link: String(articleRecord?.source_url || "").trim(),
  }, {
    articleId: articleRecord?.id,
    articleTitle: articleRecord?.title,
    articleText: articleText?.combinedText,
    sourceTitle: articleText?.title,
    sourceExcerpt: articleRecord?.source_excerpt,
    sourceUrl: articleRecord?.source_url,
    feedSource: articleRecord?.feed_source,
  });

  for (const article of [uiHindi.short_100, uiHindi.long_500, AI_MEDIUM_REWRITE_ENABLED ? uiHindi.medium_300 : null].filter(Boolean)) {
    if (!hasExactlyOneLabel(article, "Photo Caption:")) {
      throw createAiValidationError("Assembled Hindi-only article structure is invalid.", ["hindi.photo_caption"]);
    }
  }

  return {
    _mode: "hindi-only",
    english: {
      headline: "",
      secondary_headline: "",
      top_summary: [],
      short_description: "",
      long_description: "",
      what_to_watch_next: "",
    },
    hindi: {
      headline: heading,
      secondary_headline: secondaryHeading,
      top_summary: subheadings,
      short_description: uiHindi.short_100,
      long_description: uiHindi.long_500,
      what_to_watch_next: AI_MEDIUM_REWRITE_ENABLED ? uiHindi.medium_300 : "",
    },
    ui_hindi: {
      ...uiHindi,
      secondary_headline: secondaryHeading,
      subheadings,
    },
    ui_english: {
      title: "",
      secondary_headline: "",
      short_100: "",
      medium_300: "",
      long_500: "",
      subheadings: [],
      category: uiHindi.category,
      state: uiHindi.state,
      source: uiHindi.source,
      link: uiHindi.link,
      image_url: "",
      image_prompt: "",
    },
    _compact_counts: {
      hindi: tiers.counts,
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

function insertBeforePhotoCaption(articleText, additionText) {
  const article = String(articleText || "").trim();
  const addition = cleanGeneratedText(additionText);
  if (!article || !addition) {
    return article;
  }

  const captionMatch = article.match(/\n\s*Photo Caption\s*:/i);
  if (!captionMatch || typeof captionMatch.index !== "number") {
    return `${article}\n\n${addition}`;
  }

  const beforeCaption = article.slice(0, captionMatch.index).trimEnd();
  const caption = article.slice(captionMatch.index).trimStart();
  return `${beforeCaption}\n\n${addition}\n\n${caption}`;
}

async function addLongRewriteSupplement(payload, articleRecord, articleText) {
  let nextLong = cleanGeneratedText(payload.long_500);
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentCount = countArticleWords(nextLong);
    if (currentCount >= AI_LONG_REWRITE_MIN_WORDS && currentCount <= AI_LONG_REWRITE_MAX_WORDS) {
      return nextLong;
    }

    if (currentCount >= AI_LONG_REWRITE_MAX_WORDS) {
      throw new Error(
        `Gemini supplemented long_500 word count ${currentCount} is outside ${AI_LONG_REWRITE_MIN_WORDS}-${AI_LONG_REWRITE_MAX_WORDS}.`
      );
    }

    const needed = AI_LONG_REWRITE_MIN_WORDS - currentCount;
    const available = AI_LONG_REWRITE_MAX_WORDS - currentCount;
    const minAdditionWords = Math.max(40, Math.min(needed, available));
    const maxAdditionWords = Math.max(minAdditionWords, Math.min(available, needed + 80));
    const prompt = `The Hindi long_500 article is still short.
Current word count: ${currentCount}
Required final word count: ${AI_LONG_REWRITE_MIN_WORDS} to ${AI_LONG_REWRITE_MAX_WORDS}

Return only valid JSON:
{"addition": ""}

Write an addition of ${minAdditionWords} to ${maxAdditionWords} Hindi words.
Rules:
- Do not write a new headline, Subheadings section, bullet list, or Photo Caption.
- Write body paragraphs only, continuing the same report.
- Safely add background, public impact, official-attribution language, implementation/review process, and reader caution.
- Do not add new names, numbers, quotes, FIRs, deaths, arrests, dates, legal claims, or unsupported facts.
- Do not mention any publisher, publication, website, reporter, or agency except GE News Hub.
- Keep it ready to insert before Photo Caption.

Article title: ${payload.title || articleRecord.title || ""}
Category: ${payload.category || articleRecord.category || ""}
State: ${payload.state || ""}
Raw article:
${truncateText(articleText.combinedText, 9000)}

Current long_500:
${truncateText(nextLong, 8000)}`;

    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGeminiRequestBody([
        {
          role: "user",
          content: prompt,
        },
      ], {
        temperature: 0.2,
        maxTokens: 2500,
      })),
    });

    const supplementPayload = await response.json();
    logGeminiUsage(supplementPayload, {
      articleId: articleRecord?.id,
      mode: AI_REWRITE_MODES.HINDI_LEGACY,
      call: "legacy-long-supplement",
    });
    const supplementInfo = getGeminiResponseInfo(supplementPayload, {
      maxTokens: 2500,
      call: "legacy-long-supplement",
    });
    logGeminiResponseInfo(supplementInfo, {
      articleId: articleRecord?.id,
      mode: AI_REWRITE_MODES.HINDI_LEGACY,
    });
    if (!response.ok) {
      lastError = new Error(
        supplementPayload?.error?.message || `Gemini long_500 supplement failed with status ${response.status}.`
      );
      if (response.status === 429 || response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
      throw lastError;
    }
    const supplementTerminationError = createGeminiTerminationError(supplementInfo);
    if (supplementTerminationError) {
      lastError = supplementTerminationError;
      if (supplementTerminationError.transient) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
      throw supplementTerminationError;
    }

    const rawSupplementJson = supplementInfo.content;
    const parsedSupplement = parseJsonResponse(rawSupplementJson);
    const addition = cleanGeneratedText(parsedSupplement.addition);
    if (!addition) {
      lastError = new Error("Gemini long_500 supplement response was missing addition.");
      continue;
    }

    nextLong = insertBeforePhotoCaption(nextLong, addition);
  }

  const finalCount = countArticleWords(nextLong);
  if (finalCount >= AI_LONG_REWRITE_MIN_WORDS && finalCount <= AI_LONG_REWRITE_MAX_WORDS) {
    return nextLong;
  }

  throw lastError || new Error(
    `Gemini supplemented long_500 word count ${finalCount} is outside ${AI_LONG_REWRITE_MIN_WORDS}-${AI_LONG_REWRITE_MAX_WORDS}.`
  );
}

async function expandLongRewriteIfNeeded(payload, articleRecord, articleText, previousReason = "") {
  if (!hasUiHindiShape(payload)) {
    return payload;
  }

  const originalCount = countArticleWords(payload.long_500);
  if (originalCount >= AI_LONG_REWRITE_MIN_WORDS && originalCount <= AI_LONG_REWRITE_MAX_WORDS) {
    return payload;
  }

  let lastError = new Error(
    `Gemini response long_500 word count ${originalCount} is outside ${AI_LONG_REWRITE_MIN_WORDS}-${AI_LONG_REWRITE_MAX_WORDS}.`
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentCount = countArticleWords(payload.long_500);
    const prompt = `You returned a Hindi news JSON object, but long_500 is not the required 1000-word version.
Current long_500 word count: ${currentCount}
Required word count: ${AI_LONG_REWRITE_MIN_WORDS} to ${AI_LONG_REWRITE_MAX_WORDS}
Previous rejection reason: ${previousReason || lastError.message}

Return only valid JSON in this exact shape:
{"long_500": ""}

Rules for long_500:
- Write only the replacement value for long_500.
- It must be a complete Hindi GE News Hub article of ${AI_LONG_REWRITE_MIN_WORDS} to ${AI_LONG_REWRITE_MAX_WORDS} words.
- Keep this structure: headline, Subheadings:, four bullet subheadings, Agency GE News Hub body, and Photo Caption: at the end.
- Body should have 7 to 10 short paragraphs.
- Safely expand with background, official attribution language, public impact, implementation/review process, and what readers should watch next.
- Do not invent names, numbers, quotes, FIRs, deaths, arrests, dates, legal claims, or unsupported facts.
- Do not mention any publisher, publication, website, reporter, or agency except GE News Hub.
- Use the same event, category, state, source and link context from the original JSON and raw article.

Original JSON context:
${JSON.stringify({
  title: payload.title,
  short_100: payload.short_100,
  medium_300: payload.medium_300,
  category: payload.category,
  state: payload.state,
  source: payload.source,
  link: payload.link,
})}

Current too-short/too-long long_500:
${truncateText(payload.long_500, 6000)}

Raw article:
${truncateText(articleText.combinedText, 10000)}`;

    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGeminiRequestBody([
        {
          role: "user",
          content: prompt,
        },
      ], {
        temperature: 0.2,
        maxTokens: 7000,
      })),
    });

    const expansionPayload = await response.json();
    logGeminiUsage(expansionPayload, {
      articleId: articleRecord?.id,
      mode: AI_REWRITE_MODES.HINDI_LEGACY,
      call: "legacy-long-expansion",
    });
    const expansionInfo = getGeminiResponseInfo(expansionPayload, {
      maxTokens: 7000,
      call: "legacy-long-expansion",
    });
    logGeminiResponseInfo(expansionInfo, {
      articleId: articleRecord?.id,
      mode: AI_REWRITE_MODES.HINDI_LEGACY,
    });
    if (!response.ok) {
      lastError = new Error(
        expansionPayload?.error?.message || `Gemini long_500 expansion failed with status ${response.status}.`
      );
      if (response.status === 429 || response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
      throw lastError;
    }
    const expansionTerminationError = createGeminiTerminationError(expansionInfo);
    if (expansionTerminationError) {
      lastError = expansionTerminationError;
      if (expansionTerminationError.transient) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
      throw expansionTerminationError;
    }

    const rawLongJson = expansionInfo.content;
    const parsedLong = parseJsonResponse(rawLongJson);
    const nextLong = cleanGeneratedText(parsedLong.long_500);
    if (!nextLong) {
      lastError = new Error("Gemini long_500 expansion response was missing long_500.");
      continue;
    }

    const nextCount = countArticleWords(nextLong);
    if (nextCount >= AI_LONG_REWRITE_MIN_WORDS && nextCount <= AI_LONG_REWRITE_MAX_WORDS) {
      return {
        ...payload,
        long_500: nextLong,
      };
    }

    if (nextCount < AI_LONG_REWRITE_MIN_WORDS) {
      try {
        const supplementedLong = await addLongRewriteSupplement(
          {
            ...payload,
            long_500: nextLong,
          },
          articleRecord,
          articleText
        );
        return {
          ...payload,
          long_500: supplementedLong,
        };
      } catch (error) {
        lastError = error;
      }
    }

    lastError = new Error(
      `Gemini expansion long_500 word count ${nextCount} is outside ${AI_LONG_REWRITE_MIN_WORDS}-${AI_LONG_REWRITE_MAX_WORDS}.`
    );
    if (nextCount > originalCount && nextCount < AI_LONG_REWRITE_MIN_WORDS) {
      payload = {
        ...payload,
        long_500: nextLong,
      };
    }
  }

  throw lastError;
}

function validateAiPayload(payload, options = {}) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Gemini response was not a valid object.");
  }

  if (hasBuiltHindiOnlyShape(payload)) {
    if (!payload.ui_hindi.short_100 || !payload.ui_hindi.long_500 || (AI_MEDIUM_REWRITE_ENABLED && !payload.ui_hindi.medium_300)) {
      throw new Error("Gemini Hindi-only payload is missing required body fields.");
    }
    return payload;
  }

  if (hasHindiOnlyShape(payload)) {
    return buildHindiOnlyPayload(payload, options.articleRecord, options.articleTextObject, options);
  }

  if (hasCompactBilingualShape(payload)) {
    return buildCompactBilingualPayload(payload, options.articleRecord, options.articleTextObject, options);
  }

  if (hasBilingualPayloadShape(payload)) {
    const invalidFields = [];
    const english = payload.english || {};
    const hindi = payload.hindi || {};
    const uiHindi = normalizeUiHindiPayload(payload.ui_hindi, {
      ...options,
      strictCategory: true,
    });

    for (const language of ["english", "hindi"]) {
      const block = language === "english" ? english : hindi;
      for (const field of ["headline", "short_description", "long_description", "what_to_watch_next"]) {
        if (!cleanGeneratedText(block[field])) {
          invalidFields.push(`${language}.${field}`);
        }
      }
      const summary = cleanSummaryList(block.top_summary);
      if (summary.length !== 2 || summary.some(hasBadSubheadingLabel)) {
        invalidFields.push(`${language}.top_summary`);
      }
    }

    if (!hasHindiText(hindi.headline) || !hasHindiText(hindi.short_description) || !hasHindiText(hindi.long_description)) {
      invalidFields.push("hindi");
    }
    if (!hasEnglishText(english.headline) || !hasEnglishText(english.short_description) || !hasEnglishText(english.long_description)) {
      invalidFields.push("english");
    }
    if (cleanGeneratedText(english.short_description) === cleanGeneratedText(hindi.short_description)) {
      invalidFields.push("english.short_description");
    }
    if (!uiHindi.short_100 || !uiHindi.long_500 || (AI_MEDIUM_REWRITE_ENABLED && !uiHindi.medium_300)) {
      invalidFields.push("ui_hindi");
    }

    if (invalidFields.length) {
      throw createAiValidationError(
        `Gemini bilingual payload failed validation: ${Array.from(new Set(invalidFields)).join(", ")}.`,
        invalidFields
      );
    }

    return {
      english: {
        headline: cleanGeneratedText(english.headline),
        secondary_headline: cleanGeneratedText(english.secondary_headline) || payload.ui_english?.secondary_headline || "",
        top_summary: cleanSummaryList(english.top_summary).slice(0, 2),
        short_description: cleanGeneratedText(english.short_description),
        long_description: cleanGeneratedText(english.long_description),
        what_to_watch_next: cleanGeneratedText(english.what_to_watch_next),
      },
      hindi: {
        headline: cleanGeneratedText(hindi.headline),
        secondary_headline: cleanGeneratedText(hindi.secondary_headline) || payload.ui_hindi?.secondary_headline || "",
        top_summary: cleanSummaryList(hindi.top_summary).slice(0, 2),
        short_description: cleanGeneratedText(hindi.short_description),
        long_description: cleanGeneratedText(hindi.long_description),
        what_to_watch_next: cleanGeneratedText(hindi.what_to_watch_next),
      },
      ui_hindi: {
        ...uiHindi,
        secondary_headline: cleanGeneratedText(hindi.secondary_headline) || payload.ui_hindi?.secondary_headline || "",
        subheadings: Array.isArray(payload.ui_hindi?.subheadings)
          ? cleanSummaryList(payload.ui_hindi.subheadings).slice(0, 2)
          : cleanSummaryList(hindi.top_summary).slice(0, 2),
      },
      ui_english: payload.ui_english && typeof payload.ui_english === "object"
        ? payload.ui_english
        : undefined,
    };
  }

  if (hasUiHindiShape(payload)) {
    if (options.requireClassificationMetadata) {
      const rawConfidence = Number(payload.confidence);
      if (!Number.isFinite(rawConfidence) || rawConfidence < 0 || rawConfidence > 1) {
        throw new Error("Gemini response confidence must be a number between 0 and 1.");
      }

      if (!cleanGeneratedText(payload.reason)) {
        throw new Error("Gemini response is missing reason.");
      }
    }

    const uiHindi = normalizeUiHindiPayload(payload, {
      ...options,
      strictCategory: true,
    });
    const requiredFields = ["title", "short_100", "long_500", "category", "state", "source", "link"];
    if (AI_MEDIUM_REWRITE_ENABLED) {
      requiredFields.splice(2, 0, "medium_300");
    }
    for (const field of requiredFields) {
      if (!uiHindi[field]) {
        throw new Error(`Gemini response is missing ${field}.`);
      }
    }

    for (const field of ["title", "short_100", "long_500", AI_MEDIUM_REWRITE_ENABLED ? "medium_300" : null].filter(Boolean)) {
      if (!hasHindiText(uiHindi[field])) {
        throw new Error(`Gemini response field ${field} is not Hindi.`);
      }
    }

    const longWordCount = countArticleWords(uiHindi.long_500);
    if (longWordCount < AI_LONG_REWRITE_MIN_WORDS || longWordCount > AI_LONG_REWRITE_MAX_WORDS) {
      throw new Error(
        `Gemini response long_500 word count ${longWordCount} is outside ${AI_LONG_REWRITE_MIN_WORDS}-${AI_LONG_REWRITE_MAX_WORDS}.`
      );
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

function isCurrentAiRewritePrompt(record) {
  return String(record?.prompt_version || "").trim() === AI_PROMPT_VERSION;
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
  const normalizedPayload = validateAiPayload(payload);
  const english = normalizedPayload.english || {};
  const hindi = normalizedPayload.hindi || {};
  const uiHindi = normalizedPayload.ui_hindi || (hasUiHindiShape(payload) ? normalizeUiHindiPayload(payload) : null);

  const existingRewrite = await findAiRewriteByNewsId(dbPool, newsId);
  if (existingRewrite && isCurrentAiRewritePrompt(existingRewrite)) {
    return existingRewrite;
  }

  if (existingRewrite) {
    await dbPool.execute(
      `
        UPDATE ai_news_rewrites
        SET model_name = ?,
            prompt_version = ?,
            source_url = ?,
            source_title = ?,
            source_excerpt = ?,
            english_headline = ?,
            english_secondary_headline = ?,
            english_top_summary = ?,
            english_short_description = ?,
            english_long_description = ?,
            english_what_to_watch_next = ?,
            hindi_headline = ?,
            hindi_secondary_headline = ?,
            hindi_top_summary = ?,
            hindi_short_description = ?,
            hindi_long_description = ?,
            hindi_what_to_watch_next = ?,
            ui_title = ?,
            ui_short_100 = ?,
            ui_medium_300 = ?,
            ui_long_500 = ?,
            ui_keywords_json = ?,
            ui_category = ?,
            ui_state = ?,
            ui_place_name = ?,
            ui_image_url = NULL,
            ui_image_prompt = NULL,
            ui_source = ?,
            ui_link = ?,
            raw_response = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE news_id = ?
      `,
      [
        modelName,
        promptVersion,
        sourceUrl,
        sourceTitle,
        sourceExcerpt,
        english.headline || null,
        english.secondary_headline || null,
        JSON.stringify(Array.isArray(english.top_summary) ? english.top_summary : []),
        english.short_description || null,
        english.long_description || null,
        english.what_to_watch_next || null,
        hindi.headline || null,
        hindi.secondary_headline || null,
        JSON.stringify(Array.isArray(hindi.top_summary) ? hindi.top_summary : []),
        hindi.short_description || null,
        hindi.long_description || null,
        hindi.what_to_watch_next || null,
        uiHindi?.title || null,
        uiHindi?.short_100 || null,
        AI_MEDIUM_REWRITE_ENABLED ? uiHindi?.medium_300 || null : null,
        uiHindi?.long_500 || null,
        JSON.stringify(Array.isArray(uiHindi?.keywords) ? uiHindi.keywords : []),
        uiHindi?.category || null,
        uiHindi?.state || null,
        uiHindi?.place_name || null,
        uiHindi?.source || null,
        uiHindi?.link || null,
        rawResponse,
        newsId,
      ]
    );
  } else {

    await dbPool.execute(
      dbPool.dialect === "postgres"
        ? `
            INSERT INTO ai_news_rewrites (
              news_id, model_name, prompt_version, source_url, source_title, source_excerpt,
              english_headline, english_secondary_headline, english_top_summary, english_short_description, english_long_description, english_what_to_watch_next,
              hindi_headline, hindi_secondary_headline, hindi_top_summary, hindi_short_description, hindi_long_description, hindi_what_to_watch_next,
              ui_title, ui_short_100, ui_medium_300, ui_long_500, ui_keywords_json, ui_category, ui_state, ui_place_name,
              ui_image_url, ui_image_prompt, ui_source, ui_link,
              raw_response
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (news_id) DO NOTHING
          `
        : `
            INSERT INTO ai_news_rewrites (
              news_id, model_name, prompt_version, source_url, source_title, source_excerpt,
              english_headline, english_secondary_headline, english_top_summary, english_short_description, english_long_description, english_what_to_watch_next,
              hindi_headline, hindi_secondary_headline, hindi_top_summary, hindi_short_description, hindi_long_description, hindi_what_to_watch_next,
              ui_title, ui_short_100, ui_medium_300, ui_long_500, ui_keywords_json, ui_category, ui_state, ui_place_name,
              ui_image_url, ui_image_prompt, ui_source, ui_link,
              raw_response
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE news_id = news_id
          `,
      [
        newsId,
        modelName,
        promptVersion,
        sourceUrl,
        sourceTitle,
        sourceExcerpt,
        english.headline || null,
        english.secondary_headline || null,
        JSON.stringify(Array.isArray(english.top_summary) ? english.top_summary : []),
        english.short_description || null,
        english.long_description || null,
        english.what_to_watch_next || null,
        hindi.headline || null,
        hindi.secondary_headline || null,
        JSON.stringify(Array.isArray(hindi.top_summary) ? hindi.top_summary : []),
        hindi.short_description || null,
        hindi.long_description || null,
        hindi.what_to_watch_next || null,
        uiHindi?.title || null,
        uiHindi?.short_100 || null,
        AI_MEDIUM_REWRITE_ENABLED ? uiHindi?.medium_300 || null : null,
        uiHindi?.long_500 || null,
        JSON.stringify(Array.isArray(uiHindi?.keywords) ? uiHindi.keywords : []),
        uiHindi?.category || null,
        uiHindi?.state || null,
        uiHindi?.place_name || null,
        null,
        null,
        uiHindi?.source || null,
        uiHindi?.link || null,
        rawResponse,
      ]
    );
  }

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
    await invalidateCategoryCache(dbPool);
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
      WHERE fn.category = ?
        AND air.news_id IS NULL
        AND ars.news_id IS NULL
        AND fn.fetched_at >= (NOW() - INTERVAL ? HOUR)
      ORDER BY fn.id DESC
      LIMIT ?
    `,
    [category, AI_REWRITE_MAX_SOURCE_AGE_HOURS, limit]
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
      // Navigation/menu chrome on the MP government portal. Scoped to this host only:
      // applied globally it silently dropped any news paragraph containing "Minister",
      // "collector" or "commissioner", which is routine wording in Indian reporting.
      /directory|judiciary|collector|commissioner|district news|minister|cabinet/i,
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

    // Many publishers (government CMS templates in particular) render article body
    // text in <div>s or <br>-separated blocks rather than <p>/<li>, so the harvest
    // above returns only boilerplate. Recover from the innerText of the most
    // specific content container that actually holds text. This reuses the page
    // already loaded, so it costs no extra navigation.
    const countWords = (value) => String(value || "").trim().split(/\s+/).filter(Boolean).length;
    const harvestedWords = paragraphs.reduce((total, text) => total + countWords(text), 0);

    if (harvestedWords < 120) {
      for (const root of candidateRoots) {
        const rootText = normalize(root.innerText || root.textContent);
        if (countWords(rootText) < 60) {
          continue;
        }

        for (const rawBlock of String(root.innerText || root.textContent || "").split(/\n+/)) {
          const text = removePatternMatches(rawBlock, sourceSpecificNoisePatterns);
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

        if (paragraphs.reduce((total, text) => total + countWords(text), 0) >= 120) {
          break;
        }
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
  if (
    message.includes("Could not extract enough article text") ||
    message.includes("Waiting for selector") ||
    message.includes("Navigation timeout") ||
    message.includes("ERR_ABORTED") ||
    message.includes("ERR_CONNECTION_RESET") ||
    message.includes("ERR_TIMED_OUT")
  ) {
    return true;
  }

  const invalidFields = Array.isArray(error?.invalidFields) ? error.invalidFields : [];
  if (invalidFields.length && invalidFields.every((field) => /_cumulative$/.test(field))) {
    return true;
  }

  return false;
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

function getGeminiCacheHitTokens(usage = {}) {
  return usage.cache_hit_tokens ??
    usage.prompt_cache_hit_tokens ??
    usage.prompt_cache_hit ??
    usage?.prompt_tokens_details?.cached_tokens ??
    null;
}

function getGeminiReasoningTokens(usage = {}) {
  return usage?.completion_tokens_details?.reasoning_tokens || 0;
}

function logGeminiUsage(payload, { articleId, mode, call }) {
  const usage = payload?.usage;
  if (!usage || typeof usage !== "object") {
    return;
  }

  console.log(
    `[ai-rewrite-usage] news_id=${articleId || "unknown"} mode=${mode} call=${call}` +
      ` prompt_tokens=${usage.prompt_tokens ?? ""}` +
      ` completion_tokens=${usage.completion_tokens ?? ""}` +
      ` total_tokens=${usage.total_tokens ?? ""}` +
      ` cache_hit_tokens=${getGeminiCacheHitTokens(usage) ?? ""}`
  );
}

function buildGeminiRequestBody(messages, {
  temperature = 0.2,
  maxTokens = 20000,
  responseFormat = { type: "json_object" },
} = {}) {
  return {
    model: GEMINI_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
    response_format: responseFormat,
  };
}

function getGeminiResponseInfo(payload, { maxTokens, call }) {
  const choice = payload?.choices?.[0];
  const usage = payload?.usage || {};
  const content = String(choice?.message?.content || "").trim();
  return {
    requested_model: GEMINI_MODEL,
    returned_model: payload?.model || "",
    thinking: "disabled",
    max_tokens: maxTokens,
    finish_reason: choice?.finish_reason || "unknown",
    prompt_tokens: usage.prompt_tokens ?? 0,
    completion_tokens: usage.completion_tokens ?? 0,
    reasoning_tokens: getGeminiReasoningTokens(usage),
    total_tokens: usage.total_tokens ?? 0,
    content_chars: content.length,
    call,
    content,
  };
}

function logGeminiResponseInfo(info, { articleId, mode }) {
  console.log(
    `[ai-rewrite-response] news_id=${articleId || "unknown"}` +
      ` mode=${mode || ""}` +
      ` call=${info.call || ""}` +
      ` requested_model=${info.requested_model}` +
      ` returned_model=${info.returned_model}` +
      ` thinking=${info.thinking}` +
      ` max_tokens=${info.max_tokens}` +
      ` finish_reason=${info.finish_reason}` +
      ` prompt_tokens=${info.prompt_tokens}` +
      ` completion_tokens=${info.completion_tokens}` +
      ` reasoning_tokens=${info.reasoning_tokens}` +
      ` total_tokens=${info.total_tokens}` +
      ` content_chars=${info.content_chars}`
  );
}

function resetGeminiCallBudget(articleId) {
  if (articleId !== undefined && articleId !== null) {
    geminiCallsByArticleId.delete(String(articleId));
  }
}

function claimGeminiCallBudget(articleId, call) {
  if (articleId === undefined || articleId === null) {
    return null;
  }

  const key = String(articleId);
  const used = geminiCallsByArticleId.get(key) || 0;
  if (used >= AI_REWRITE_MAX_GEMINI_CALLS_PER_ARTICLE) {
    const error = new Error(
      `AI rewrite skipped after ${used} Gemini calls for news_id=${key}; per-article limit is ${AI_REWRITE_MAX_GEMINI_CALLS_PER_ARTICLE}.`
    );
    error.code = "AI_REWRITE_GEMINI_CALL_LIMIT";
    error.skippable = true;
    throw error;
  }

  const nextUsed = used + 1;
  geminiCallsByArticleId.set(key, nextUsed);
  console.log(
    `[ai-rewrite-budget] news_id=${key} call=${call || ""}` +
      ` gemini_calls_used=${nextUsed}/${AI_REWRITE_MAX_GEMINI_CALLS_PER_ARTICLE}`
  );
  return nextUsed;
}

function createGeminiTerminationError(info) {
  if (info.finish_reason === "length") {
    return new Error("Gemini output was truncated because the generation token limit was reached.");
  }
  if (info.finish_reason === "content_filter") {
    return new Error("Gemini response was blocked by the provider content filter.");
  }
  if (info.finish_reason === "insufficient_system_resource") {
    const error = new Error("Gemini provider reported insufficient system resources.");
    error.transient = true;
    return error;
  }
  return null;
}

function getNextPacificMidnightTimestamp(now = new Date()) {
  const pacificFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = pacificFormatter.formatToParts(now).reduce((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});
  const pacificNoonUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1, 12, 0, 0);
  const nextParts = pacificFormatter.formatToParts(new Date(pacificNoonUtc)).reduce((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});
  const guessUtc = Date.UTC(Number(nextParts.year), Number(nextParts.month) - 1, Number(nextParts.day), 8, 0, 0);
  const guessPacific = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(guessUtc)).reduce((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});
  const offsetMinutes = (Number(guessPacific.hour) * 60 + Number(guessPacific.minute));
  return guessUtc - offsetMinutes * 60_000;
}

function getGeminiKeyCandidates() {
  const candidates = [];
  if (GEMINI_FREE_API_KEY && Date.now() >= geminiFreeKeyUnavailableUntil) {
    candidates.push({ label: "free", apiKey: GEMINI_FREE_API_KEY });
  }
  if (GEMINI_PAID_API_KEY && GEMINI_PAID_API_KEY !== GEMINI_FREE_API_KEY) {
    candidates.push({ label: "paid", apiKey: GEMINI_PAID_API_KEY });
  }
  if (!candidates.length && GEMINI_FREE_API_KEY) {
    candidates.push({ label: "free", apiKey: GEMINI_FREE_API_KEY });
  }
  return candidates;
}

function isQuotaExhaustedResponse(response, payload) {
  const message = String(payload?.error?.message || "").toLowerCase();
  return response.status === 429 && (
    payload?.error?.status === "RESOURCE_EXHAUSTED" ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("spending cap")
  );
}

function markFreeGeminiKeyExhausted() {
  const nextHourlyProbe = Date.now() + 60 * 60_000;
  const nextPacificReset = getNextPacificMidnightTimestamp(new Date());
  geminiFreeKeyUnavailableUntil = Math.min(nextHourlyProbe, nextPacificReset);
  console.warn(
    `[gemini-key] Free Gemini key exhausted; using paid key until next free-key probe at ` +
      `${new Date(geminiFreeKeyUnavailableUntil).toISOString()}. Daily quota reset is midnight Pacific.`
  );
}

async function requestGeminiJson(messages, {
  articleId,
  mode,
  call,
  temperature = 0.2,
  maxTokens = 20000,
  retries = 2,
} = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const keyCandidates = getGeminiKeyCandidates();
    if (!keyCandidates.length) {
      throw new Error("GEMINI_API_KEY is missing in .env.");
    }

    for (const keyCandidate of keyCandidates) {
      claimGeminiCallBudget(articleId, call);
      const response = await fetch(GEMINI_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${keyCandidate.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildGeminiRequestBody(messages, { temperature, maxTokens })),
      });

      const payload = await response.json();
      logGeminiUsage(payload, { articleId, mode, call });
      const responseInfo = getGeminiResponseInfo(payload, { maxTokens, call });
      logGeminiResponseInfo(responseInfo, { articleId, mode });

      if (response.ok) {
        console.log(`[gemini-key] News rewrite used ${keyCandidate.label} key.`);
        if (keyCandidate.label === "paid" && GEMINI_FREE_API_KEY && Date.now() < geminiFreeKeyUnavailableUntil) {
          console.warn("[gemini-key] Gemini request used paid fallback because free key is cooling down.");
        }
        const terminationError = createGeminiTerminationError(responseInfo);
        if (terminationError) {
          lastError = terminationError;
          if (terminationError.transient && attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
            continue;
          }
          throw terminationError;
        }
        return responseInfo;
      }

      lastError = new Error(payload?.error?.message || `Gemini request failed with status ${response.status}.`);
      if (keyCandidate.label === "free" && GEMINI_PAID_API_KEY && isQuotaExhaustedResponse(response, payload)) {
        markFreeGeminiKeyExhausted();
        continue;
      }

      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        break;
      }

      throw lastError;
    }

    if (attempt < retries) {
      continue;
    }

    if (lastError) {
      throw lastError;
    }
  }

  throw lastError || new Error("Gemini request failed.");
}

function buildRawArticleContextPrompt(articleRecord, articleText) {
  const sourceWordCount = countArticleWords(articleText.combinedText);
  return `RAW ARTICLE DETAILS
Publisher category to ignore: ${articleRecord.category || "uncategorized"}
Feed source: ${articleRecord.feed_source || "unknown"}
Original title: ${articleRecord.title || ""}
Original URL: ${articleRecord.source_url}
Source name: ${articleRecord.feed_source || "RSS"}
Extracted source word count: ${sourceWordCount}
`;
}

function buildCompactVariableArticlePrompt(articleRecord, articleText) {
  return `${buildRawArticleContextPrompt(articleRecord, articleText)}
OUTPUT LENGTH REMINDER
- Return both Hindi and English progressive bodies.
- Each language's lead_100 + extension_200 + extension_700 must contain at least 1100 body words. More is fine; less is not acceptable.
- Do not return only a 300-word or 600-word summary when the extracted source has enough material.

RAW ARTICLE TEXT
${truncateText(articleText.combinedText, 14000)}`;
}

function buildStage1CorePrompt(articleRecord, articleText) {
  return `${buildRawArticleContextPrompt(articleRecord, articleText)}

STAGE 1 OUTPUT
- Return classification, Hindi heading/secondary_heading/subheadings/photo_caption/lead_100/extension_200 and English heading/secondary_heading/subheadings/photo_caption/lead_100/extension_200.
- Do not return extension_700 yet.
- The core body must support local cumulative 300-word-minimum and 600-word-minimum normalization.
- In each language, lead_100 + extension_200 must total at least 600 body words, ideally 600-680.
- Do not stop Stage 1 around 150, 250 or 350 body words per language.

RAW ARTICLE TEXT
${truncateText(articleText.combinedText, 14000)}`;
}

function getStage1CurrentCounts(stage1Payload = {}) {
  const hindi = stage1Payload.hindi || {};
  const english = stage1Payload.english || {};
  const hindiCurrent = countArticleWords(`${hindi.lead_100 || ""}\n\n${hindi.extension_200 || ""}`);
  const englishCurrent = countArticleWords(`${english.lead_100 || ""}\n\n${english.extension_200 || ""}`);
  return {
    hindiCurrent,
    englishCurrent,
    hindiTarget: Math.max(500, 1200 - hindiCurrent),
    englishTarget: Math.max(500, 1200 - englishCurrent),
    hindiMin: Math.max(500, AI_LONG_REWRITE_MIN_WORDS - hindiCurrent),
    hindiMax: Math.max(Math.max(500, AI_LONG_REWRITE_MIN_WORDS - hindiCurrent) + 100, AI_LONG_REWRITE_MAX_WORDS - hindiCurrent),
    englishMin: Math.max(500, AI_LONG_REWRITE_MIN_WORDS - englishCurrent),
    englishMax: Math.max(Math.max(500, AI_LONG_REWRITE_MIN_WORDS - englishCurrent) + 100, AI_LONG_REWRITE_MAX_WORDS - englishCurrent),
  };
}

function buildStage2ContinuationPrompt(articleRecord, articleText, stage1Payload) {
  const counts = getStage1CurrentCounts(stage1Payload);
  return `STAGE 2 LONG-FORM CONTINUATION

Original URL: ${articleRecord.source_url}
Original title: ${articleRecord.title || ""}

Current counts:
- Hindi lead_100 + extension_200 words: ${counts.hindiCurrent}
- English lead_100 + extension_200 words: ${counts.englishCurrent}
- Hindi continuation target: about ${counts.hindiTarget} words, acceptable ${counts.hindiMin}-${counts.hindiMax} words.
- English continuation target: about ${counts.englishTarget} words, acceptable ${counts.englishMin}-${counts.englishMax} words.

Stable Stage 1 context:
${JSON.stringify({
  classification: stage1Payload.classification,
  hindi: {
    heading: stage1Payload.hindi?.heading,
    subheadings: stage1Payload.hindi?.subheadings,
    photo_caption: stage1Payload.hindi?.photo_caption,
    lead_100: stage1Payload.hindi?.lead_100,
    extension_200: stage1Payload.hindi?.extension_200,
  },
  english: {
    heading: stage1Payload.english?.heading,
    subheadings: stage1Payload.english?.subheadings,
    photo_caption: stage1Payload.english?.photo_caption,
    lead_100: stage1Payload.english?.lead_100,
    extension_200: stage1Payload.english?.extension_200,
  },
}, null, 2)}

Return only:
{"hindi_extension_700":"","english_extension_700":""}

Continuation rules:
- hindi_extension_700 must be Hindi only and at least ${counts.hindiMin} words, ideally ${counts.hindiMin}-${counts.hindiMax}. Do not write less than ${counts.hindiMin}.
- english_extension_700 must be English only and at least ${counts.englishMin} words, ideally ${counts.englishMin}-${counts.englishMax}. Do not write less than ${counts.englishMin}.
- Continue the existing report without repeating the Stage 1 body.
- Do not include heading, secondary heading, subheadings, caption, agency label or source label.
- Use complete sentences. The cumulative total (Stage 1 body + this continuation) must be at least 1100 words; more is fine.

RAW ARTICLE TEXT
${truncateText(articleText.combinedText, 14000)}`;
}

function mergeStage2Continuation(stage1Payload, stage2Payload) {
  const hindiContinuation = coerceRepairValue(
    stage2Payload?.hindi_extension_700 ||
      stage2Payload?.hindi?.extension_700 ||
      stage2Payload?.hindi?.continuation ||
      stage2Payload?.hindi?.text ||
      stage2Payload?.hindi
  );
  const englishContinuation = coerceRepairValue(
    stage2Payload?.english_extension_700 ||
      stage2Payload?.english?.extension_700 ||
      stage2Payload?.english?.continuation ||
      stage2Payload?.english?.text ||
      stage2Payload?.english
  );
  return {
    classification: stage1Payload.classification,
    hindi: {
      ...stage1Payload.hindi,
      extension_700: cleanGeneratedText(hindiContinuation),
    },
    english: {
      ...stage1Payload.english,
      extension_700: cleanGeneratedText(englishContinuation),
    },
  };
}

function validateStage1CorePayload(stage1Payload, articleRecord, articleText, options = {}) {
  const compactCandidate = mergeStage2Continuation(stage1Payload, {
    hindi_extension_700: repeatValidationSentence("हिंदी", 80, "।"),
    english_extension_700: repeatValidationSentence("english", 80, "."),
  });
  const invalidFields = [];
  const normalized = compactCandidate && typeof compactCandidate === "object" ? compactCandidate : {};
  const hindi = normalizeCompactLanguagePackage(normalized.hindi, "hindi");
  const english = normalizeCompactLanguagePackage(normalized.english, "english");
  const hindiProgressive = normalizeProgressiveBodies({
    ...hindi,
    extension_700: "",
  }, "hindi");
  const englishProgressive = normalizeProgressiveBodies({
    ...english,
    extension_700: "",
  }, "english");

  try {
    validateAiGeneratedCategory(normalized.classification?.category, {
      ...options,
      articleId: articleRecord?.id,
      articleTitle: articleRecord?.title,
      articleText: articleText?.combinedText,
      sourceTitle: articleText?.title,
      sourceExcerpt: articleRecord?.source_excerpt,
      sourceUrl: articleRecord?.source_url,
    });
  } catch {
    invalidFields.push("classification.category");
  }

  for (const language of ["hindi", "english"]) {
    const pack = language === "hindi" ? hindi : english;
    const textCheck = language === "hindi" ? hasHindiText : hasEnglishText;
    for (const field of ["heading", "lead_100", "extension_200"]) {
      if (!pack[field] || !textCheck(pack[field])) {
        invalidFields.push(`${language}.${field}`);
      }
    }
    if (pack.subheadings.length !== 2) {
      invalidFields.push(`${language}.subheadings`);
    }
    pack.subheadings.forEach((subheading, index) => {
      if (!subheading || !textCheck(subheading) || hasBadSubheadingLabel(subheading)) {
        invalidFields.push(`${language}.subheadings.${index}`);
      }
    });
  }

  for (const field of hindiProgressive.invalidFields) {
    if (field !== "hindi.long_cumulative" && field !== "hindi.body300_cumulative") {
      invalidFields.push(field);
    }
  }
  for (const field of englishProgressive.invalidFields) {
    if (field !== "english.long_cumulative" && field !== "english.body300_cumulative") {
      invalidFields.push(field);
    }
  }

  if (invalidFields.length) {
    throw createAiValidationError(
      `Gemini Stage 1 core response failed validation: ${Array.from(new Set(invalidFields)).join(", ")}.`,
      invalidFields
    );
  }

  return {
    classification: normalized.classification,
    hindi,
    english,
  };
}

function repeatValidationSentence(language, count, punctuation) {
  const word = language === "hindi" ? "समाचार" : "validation";
  return Array.from({ length: count }, () => `${word} ${word} ${word} ${word} ${word}${punctuation}`).join(" ");
}

function analyzeVerifiedSourceMaterial(articleText) {
  const rawText = String(articleText?.combinedText || "");
  const cleanedText = normalizeWhitespace(
    rawText
      .replace(/<[^>]*>/g, " ")
      .replace(/\b(?:home|menu|subscribe|advertisement|privacy policy|terms of use|follow us|share|login|sign in)\b/gi, " ")
  );
  const words = cleanedText.split(/\s+/).filter(Boolean);
  const distinctWords = new Set(words.map((word) => word.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/gi, "")).filter(Boolean));
  const factualTokens = (cleanedText.match(/\b\d+(?:[.,]\d+)*%?\b|[\u0900-\u097F]{4,}|[A-Z][a-z]{3,}/g) || []).length;
  const sentenceCount = splitCompleteSentences(cleanedText).filter((sentence) => countBodyWords(sentence) >= 6).length;
  const hasEnoughWords = words.length >= AI_MIN_SOURCE_WORDS_FOR_LONG_REWRITE;
  const hasMeaningfulVariety = distinctWords.size >= Math.min(35, Math.max(18, Math.floor(words.length * 0.35)));
  const hasFactualMaterial = factualTokens >= AI_MIN_SOURCE_FACT_TOKENS && sentenceCount >= 2;

  return {
    chars: cleanedText.length,
    words: words.length,
    distinct_words: distinctWords.size,
    factual_tokens: factualTokens,
    sentence_count: sentenceCount,
    sufficient: hasEnoughWords && hasMeaningfulVariety && hasFactualMaterial,
  };
}

function assertSufficientSourceMaterial(articleRecord, articleText) {
  const analysis = analyzeVerifiedSourceMaterial(articleText);
  console.log(
    `[ai-rewrite-input] news_id=${articleRecord?.id || "unknown"}` +
      ` extracted_chars=${analysis.chars}` +
      ` extracted_words=${analysis.words}`
  );

  if (!analysis.sufficient) {
    const error = new Error("Insufficient verified source material for a safe bilingual long-form rewrite.");
    error.sourceAnalysis = analysis;
    throw error;
  }

  return analysis;
}

function mergeCompactRepairs(compactPayload, repairPayload) {
  const merged = JSON.parse(JSON.stringify(compactPayload || {}));
  if (repairPayload?.repairs && typeof repairPayload.repairs === "object") {
    for (const [path, value] of Object.entries(repairPayload.repairs)) {
      setPathValue(merged, path, coerceRepairValue(value));
    }
  }
  const replaceLanguage = repairPayload?.replace_language && typeof repairPayload.replace_language === "object"
    ? repairPayload.replace_language
    : {};
  const replace = repairPayload?.replace && typeof repairPayload.replace === "object"
    ? repairPayload.replace
    : {};
  const append = repairPayload?.append && typeof repairPayload.append === "object"
    ? repairPayload.append
    : {};

  for (const [language, value] of Object.entries(replaceLanguage)) {
    if ((language === "hindi" || language === "english") && value && typeof value === "object") {
      merged[language] = value;
    }
  }

  for (const [path, value] of Object.entries(replace)) {
    setPathValue(merged, path, coerceRepairValue(value));
  }

  for (const [path, value] of Object.entries(append)) {
    if (!/\.(extension_700)$/.test(path)) {
      continue;
    }
    const existingValue = cleanGeneratedText(getPathValue(merged, path));
    const repairValue = cleanGeneratedText(coerceRepairValue(value));
    setPathValue(merged, path, joinBodySegments([existingValue, repairValue]));
  }

  return merged;
}

function getCompactContinuationRange(compactPayload, language) {
  const pack = compactPayload?.[language] || {};
  const currentWords = countArticleWords(joinBodySegments([pack.lead_100, pack.extension_200, pack.extension_700]));
  const minimumNeeded = Math.max(0, AI_LONG_REWRITE_MIN_WORDS - currentWords);
  const targetNeeded = Math.max(0, 1200 - currentWords);
  const requestedMinimum = minimumNeeded + 20;
  const requestedMaximum = Math.max(requestedMinimum + 80, Math.min(targetNeeded + 120, 650));
  return {
    currentWords,
    minimumNeeded,
    targetNeeded,
    requestedMinimum,
    requestedMaximum,
  };
}

function compactLanguageLooksStructurallyUnusable(compactPayload, invalidFields, language) {
  if (invalidFields.includes(language)) {
    return true;
  }
  const languageFields = invalidFields.filter((field) => field === language || field.startsWith(`${language}.`));
  const bodyFieldFailures = ["lead_100", "extension_200", "extension_700"]
    .filter((field) => languageFields.includes(`${language}.${field}`));
  const structuralFailures = languageFields.filter((field) => (
    field === `${language}.heading` ||
    field === `${language}.photo_caption` ||
    field.startsWith(`${language}.subheadings`)
  ));
  const pack = compactPayload?.[language];
  return !pack ||
    typeof pack !== "object" ||
    bodyFieldFailures.length >= 3 ||
    (bodyFieldFailures.length >= 2 && structuralFailures.length >= 2);
}

function planCompactRepairs(compactPayload, invalidFields = [], validationDetails = {}) {
  const uniqueFields = Array.from(new Set(invalidFields.filter(Boolean)));
  const plan = {
    replace_language: {},
    replace: {},
    append: {},
    notes: [],
  };

  for (const language of ["hindi", "english"]) {
    if (compactLanguageLooksStructurallyUnusable(compactPayload, uniqueFields, language)) {
      plan.replace_language[language] = {
        required: `Replace the full ${language} package with heading, secondary_heading, exactly two subheadings, photo_caption, lead_100, extension_200 and extension_700.`,
      };
    }
  }

  for (const fieldPath of uniqueFields) {
    const [language, field] = fieldPath.split(".");
    if (plan.replace_language[language]) {
      continue;
    }

    if ((language === "hindi" || language === "english") && field === "long_cumulative") {
      const range = getCompactContinuationRange(compactPayload, language);
      if (range.currentWords < 500) {
        plan.replace_language[language] = {
          required: `Replace the full ${language} package because its progressive body is only ${range.currentWords} words and cannot be rescued by one continuation. Return heading, secondary_heading, exactly two subheadings, photo_caption, lead_100, extension_200 and extension_700 with a cumulative minimum of ${AI_LONG_REWRITE_MIN_WORDS} body words (more is fine).`,
          currentWords: range.currentWords,
          detail: validationDetails[fieldPath] || null,
        };
        delete plan.replace[`${language}.lead_100`];
        delete plan.replace[`${language}.extension_200`];
        delete plan.replace[`${language}.extension_700`];
        continue;
      }
      plan.append[`${language}.extension_700`] = {
        required: `Append a supported ${language} continuation to extension_700.`,
        ...range,
        detail: validationDetails[fieldPath] || null,
      };
      continue;
    }

    if ((language === "hindi" || language === "english") && field === "body100_cumulative") {
      plan.replace[`${language}.lead_100`] = {
        required: `Replace ${language}.lead_100 with complete supported sentences that let the cumulative stream produce 260-340 words for the 300-word version.`,
        detail: validationDetails[fieldPath] || null,
      };
      continue;
    }

    if ((language === "hindi" || language === "english") && field === "body300_cumulative") {
      plan.replace[`${language}.extension_200`] = {
        required: `Replace ${language}.extension_200 with supported additional material so the cumulative 600-word version reaches 540-660 words.`,
        detail: validationDetails[fieldPath] || null,
      };
      continue;
    }

    if (/^(hindi|english)\.(heading|photo_caption|lead_100|extension_200|extension_700|subheadings)(?:\.\d+)?$/.test(fieldPath)) {
      const targetPath = field === "subheadings" ? `${language}.subheadings` : fieldPath.replace(/\.\d+$/, "");
      plan.replace[targetPath] = getCompactFieldRepairInstruction(compactPayload, targetPath);
    }
  }

  if (uniqueFields.includes("english.number_consistency")) {
    plan.replace["english.extension_700"] = {
      required: "Replace english.extension_700 so names, numbers, dates and places match the Hindi/source facts without adding unsupported facts.",
    };
  }

  return plan;
}

function getCompactRepairMaxTokens(repairPlan = {}) {
  const replaceLanguageCount = Object.keys(repairPlan.replace_language || {}).length;
  const appendCount = Object.keys(repairPlan.append || {}).length;
  const replaceCount = Object.keys(repairPlan.replace || {}).length;
  if (replaceLanguageCount > 0) {
    return 10000;
  }
  if (appendCount >= 2) {
    return 10000;
  }
  if (appendCount === 1) {
    return 6000;
  }
  if (replaceCount > 0) {
    return 2500;
  }
  return 2500;
}

function getCompactRawBodyCounts(compactPayload = {}) {
  const hindi = compactPayload.hindi || {};
  const english = compactPayload.english || {};
  const hindiLead = countBodyWords(hindi.lead_100);
  const hindiExtension200 = countBodyWords(hindi.extension_200);
  const hindiExtension700 = countBodyWords(hindi.extension_700);
  const englishLead = countBodyWords(english.lead_100);
  const englishExtension200 = countBodyWords(english.extension_200);
  const englishExtension700 = countBodyWords(english.extension_700);
  return {
    hindi_lead: hindiLead,
    hindi_extension_200: hindiExtension200,
    hindi_extension_700: hindiExtension700,
    hindi_cumulative: hindiLead + hindiExtension200 + hindiExtension700,
    english_lead: englishLead,
    english_extension_200: englishExtension200,
    english_extension_700: englishExtension700,
    english_cumulative: englishLead + englishExtension200 + englishExtension700,
  };
}

function logCompactGeneratedCounts(articleId, compactPayload, finishReason) {
  const counts = getCompactRawBodyCounts(compactPayload);
  console.log(
    `[ai-rewrite-generated-counts] news_id=${articleId || "unknown"}` +
      ` hindi_lead=${counts.hindi_lead}` +
      ` hindi_extension_200=${counts.hindi_extension_200}` +
      ` hindi_extension_700=${counts.hindi_extension_700}` +
      ` hindi_cumulative=${counts.hindi_cumulative}` +
      ` english_lead=${counts.english_lead}` +
      ` english_extension_200=${counts.english_extension_200}` +
      ` english_extension_700=${counts.english_extension_700}` +
      ` english_cumulative=${counts.english_cumulative}` +
      ` finish_reason=${finishReason || "unknown"}`
  );
}

function logCompactFinalCounts(articleId, payload) {
  const counts = payload?._compact_counts || {};
  console.log(
    `[ai-rewrite-final-counts] news_id=${articleId || "unknown"}` +
      ` hindi_100=${counts.hindi?.normalized?.body100 ?? ""}` +
      ` hindi_300=${counts.hindi?.normalized?.body300 ?? ""}` +
      ` hindi_1000=${counts.hindi?.normalized?.body1000 ?? ""}` +
      ` english_100=${counts.english?.normalized?.body100 ?? ""}` +
      ` english_300=${counts.english?.normalized?.body300 ?? ""}` +
      ` english_1000=${counts.english?.normalized?.body1000 ?? ""}`
  );
}

function getCompactFieldRepairInstruction(compactPayload, fieldPath) {
  const value = getPathValue(compactPayload, fieldPath);
  const count = typeof value === "string" ? countBodyWords(value) : Array.isArray(value) ? value.length : 0;
  const ranges = {
    "hindi.lead_100": `at least ${AI_LEAD_BODY_MIN_WORDS} Hindi body words opening with a place-name dateline, ideally ${AI_LEAD_BODY_ACCEPT_MIN_WORDS}-${AI_LEAD_BODY_ACCEPT_MAX_WORDS}, never less than ${AI_LEAD_BODY_MIN_WORDS}`,
    "english.lead_100": `at least ${AI_LEAD_BODY_MIN_WORDS} English body words opening with a place-name dateline, ideally ${AI_LEAD_BODY_ACCEPT_MIN_WORDS}-${AI_LEAD_BODY_ACCEPT_MAX_WORDS}, never less than ${AI_LEAD_BODY_MIN_WORDS}`,
    "hindi.extension_200": `at least ${AI_EXTENSION_200_MIN_WORDS} additional Hindi body words, ideally ${AI_EXTENSION_200_ACCEPT_MIN_WORDS}-${AI_EXTENSION_200_ACCEPT_MAX_WORDS}, never less than ${AI_EXTENSION_200_MIN_WORDS}`,
    "english.extension_200": `at least ${AI_EXTENSION_200_MIN_WORDS} additional English body words, ideally ${AI_EXTENSION_200_ACCEPT_MIN_WORDS}-${AI_EXTENSION_200_ACCEPT_MAX_WORDS}, never less than ${AI_EXTENSION_200_MIN_WORDS}`,
    "hindi.extension_700": `at least ${AI_EXTENSION_700_MIN_WORDS} additional Hindi body words, ideally ${AI_EXTENSION_700_ACCEPT_MIN_WORDS}-${AI_EXTENSION_700_ACCEPT_MAX_WORDS}`,
    "english.extension_700": `at least ${AI_EXTENSION_700_MIN_WORDS} additional English body words, ideally ${AI_EXTENSION_700_ACCEPT_MIN_WORDS}-${AI_EXTENSION_700_ACCEPT_MAX_WORDS}`,
    "hindi.subheadings": "exactly two Hindi factual subheadings, extracted separately from the body",
    "english.subheadings": "exactly two English factual subheadings, extracted separately from the body",
  };
  return {
    field: fieldPath,
    current_count: count,
    required: ranges[fieldPath] || "valid replacement for this field",
    current_value_preview: truncateText(typeof value === "string" ? value : JSON.stringify(value || ""), 900),
  };
}

async function repairCompactBilingualPayload({
  compactPayload,
  invalidFields,
  validationDetails,
  articleRecord,
  articleText,
}) {
  const repairPlan = planCompactRepairs(compactPayload, invalidFields, validationDetails);
  const repairPrompt = `Repair only these invalid fields:
${Array.from(new Set(invalidFields || [])).join(", ")}

Return only:
{"replace_language": {}, "replace": {}, "append": {}}

Repair plan:
${JSON.stringify(repairPlan, null, 2)}

Use replace_language only when requested in the repair plan. Its values must be full language package objects.
For replace_language, the returned language package must include lead_100, extension_200 and extension_700 with a cumulative ${AI_LONG_REWRITE_MIN_WORDS}-${AI_LONG_REWRITE_MAX_WORDS} body words.
Use replace for missing, empty, wrong-language or malformed fields. Replacement body fields replace the old field; they are not appended.
Use append only for long_cumulative repair, and only at hindi.extension_700 or english.extension_700.
For append operations, return continuation sentences within requestedMinimum/requestedMaximum words from the repair plan.
After append, the cumulative body1000 must be ${AI_LONG_REWRITE_MIN_WORDS} to ${AI_LONG_REWRITE_MAX_WORDS} body words.
For body100_cumulative, replace lead_100 only so the compatibility field short_100 becomes the 300-word version.
For body300_cumulative, replace extension_200 only so the compatibility field medium_300 becomes the 600-word version.
For long_cumulative, append continuation to extension_700 only.
If repairing subheadings, return the full array at hindi.subheadings or english.subheadings with exactly two factual mini-headlines.
For body repairs, use complete sentences and avoid repeating the headline, secondary heading, subheadings or caption.
Do not regenerate fields not listed above.
Do not include image_url, image_prompt, link or source.

Article context:
${buildCompactVariableArticlePrompt(articleRecord, articleText)}

Current compact JSON:
${truncateText(JSON.stringify(compactPayload), 9000)}`;

  const repairResponse = await requestGeminiJson([
    {
      role: "system",
      content: BILINGUAL_REPAIR_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: repairPrompt,
    },
  ], {
    articleId: articleRecord.id,
    mode: AI_REWRITE_MODES.BILINGUAL_COMPACT,
    call: "targeted-repair",
    temperature: 0.2,
    maxTokens: getCompactRepairMaxTokens(repairPlan),
    retries: 2,
  });

  const repairedPayload = mergeCompactRepairs(compactPayload, parseJsonResponse(repairResponse.content));
  repairedPayload._compact_repair_plan = repairPlan;
  return repairedPayload;
}

async function generateCompactBilingualRewrite(articleRecord, articleText) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured. Set it in .env before using AI rewrite routes.");
  }

  const sourceAnalysis = assertSufficientSourceMaterial(articleRecord, articleText);
  const stage1Prompt = buildStage1CorePrompt(articleRecord, articleText);
  const stage1Response = await requestGeminiJson([
    {
      role: "system",
      content: BILINGUAL_STAGE1_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: stage1Prompt,
    },
  ], {
    articleId: articleRecord.id,
    mode: AI_REWRITE_MODES.BILINGUAL_COMPACT,
    call: "stage1-core",
    temperature: 0.2,
    maxTokens: 9000,
    retries: 2,
  });

  let stage1Payload = null;
  try {
    stage1Payload = validateStage1CorePayload(
      parseJsonResponse(stage1Response.content),
      articleRecord,
      articleText,
      { sourceAnalysis }
    );
  } catch (error) {
    const correctionPrompt = `${stage1Prompt}

The previous Stage 1 response was invalid. Return exactly one valid Stage 1 JSON object using the required schema. Do not include explanations.

Previous invalid response preview:
${truncateText(stage1Response.content, 3000)}`;
    const correctedResponse = await requestGeminiJson([
      {
        role: "system",
        content: BILINGUAL_STAGE1_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: correctionPrompt,
      },
    ], {
      articleId: articleRecord.id,
      mode: AI_REWRITE_MODES.BILINGUAL_COMPACT,
      call: "json-correction",
      temperature: 0.2,
      maxTokens: 20000,
      retries: 2,
    });
    stage1Payload = validateStage1CorePayload(
      parseJsonResponse(correctedResponse.content),
      articleRecord,
      articleText,
      { sourceAnalysis }
    );
  }

  const stage2Prompt = buildStage2ContinuationPrompt(articleRecord, articleText, stage1Payload);
  const stage2Response = await requestGeminiJson([
    {
      role: "system",
      content: BILINGUAL_STAGE2_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: stage2Prompt,
    },
  ], {
    articleId: articleRecord.id,
    mode: AI_REWRITE_MODES.BILINGUAL_COMPACT,
    call: "stage2-continuation",
    temperature: 0.2,
    maxTokens: 14000,
    retries: 2,
  });

  let compactPayload = mergeStage2Continuation(stage1Payload, parseJsonResponse(stage2Response.content));
  logCompactGeneratedCounts(articleRecord.id, compactPayload, stage2Response.finish_reason);

  try {
    const payload = validateAiPayload(compactPayload, {
      articleRecord,
      articleTextObject: articleText,
      articleId: articleRecord.id,
      articleTitle: articleRecord.title,
      articleText: articleText.combinedText,
      sourceTitle: articleText.title,
      sourceExcerpt: articleRecord.source_excerpt,
      sourceUrl: articleRecord.source_url,
      rawResponse: JSON.stringify(compactPayload),
      requireClassificationMetadata: true,
      sourceAnalysis,
    });
    logCompactFinalCounts(articleRecord.id, payload);
    return {
      model_name: GEMINI_MODEL,
      raw_response: JSON.stringify(payload),
      payload,
    };
  } catch (error) {
    const invalidFields = Array.isArray(error.invalidFields) ? error.invalidFields : [];
    const validationDetails = error.validationDetails && typeof error.validationDetails === "object"
      ? error.validationDetails
      : {};
    if (!invalidFields.length) {
      throw error;
    }

    const repairedCompactPayload = await repairCompactBilingualPayload({
      compactPayload,
      invalidFields,
      validationDetails,
      articleRecord,
      articleText,
    });
    const payload = validateAiPayload(repairedCompactPayload, {
      articleRecord,
      articleTextObject: articleText,
      articleId: articleRecord.id,
      articleTitle: articleRecord.title,
      articleText: articleText.combinedText,
      sourceTitle: articleText.title,
      sourceExcerpt: articleRecord.source_excerpt,
      sourceUrl: articleRecord.source_url,
      rawResponse: JSON.stringify(repairedCompactPayload),
      requireClassificationMetadata: true,
      sourceAnalysis,
    });
    logCompactFinalCounts(articleRecord.id, payload);
    return {
      model_name: GEMINI_MODEL,
      raw_response: JSON.stringify(payload),
      payload,
    };
  }
}

async function generateLegacyHindiRewrite(articleRecord, articleText) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured. Set it in .env before using AI rewrite routes.");
  }

  const prompt = `${AI_REWRITE_SYSTEM_PROMPT}
${AI_REWRITE_SIZE_OVERRIDE}
${AI_CATEGORY_OVERRIDE}

RAW ARTICLE DETAILS
Publisher category to ignore: ${articleRecord.category || "uncategorized"}
Feed source: ${articleRecord.feed_source || "unknown"}
Original title: ${articleRecord.title || ""}
Original URL: ${articleRecord.source_url}
Source name: ${articleRecord.feed_source || "RSS"}

RAW ARTICLE TEXT
${truncateText(articleText.combinedText, 14000)}`;

  let rawText = "";
  let parsed = null;
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const correctionReason = lastError?.message ? ` Previous rejection reason: ${lastError.message}` : "";
    const attemptPrompt = attempt === 0
      ? prompt
      : `${prompt}

STRICT CORRECTION INSTRUCTION:${correctionReason}
- Return only one valid JSON object.
- All article fields must be Hindi and must keep the required structure.
- short_100 must be 235 to 265 words. This is the 250-word version; keep the field name short_100 for compatibility.
- medium_300 must be 475 to 525 words. This is the 500-word version; keep the field name medium_300 for compatibility.
- long_500 must be ${AI_LONG_REWRITE_MIN_WORDS} to ${AI_LONG_REWRITE_MAX_WORDS} words. Do not stop near 300 or 600 words.
- If the raw input is thin, safely expand only with cautious background, public impact, implementation process, official attribution, and review/feedback context. Do not invent names, numbers, quotes, FIRs, deaths, arrests, dates, or unsupported facts.
- Keep field name long_500 for compatibility, but its content must be the 1000-word version.`;
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGeminiRequestBody([
        {
          role: "user",
          content: attemptPrompt,
        },
      ], {
        temperature: attempt === 0 ? 0.45 : 0.2,
        maxTokens: 8000,
      })),
    });

    const payload = await response.json();
    logGeminiUsage(payload, {
      articleId: articleRecord?.id,
      mode: AI_REWRITE_MODES.HINDI_LEGACY,
      call: "main",
    });
    const responseInfo = getGeminiResponseInfo(payload, {
      maxTokens: 8000,
      call: "legacy",
    });
    logGeminiResponseInfo(responseInfo, {
      articleId: articleRecord?.id,
      mode: AI_REWRITE_MODES.HINDI_LEGACY,
    });

    if (!response.ok) {
      lastError = new Error(payload?.error?.message || `Gemini request failed with status ${response.status}.`);
      if (response.status === 429 || response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
      throw lastError;
    }
    const terminationError = createGeminiTerminationError(responseInfo);
    if (terminationError) {
      lastError = terminationError;
      if (terminationError.transient) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
      throw terminationError;
    }

    rawText = responseInfo.content;

    try {
      const candidatePayload = await expandLongRewriteIfNeeded(
        parseJsonResponse(rawText),
        articleRecord,
        articleText,
        lastError?.message || ""
      );
      rawText = JSON.stringify(candidatePayload);
      parsed = validateAiPayload(candidatePayload, {
        articleId: articleRecord.id,
        articleTitle: articleRecord.title,
        articleText: articleText.combinedText,
        sourceTitle: articleText.title,
        sourceExcerpt: articleRecord.source_excerpt,
        sourceUrl: articleRecord.source_url,
        rawResponse: rawText,
        requireClassificationMetadata: true,
      });
      break;
    } catch (error) {
      lastError = error;
      if (
        attempt < 2 &&
        /not Hindi|missing|JSON|confidence|reason|category|word count|outside/i.test(error.message)
      ) {
        continue;
      }
      break;
    }
  }

  if (!parsed) {
    const fallbackReason = lastError?.message || "Gemini did not return a valid Hindi rewrite.";
    if (/long_500 word count|outside \d+-\d+/i.test(fallbackReason)) {
      throw lastError;
    }

    console.warn(`[ai-rewrite] Using fallback payload for news_id=${articleRecord.id}: ${fallbackReason}`);
    parsed = buildFallbackAiPayload(articleRecord, articleText, fallbackReason);
  }

  return {
    model_name: GEMINI_MODEL,
    raw_response: rawText,
    payload: parsed,
  };
}

// Maps validation failures to concrete repair operations. The *_cumulative fields are
// synthetic validation markers produced by normalizeSingleBodyTiers, not real payload
// paths, so they must be translated into an append against hindi.body with an explicit
// word target — otherwise the model is asked to repair a field that does not exist and
// correctly returns nothing.
function planHindiOnlyRepairs(payload, invalidFields = []) {
  const uniqueFields = Array.from(new Set((invalidFields || []).filter(Boolean)));
  const plan = { replace: {}, append: {} };
  const bodyWords = countBodyWords(getPathValue(payload, "hindi.body"));
  const replaceSpecs = {
    "hindi.heading": "one natural newspaper Hindi headline, 10 to 20 words",
    "hindi.secondary_heading": `STRICT ${AI_SECONDARY_HEADLINE_MIN_WORDS} to ${AI_SECONDARY_HEADLINE_MAX_WORDS} words IN TOTAL: ${AI_SECONDARY_KEYWORDS_MIN} to ${AI_SECONDARY_KEYWORDS_MAX} factual keywords, then a colon, then a short headline distinct from the main heading. The keywords count toward the total, so with 3 keywords the part after the colon is about 7 to 11 words. Do not write a long explanatory sentence. Example: "मध्य प्रदेश, पुलिस : भोपाल में तस्करी गिरोह के तीन सदस्य हिरासत में लिए गए"`,
    "hindi.photo_caption": "one factual Hindi caption, 20 to 30 words",
    "hindi.subheadings": `exactly three Hindi subheadings as an array of three strings, extracted separately from the body: subheadings[0] and subheadings[1] are supported factual mini-headlines (roughly 8 to 18 words each), and subheadings[2] is a STRICT ${AI_STANDALONE_SUBHEADING_MIN_WORDS} to ${AI_STANDALONE_SUBHEADING_MAX_WORDS} words, a complete standalone mini-headline meaningful on its own`,
  };

  let needsBodyExtension = false;
  for (const field of uniqueFields) {
    if (/_cumulative$/.test(field)) {
      needsBodyExtension = true;
      continue;
    }

    const basePath = field.replace(/\.\d+$/, "");
    if (basePath === "hindi.body") {
      needsBodyExtension = true;
      continue;
    }

    if (replaceSpecs[basePath]) {
      plan.replace[basePath] = {
        required: replaceSpecs[basePath],
        current_value_preview: truncateText(
          JSON.stringify(getPathValue(payload, basePath) || ""),
          400
        ),
      };

      if (basePath === "hindi.secondary_heading") {
        const check = inspectSecondaryHeadline(getPathValue(payload, basePath));
        plan.replace[basePath].current_total_words = check.totalWords;
        plan.replace[basePath].current_keyword_words = check.keywordWords;
        plan.replace[basePath].problem = check.reason;
        plan.replace[basePath].required_total_words = `${AI_SECONDARY_HEADLINE_MIN_WORDS}-${AI_SECONDARY_HEADLINE_MAX_WORDS}`;
      }
    }
  }

  if (needsBodyExtension) {
    const shortfall = Math.max(0, AI_LONG_REWRITE_MIN_WORDS - bodyWords);
    const requestedMinimum = shortfall + 40;
    plan.append["hindi.body"] = {
      required: "Continuation text to append to the end of the existing hindi.body.",
      current_body_words: bodyWords,
      required_total_words: AI_LONG_REWRITE_MIN_WORDS,
      words_short_by: shortfall,
      requestedMinimum,
      requestedMaximum: requestedMinimum + 250,
      body_tail_preview: truncateText(String(getPathValue(payload, "hindi.body") || "").slice(-600), 600),
    };
  }

  return plan;
}

async function repairHindiOnlyPayload({ payload, invalidFields, articleRecord, articleText, attempt = 0 }) {
  const repairPlan = planHindiOnlyRepairs(payload, invalidFields);
  const appendPlan = repairPlan.append["hindi.body"];
  const replaceKeys = Object.keys(repairPlan.replace);
  const repairPrompt = `Repair plan:
${JSON.stringify(repairPlan, null, 2)}

Return only:
{"replace": {}, "append": {}}

${replaceKeys.length
    ? `For replace, return full replacement values for exactly these keys: ${replaceKeys.join(", ")}.`
    : "Return an empty replace object; no field replacements are needed."}

${appendPlan
    ? `For append, return key "hindi.body" whose value is ONLY the new continuation text to add onto the END of the existing body.
The existing body is currently ${appendPlan.current_body_words} Hindi words and must reach at least ${appendPlan.required_total_words} words, so it is short by about ${appendPlan.words_short_by} words.
Write at least ${appendPlan.requestedMinimum} new Hindi words (ideally ${appendPlan.requestedMinimum} to ${appendPlan.requestedMaximum}).${attempt > 0 ? `
IMPORTANT: a previous continuation attempt returned too little text and the article is still short. Do not return a brief addition this time. Write the full ${appendPlan.requestedMinimum}+ words of substantive continuation.` : ""}
This is the tail of the existing body, so you can continue naturally from it and must NOT repeat any of it:
"""
${appendPlan.body_tail_preview}
"""
Continue the same report with further supported detail: verified background, process, implications, official positions already present in the source, and what happens next. Use only facts supported by the raw article text below. Do not invent names, numbers, dates, quotes or official responses. Do not write a new headline, subheadings or photo caption.`
    : "Return an empty append object; the body length is acceptable."}

Do not regenerate fields that are not in the repair plan.
Do not include image_url, image_prompt, link or source.

RAW ARTICLE TEXT
${truncateText(articleText.combinedText, 10000)}`;

  const response = await requestGeminiJson([
    {
      role: "system",
      content: HINDI_ONLY_REPAIR_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: repairPrompt,
    },
  ], {
    articleId: articleRecord.id,
    mode: AI_REWRITE_MODES.HINDI_ONLY,
    call: attempt > 0 ? `targeted-repair-${attempt + 1}` : "targeted-repair",
    temperature: 0.2,
    maxTokens: 8000,
    retries: 2,
  });

  const repairPayload = parseJsonResponse(response.content);
  const merged = JSON.parse(JSON.stringify(payload || {}));
  const replace = repairPayload?.replace && typeof repairPayload.replace === "object" ? repairPayload.replace : {};
  const append = repairPayload?.append && typeof repairPayload.append === "object" ? repairPayload.append : {};

  for (const [path, value] of Object.entries(replace)) {
    setPathValue(merged, path, coerceRepairValue(value));
  }

  for (const [path, value] of Object.entries(append)) {
    if (path !== "hindi.body") {
      continue;
    }
    const existingValue = cleanGeneratedText(getPathValue(merged, path));
    const repairValue = cleanGeneratedText(coerceRepairValue(value));
    setPathValue(merged, path, joinBodySegments([existingValue, repairValue]));
  }

  return merged;
}

async function generateHindiOnlyRewrite(articleRecord, articleText) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured. Set it in .env before using AI rewrite routes.");
  }

  const sourceAnalysis = assertSufficientSourceMaterial(articleRecord, articleText);
  const sourceWordCount = countArticleWords(articleText.combinedText);
  // A short source still has to produce a full-length article, so spell out the
  // expansion budget explicitly rather than letting the model stop early and
  // burn a repair round-trip.
  const expansionBrief = sourceWordCount < AI_LONG_REWRITE_MIN_WORDS
    ? `
SHORT SOURCE NOTICE
- The extracted source is only about ${sourceWordCount} words, but hindi.body must still be at least ${AI_LONG_REWRITE_MIN_WORDS} Hindi words. You must roughly ${Math.max(2, Math.ceil(AI_LONG_REWRITE_MIN_WORDS / Math.max(sourceWordCount, 1)))}x the length in this single response.
- Do not stop early and do not pad by repeating sentences. Follow the "Handling a short source" rules: lead with every verified fact from the source, then go deeper by explaining the subject, the process or system involved, the established background, the practical impact, and what the source implies comes next.
- Before writing, plan roughly 8 to 12 paragraphs so the article reaches the full length in one pass.
- Every concrete fact about this specific event must still come only from the source below.`
    : "";
  const prompt = `${buildRawArticleContextPrompt(articleRecord, articleText)}
OUTPUT LENGTH REMINDER
- hindi.body must be at least ${AI_LONG_REWRITE_MIN_WORDS} Hindi words in a single field. More is fine; less is not acceptable.
- Do not return only a short summary; a short source is not a reason to write a short article.
${expansionBrief}

RAW ARTICLE TEXT
${truncateText(articleText.combinedText, 14000)}`;

  const response = await requestGeminiJson([
    {
      role: "system",
      content: HINDI_ONLY_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: prompt,
    },
  ], {
    articleId: articleRecord.id,
    mode: AI_REWRITE_MODES.HINDI_ONLY,
    call: "single-shot",
    temperature: 0.3,
    maxTokens: 16000,
    retries: 2,
  });

  let rawPayload;
  try {
    rawPayload = parseJsonResponse(response.content);
  } catch (error) {
    const correctionPrompt = `${prompt}

The previous response was invalid JSON. Return exactly one valid JSON object using the required schema. Do not include explanations.

Previous invalid response preview:
${truncateText(response.content, 3000)}`;
    const corrected = await requestGeminiJson([
      {
        role: "system",
        content: HINDI_ONLY_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: correctionPrompt,
      },
    ], {
      articleId: articleRecord.id,
      mode: AI_REWRITE_MODES.HINDI_ONLY,
      call: "json-correction",
      temperature: 0.2,
      maxTokens: 16000,
      retries: 2,
    });
    rawPayload = parseJsonResponse(corrected.content);
  }

  const validateOptions = {
    articleRecord,
    articleTextObject: articleText,
    articleId: articleRecord.id,
    articleTitle: articleRecord.title,
    articleText: articleText.combinedText,
    sourceTitle: articleText.title,
    sourceExcerpt: articleRecord.source_excerpt,
    sourceUrl: articleRecord.source_url,
    requireClassificationMetadata: true,
    sourceAnalysis,
  };

  try {
    const payload = validateAiPayload(rawPayload, { ...validateOptions, rawResponse: JSON.stringify(rawPayload) });
    return {
      model_name: GEMINI_MODEL,
      raw_response: JSON.stringify(payload),
      payload,
    };
  } catch (initialError) {
    let lastError = initialError;
    let workingPayload = rawPayload;

    // A single repair pass often lands just short of the word floor when the first
    // response undershoots badly, so allow a second continuation before giving up.
    // Each pass appends to the body it already produced, so progress accumulates.
    for (let attempt = 0; attempt < AI_HINDI_ONLY_MAX_REPAIR_ATTEMPTS; attempt += 1) {
      const invalidFields = Array.isArray(lastError.invalidFields) ? lastError.invalidFields : [];
      if (!invalidFields.length) {
        throw lastError;
      }

      workingPayload = await repairHindiOnlyPayload({
        payload: workingPayload,
        invalidFields,
        articleRecord,
        articleText,
        attempt,
      });

      try {
        const payload = validateAiPayload(workingPayload, {
          ...validateOptions,
          rawResponse: JSON.stringify(workingPayload),
        });
        return {
          model_name: GEMINI_MODEL,
          raw_response: JSON.stringify(payload),
          payload,
        };
      } catch (repairError) {
        lastError = repairError;
      }
    }

    throw lastError;
  }
}

async function generateAiRewrite(articleRecord, articleText) {
  resetGeminiCallBudget(articleRecord?.id);
  try {
    if (AI_REWRITE_MODE === AI_REWRITE_MODES.HINDI_LEGACY) {
      return await generateLegacyHindiRewrite(articleRecord, articleText);
    }

    if (AI_REWRITE_MODE === AI_REWRITE_MODES.BILINGUAL_COMPACT) {
      return await generateCompactBilingualRewrite(articleRecord, articleText);
    }

    if (AI_REWRITE_MODE && AI_REWRITE_MODE !== AI_REWRITE_MODES.HINDI_ONLY) {
      console.warn(`[ai-rewrite] Unknown AI_REWRITE_MODE="${AI_REWRITE_MODE}". Using hindi-only.`);
    }

    return await generateHindiOnlyRewrite(articleRecord, articleText);
  } finally {
    resetGeminiCallBudget(articleRecord?.id);
  }
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

  const parseRawUiPayload = () => {
    try {
      const parsed = JSON.parse(record.raw_response || "{}");
      if (hasUiHindiShape(parsed)) {
        return parsed;
      }
      if (parsed?.ui_hindi && hasUiHindiShape(parsed.ui_hindi)) {
        return parsed.ui_hindi;
      }
      return null;
    } catch {
      return null;
    }
  };

  const parseUiHindi = () => {
    const rawUiPayload = parseRawUiPayload();
    if (record.ui_short_100 || record.ui_medium_300 || record.ui_long_500) {
      const uiHindi = normalizeUiHindiPayload({
        title: record.ui_title || record.hindi_headline || record.english_headline || record.source_title,
        short_100: record.ui_short_100,
        medium_300: record.ui_medium_300,
        long_500: record.ui_long_500,
        keywords: parseSummary(record.ui_keywords_json),
        category: record.ui_category,
        state: record.ui_state,
        place_name: record.ui_place_name,
        image_url: record.ui_image_url,
        image_prompt: record.ui_image_prompt,
        source: record.ui_source,
        link: record.ui_link || record.source_url,
        confidence: rawUiPayload?.confidence,
        reason: rawUiPayload?.reason,
      }, {
        articleId: record.news_id,
        articleTitle: record.news_title,
        sourceTitle: record.source_title,
        sourceExcerpt: record.source_excerpt,
        sourceUrl: record.source_url,
      });
      return uiHindi;
    }

    if (rawUiPayload) {
      return normalizeUiHindiPayload(rawUiPayload, {
        articleId: record.news_id,
        articleTitle: record.news_title,
        sourceTitle: record.source_title,
        sourceExcerpt: record.source_excerpt,
        sourceUrl: record.source_url,
      });
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
      place_name: fallbackState,
      image_url: "",
      image_prompt: "",
      source: cleanGeneratedText(record.source_title || "समाचार स्रोत"),
      link: record.source_url || "",
    };
  };

  const formatted = {
    id: record.id,
    news_id: record.news_id,
    model_name: record.model_name,
    prompt_version: record.prompt_version,
    source_url: record.source_url,
    source_title: record.source_title,
    source_excerpt: record.source_excerpt,
    english: {
      headline: cleanGeneratedText(record.english_headline),
      secondary_headline: cleanGeneratedText(record.english_secondary_headline),
      top_summary: cleanSummaryList(parseSummary(record.english_top_summary)),
      short_description: cleanGeneratedText(record.english_short_description),
      long_description: cleanGeneratedText(record.english_long_description),
      what_to_watch_next: cleanGeneratedText(record.english_what_to_watch_next),
    },
    hindi: {
      headline: cleanGeneratedText(record.hindi_headline),
      secondary_headline: cleanGeneratedText(record.hindi_secondary_headline),
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

  if (formatted.ui_hindi) {
    formatted.ui_hindi.subheadings = formatted.hindi.top_summary;
    formatted.ui_hindi.secondary_headline = formatted.hindi.secondary_headline || formatted.ui_hindi.secondary_headline || "";
    if (!AI_MEDIUM_REWRITE_ENABLED) {
      formatted.ui_hindi.medium_300 = "";
    }
  }

  if (!AI_MEDIUM_REWRITE_ENABLED) {
    formatted.hindi.what_to_watch_next = "";
    formatted.english.what_to_watch_next = "";
  }

  formatted.ui_english = {
    title: formatted.english.headline,
    secondary_headline: formatted.english.secondary_headline,
    short_100: formatted.english.short_description,
    medium_300: AI_MEDIUM_REWRITE_ENABLED ? formatted.english.what_to_watch_next : "",
    long_500: formatted.english.long_description,
    subheadings: formatted.english.top_summary,
    category: formatted.ui_hindi?.category,
    state: formatted.ui_hindi?.state,
    source: formatted.ui_hindi?.source,
    link: formatted.ui_hindi?.link,
    image_url: "",
    image_prompt: "",
  };

  return formatted;
}

function formatAiRewriteWithNewsRecord(record) {
  if (!record) {
    return null;
  }

  const rewrite = formatAiRewriteRecord(record);
  const safeNewsImageLink = isLikelyValidImageUrl(record.news_image_link)
    ? record.news_image_link
    : null;
  if (rewrite?.ui_hindi) {
    rewrite.ui_hindi.image_url = safeNewsImageLink || "";
    rewrite.ui_hindi.image_prompt = "";
  }
  if (rewrite?.ui_english) {
    rewrite.ui_english.image_url = safeNewsImageLink || "";
    rewrite.ui_english.image_prompt = "";
  }

  return {
    ...rewrite,
    news: {
      id: record.news_id,
      category: rewrite?.ui_hindi?.category || record.category,
      source_category: record.category,
      title: record.news_title,
      source_url: record.news_source_url,
      image_link: safeNewsImageLink,
      image_source: safeNewsImageLink ? record.news_image_source : null,
      fetched_at: record.news_fetched_at,
      feed_source: record.news_feed_source,
      feed_url: record.news_feed_url,
    },
  };
}

function extractPhotoCaptionFromText(value) {
  const text = cleanGeneratedText(value);
  const match = text.match(/(?:Photo Caption|फोटो कैप्शन)\s*:\s*([\s\S]+)$/i);
  return cleanGeneratedText(match?.[1] || "");
}

function buildHindiTranslationSource(rewrite) {
  const uiHindi = rewrite?.ui_hindi || {};
  return {
    title: uiHindi.title || rewrite?.hindi?.headline || "",
    secondary_headline: uiHindi.secondary_headline || rewrite?.hindi?.secondary_headline || "",
    subheadings: Array.isArray(uiHindi.subheadings) && uiHindi.subheadings.length
      ? uiHindi.subheadings
      : Array.isArray(rewrite?.hindi?.top_summary) ? rewrite.hindi.top_summary : [],
    place_name: uiHindi.place_name || "",
    state: uiHindi.state || "",
    district: uiHindi.district || uiHindi.district_name || "",
    image_caption:
      uiHindi.image_caption ||
      uiHindi.photo_caption ||
      uiHindi.caption ||
      extractPhotoCaptionFromText(uiHindi.short_100) ||
      extractPhotoCaptionFromText(uiHindi.medium_300) ||
      extractPhotoCaptionFromText(uiHindi.long_500),
    short_100: uiHindi.short_100 || rewrite?.hindi?.short_description || "",
    medium_300: AI_MEDIUM_REWRITE_ENABLED ? uiHindi.medium_300 || rewrite?.hindi?.what_to_watch_next || "" : "",
    long_500: uiHindi.long_500 || rewrite?.hindi?.long_description || "",
  };
}

function hasUsefulEnglishTranslation(translation) {
  return Boolean(
    translation &&
      hasEnglishText([
        translation.title,
        translation.short_100,
        translation.long_500,
      ].filter(Boolean).join(" "))
  );
}

function splitTextForTranslation(value, maxLength = 900) {
  const text = cleanGeneratedText(value);
  if (!text || text.length <= maxLength) {
    return text ? [text] : [];
  }

  const chunks = [];
  let current = "";
  const parts = text.split(/(\n{2,}|(?<=[।.!?])\s+)/);
  for (const part of parts) {
    if (!part) {
      continue;
    }

    if ((current + part).length <= maxLength) {
      current += part;
      continue;
    }

    if (current.trim()) {
      chunks.push(current.trim());
      current = "";
    }

    if (part.length <= maxLength) {
      current = part;
      continue;
    }

    for (let index = 0; index < part.length; index += maxLength) {
      chunks.push(part.slice(index, index + maxLength).trim());
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter(Boolean);
}

async function translateTextWithLibreTranslate(text) {
  const sourceText = cleanGeneratedText(text);
  if (!sourceText) {
    return "";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TRANSLATION_TIMEOUT_MS);

  try {
    const response = await fetch(`${LIBRETRANSLATE_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        q: sourceText,
        source: "hi",
        target: "en",
        format: "text",
        ...(LIBRETRANSLATE_API_KEY ? { api_key: LIBRETRANSLATE_API_KEY } : {}),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || payload?.message || `LibreTranslate returned HTTP ${response.status}.`);
    }

    return cleanGeneratedText(payload.translatedText || payload.translation || "");
  } finally {
    clearTimeout(timeout);
  }
}

async function translateTextWithGoogleTranslate(text) {
  const sourceText = cleanGeneratedText(text);
  if (!sourceText) {
    return "";
  }

  const chunks = splitTextForTranslation(sourceText);
  if (chunks.length > 1) {
    const translatedChunks = [];
    for (const chunk of chunks) {
      translatedChunks.push(await translateTextWithGoogleTranslate(chunk));
    }
    return cleanGeneratedText(translatedChunks.join("\n\n"));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TRANSLATION_TIMEOUT_MS);

  try {
    const requestUrl = new URL("https://translate.googleapis.com/translate_a/single");
    requestUrl.searchParams.set("client", "gtx");
    requestUrl.searchParams.set("sl", "hi");
    requestUrl.searchParams.set("tl", "en");
    requestUrl.searchParams.set("dt", "t");
    requestUrl.searchParams.set("q", sourceText);

    const response = await fetch(requestUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GE-News-Hub/1.0)",
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`Google Translate returned HTTP ${response.status}.`);
    }

    const translatedText = Array.isArray(payload?.[0])
      ? payload[0].map((segment) => Array.isArray(segment) ? segment[0] || "" : "").join("")
      : "";
    return cleanGeneratedText(translatedText);
  } finally {
    clearTimeout(timeout);
  }
}

async function translateTextToEnglish(text) {
  if (AI_TRANSLATION_PROVIDER === "libretranslate") {
    return translateTextWithLibreTranslate(text);
  }

  if (AI_TRANSLATION_PROVIDER === "google-translate" || AI_TRANSLATION_PROVIDER === "google") {
    return translateTextWithGoogleTranslate(text);
  }

  throw new Error(`Unsupported AI_TRANSLATION_PROVIDER "${AI_TRANSLATION_PROVIDER}".`);
}

async function translateHindiRewriteToEnglish(source) {
  return {
    title: await translateTextToEnglish(source.title),
    secondary_headline: await translateTextToEnglish(source.secondary_headline),
    subheadings: Array.isArray(source.subheadings)
      ? await mapWithConcurrency(source.subheadings, 2, (subheading) => translateTextToEnglish(subheading))
      : [],
    place_name: await translateTextToEnglish(source.place_name),
    state: await translateTextToEnglish(source.state),
    district: await translateTextToEnglish(source.district),
    image_caption: await translateTextToEnglish(source.image_caption),
    short_100: await translateTextToEnglish(source.short_100),
    medium_300: AI_MEDIUM_REWRITE_ENABLED ? await translateTextToEnglish(source.medium_300) : "",
    long_500: await translateTextToEnglish(source.long_500),
  };
}

async function findAiTranslationCache(dbPool, rewriteId, language = "english") {
  const [rows] = await dbPool.query(
    `
      SELECT *
      FROM ai_news_translation_cache
      WHERE rewrite_id = ? AND language = ?
      LIMIT 1
    `,
    [rewriteId, language]
  );
  return rows[0] || null;
}

async function saveAiTranslationCache(dbPool, rewriteId, translation, provider = AI_TRANSLATION_PROVIDER) {
  if (!rewriteId || !translation) {
    return null;
  }

  const params = [
    rewriteId,
    "english",
    translation.title || null,
    translation.secondary_headline || null,
    JSON.stringify(Array.isArray(translation.subheadings) ? translation.subheadings : []),
    translation.place_name || null,
    translation.state || null,
    translation.district || null,
    translation.image_caption || null,
    translation.short_100 || null,
    AI_MEDIUM_REWRITE_ENABLED ? translation.medium_300 || null : null,
    translation.long_500 || null,
    provider || "libretranslate",
  ];

  if (dbPool.dialect === "postgres") {
    await dbPool.execute(
      `
        INSERT INTO ai_news_translation_cache (
          rewrite_id, language, title, secondary_headline, subheadings_json, place_name, state, district, image_caption, short_100, medium_300, long_500, provider
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (rewrite_id, language)
        DO UPDATE SET
          title = EXCLUDED.title,
          secondary_headline = EXCLUDED.secondary_headline,
          subheadings_json = EXCLUDED.subheadings_json,
          place_name = EXCLUDED.place_name,
          state = EXCLUDED.state,
          district = EXCLUDED.district,
          image_caption = EXCLUDED.image_caption,
          short_100 = EXCLUDED.short_100,
          medium_300 = EXCLUDED.medium_300,
          long_500 = EXCLUDED.long_500,
          provider = EXCLUDED.provider,
          updated_at = CURRENT_TIMESTAMP
      `,
      params
    );
  } else {
    await dbPool.execute(
      `
        INSERT INTO ai_news_translation_cache (
          rewrite_id, language, title, secondary_headline, subheadings_json, place_name, state, district, image_caption, short_100, medium_300, long_500, provider
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          secondary_headline = VALUES(secondary_headline),
          subheadings_json = VALUES(subheadings_json),
          place_name = VALUES(place_name),
          state = VALUES(state),
          district = VALUES(district),
          image_caption = VALUES(image_caption),
          short_100 = VALUES(short_100),
          medium_300 = VALUES(medium_300),
          long_500 = VALUES(long_500),
          provider = VALUES(provider),
          updated_at = CURRENT_TIMESTAMP
      `,
      params
    );
  }

  return findAiTranslationCache(dbPool, rewriteId, "english");
}

async function ensureEnglishTranslationForRewrite(dbPool, rewrite) {
  if (!AI_ENGLISH_TRANSLATION_ENABLED || !rewrite?.id) {
    return null;
  }

  const existing = await findAiTranslationCache(dbPool, rewrite.id, "english");
  if (
    hasUsefulEnglishTranslation(existing) &&
    (existing.subheadings_json || !Array.isArray(rewrite.ui_hindi?.subheadings) || !rewrite.ui_hindi.subheadings.length) &&
    (existing.place_name || !rewrite.ui_hindi?.place_name) &&
    (existing.state || !rewrite.ui_hindi?.state) &&
    (existing.district || (!rewrite.ui_hindi?.district && !rewrite.ui_hindi?.district_name))
  ) {
    return existing;
  }

  try {
    const source = buildHindiTranslationSource(rewrite);
    if (!source.title || !source.short_100 || !source.long_500) {
      return existing || null;
    }

    const translated = hasUsefulEnglishTranslation(existing)
      ? {
          ...existing,
          subheadings: Array.isArray(source.subheadings)
            ? await mapWithConcurrency(source.subheadings, 2, (subheading) => translateTextToEnglish(subheading))
            : [],
          place_name: await translateTextToEnglish(source.place_name),
          state: await translateTextToEnglish(source.state),
          district: await translateTextToEnglish(source.district),
        }
      : await translateHindiRewriteToEnglish(source);
    if (!hasUsefulEnglishTranslation(translated)) {
      throw new Error("Translation did not produce usable English text.");
    }

    const saved = await saveAiTranslationCache(dbPool, rewrite.id, translated);
    console.log(`[ai-translation] Saved English cache for rewrite_id=${rewrite.id}.`);
    return saved;
  } catch (error) {
    console.warn(`[ai-translation] English cache skipped for rewrite_id=${rewrite.id}: ${error.message}`);
    return existing || null;
  }
}

function applyEnglishTranslationCache(rewrite, translation) {
  if (!rewrite || !hasUsefulEnglishTranslation(translation)) {
    return rewrite;
  }

  const english = {
    headline: cleanGeneratedText(translation.title),
    secondary_headline: cleanGeneratedText(translation.secondary_headline),
    top_summary: (() => {
      if (Array.isArray(translation.subheadings)) {
        return translation.subheadings.map(cleanGeneratedText).filter(Boolean);
      }
      try {
        const parsed = JSON.parse(translation.subheadings_json || "[]");
        return Array.isArray(parsed) ? parsed.map(cleanGeneratedText).filter(Boolean) : [];
      } catch {
        return rewrite.english?.top_summary || [];
      }
    })(),
    short_description: cleanGeneratedText(translation.short_100),
    long_description: cleanGeneratedText(translation.long_500),
    what_to_watch_next: AI_MEDIUM_REWRITE_ENABLED ? cleanGeneratedText(translation.medium_300) : "",
  };

  return {
    ...rewrite,
    english,
    ui_english: {
      ...(rewrite.ui_english || {}),
      title: english.headline,
      secondary_headline: english.secondary_headline,
      subheadings: english.top_summary,
      image_caption: cleanGeneratedText(translation.image_caption),
      place_name: cleanGeneratedText(translation.place_name),
      state: cleanGeneratedText(translation.state),
      district: cleanGeneratedText(translation.district),
      short_100: english.short_description,
      medium_300: english.what_to_watch_next,
      long_500: english.long_description,
      provider: translation.provider || AI_TRANSLATION_PROVIDER,
      translated_at: translation.updated_at || translation.created_at || null,
      source: "GE News Hub report",
    },
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }));

  return results;
}

async function createOrUpdateRewriteForRecord(dbPool, articleRecord, createBrowserPage, afterSave = null) {
  if (!AI_REWRITE_ENABLED) {
    throw new Error("AI rewriting is currently disabled.");
  }

  let browser = null;
  let page = null;

  try {
    const existingRewrite = await findAiRewriteByNewsId(dbPool, articleRecord.id);
    if (existingRewrite && isCurrentAiRewritePrompt(existingRewrite)) {
      return existingRewrite;
    }
    if (existingRewrite) {
      console.log(
        `[ai-rewrite] Regenerating news_id=${articleRecord.id} because prompt_version=${existingRewrite.prompt_version || "unknown"} is older than ${AI_PROMPT_VERSION}.`
      );
    }

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
    await ensureEnglishTranslationForRewrite(dbPool, publishedRewrite);

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

const AI_DELIVERY_FRESH_HOURS = Math.max(
  1,
  Math.min(Number.parseInt(process.env.NEWS_MAX_AGE_HOURS || "24", 10) || 24, 168)
);

const AI_REWRITE_UI_ONLY_COLUMNS = [
  "air.id",
  "air.news_id",
  "air.model_name",
  "air.prompt_version",
  "air.source_url",
  "air.source_title",
  "air.source_excerpt",
  "air.hindi_secondary_headline",
  "air.hindi_top_summary",
  "air.ui_title",
  "air.ui_short_100",
  "air.ui_medium_300",
  "air.ui_long_500",
  "air.ui_keywords_json",
  "air.ui_category",
  "air.ui_state",
  "air.ui_place_name",
  "air.ui_image_url",
  "air.ui_image_prompt",
  "air.ui_source",
  "air.ui_link",
  "air.publication_status",
  "air.published_at",
  "air.published_by",
  "air.delivery_slug",
  "air.created_at",
  "air.updated_at",
].join(",\n          ");

async function listAiRewrites(dbPool, { category = null, limit = 50, publicationStatus = null, freshSinceHours = null, uiOnly = false } = {}) {
  const conditions = [];
  const params = [];

  if (category) {
    const aiCategory = normalizeAiCategoryForDisplay(category);
    const legacyCategory = getLegacyAiCategoryValue(aiCategory);
    if (legacyCategory !== aiCategory) {
      conditions.push("(air.ui_category = ? OR air.ui_category = ?)");
      params.push(aiCategory, legacyCategory);
    } else {
      conditions.push("air.ui_category = ?");
      params.push(aiCategory);
    }
  }

  if (publicationStatus) {
    conditions.push("air.publication_status = ?");
    params.push(publicationStatus);
  }

  if (freshSinceHours) {
    conditions.push("fn.fetched_at >= (NOW() - INTERVAL ? HOUR)");
    params.push(freshSinceHours);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderByClause = publicationStatus === "published"
    ? "ORDER BY air.published_at DESC, air.id DESC"
    : "ORDER BY COALESCE(air.published_at, air.updated_at) DESC, air.id DESC";
  const queryText = `
        SELECT
          ${uiOnly ? AI_REWRITE_UI_ONLY_COLUMNS : "air.*"},
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
        ${orderByClause}
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
    : null;
  const deliveryCategory = formatted.ui_hindi?.category
    ? normalizeAiCategoryForDisplay(formatted.ui_hindi.category)
    : chooseSmartNewsCategory({
    title: formatted.ui_hindi?.title || formatted.hindi?.headline || formatted.english?.headline,
    short_100: formatted.ui_hindi?.short_100 || formatted.hindi?.short_description,
    medium_300: formatted.ui_hindi?.medium_300 || formatted.hindi?.what_to_watch_next,
    long_500: formatted.ui_hindi?.long_500 || formatted.hindi?.long_description,
    keywords: [],
    category: formatted.ui_hindi?.category,
    state: formatted.ui_hindi?.state,
  });
  const hindiRawArticles = {
    words_100: formatted.hindi?.short_description || formatted.ui_hindi?.short_100 || "",
    words_300: AI_MEDIUM_REWRITE_ENABLED ? formatted.hindi?.what_to_watch_next || formatted.ui_hindi?.medium_300 || "" : "",
    words_1000: formatted.hindi?.long_description || formatted.ui_hindi?.long_500 || "",
    words_500: formatted.hindi?.long_description || formatted.ui_hindi?.long_500 || "",
    words_600: formatted.hindi?.long_description || formatted.ui_hindi?.long_500 || "",
  };
  const englishRawArticles = {
    words_100: formatted.english?.short_description || formatted.ui_english?.short_100 || "",
    words_300: AI_MEDIUM_REWRITE_ENABLED ? formatted.english?.what_to_watch_next || formatted.ui_english?.medium_300 || "" : "",
    words_1000: formatted.english?.long_description || formatted.ui_english?.long_500 || "",
    words_500: formatted.english?.long_description || formatted.ui_english?.long_500 || "",
    words_600: formatted.english?.long_description || formatted.ui_english?.long_500 || "",
  };
  const activeRawArticles = language === "english" ? englishRawArticles : hindiRawArticles;

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
    raw_articles: activeRawArticles,
    raw_articles_by_language: {
      hindi: hindiRawArticles,
      english: englishRawArticles,
    },
    ui_hindi: {
      ...(formatted.ui_hindi || {}),
      category: deliveryCategory,
      image_url: deliveredImageUrl,
      image_prompt: "",
    },
    ui_english: {
      ...(formatted.ui_english || {}),
      category: deliveryCategory,
      image_url: deliveredImageUrl,
      image_prompt: "",
    },
  };

  if (language === "english" || language === "hindi") {
    if (language === "english") {
      const {
        ui_hindi: _uiHindi,
        raw_articles_by_language: _rawArticlesByLanguage,
        ...englishOnlyPayload
      } = payload;
      const uiEnglish = englishOnlyPayload.ui_english || {};
      return {
        ...englishOnlyPayload,
        title: uiEnglish.title || formatted.english?.headline || "",
        secondary_headline: uiEnglish.secondary_headline || formatted.english?.secondary_headline || "",
        subheadings: Array.isArray(uiEnglish.subheadings) ? uiEnglish.subheadings : [],
        image_link: deliveredImageUrl,
        image_source: deliveredImageUrl ? formatted.news?.image_source || null : null,
        image_caption: uiEnglish.image_caption || "",
        place_name: uiEnglish.place_name || formatted.ui_hindi?.place_name || "",
        state: uiEnglish.state || deliveryCategory,
        district: uiEnglish.district || formatted.ui_hindi?.district || formatted.ui_hindi?.district_name || "",
        uploaded: formatted.news?.fetched_at || englishOnlyPayload.published_at || englishOnlyPayload.updated_at || null,
        fetched_at: formatted.news?.fetched_at || null,
        feed_source: formatted.news?.feed_source || null,
        feed_url: formatted.news?.feed_url || null,
        short_100: uiEnglish.short_100 || englishRawArticles.words_100 || "",
        medium_300: uiEnglish.medium_300 || englishRawArticles.words_300 || "",
        long_500: uiEnglish.long_500 || englishRawArticles.words_1000 || "",
        source: {
          ...(englishOnlyPayload.source || {}),
          title: formatted.english?.headline || englishOnlyPayload.source?.title || null,
        },
        ui_english: {
          ...uiEnglish,
          subheadings: Array.isArray(uiEnglish.subheadings) ? uiEnglish.subheadings : [],
          state: deliveryCategory,
          place_name: uiEnglish.place_name || formatted.ui_hindi?.place_name || "",
          district: uiEnglish.district || formatted.ui_hindi?.district || formatted.ui_hindi?.district_name || "",
          source: uiEnglish.source || "GE News Hub report",
        },
        language,
        article: formatted.english,
      };
    }

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
      ui_english: record.ui_english
        ? {
            ...record.ui_english,
            image_url: "",
            image_prompt: "",
          }
        : record.ui_english,
    };
  });
}

async function listDeliveredAiRewrites(dbPool, { category = null, limit = 50, language = "both", uiOnly = false } = {}) {
  const records = await listAiRewrites(dbPool, {
    category,
    limit,
    publicationStatus: "published",
    freshSinceHours: AI_DELIVERY_FRESH_HOURS,
    uiOnly,
  });

  const translatedRecords = await mapWithConcurrency(records, 2, async (record) => {
    const translation = language === "english" || language === "both"
      ? await ensureEnglishTranslationForRewrite(dbPool, record)
      : null;
    return applyEnglishTranslationCache(record, translation);
  });

  return removeRepeatedDeliveryImages(translatedRecords.map((record) => formatDeliveredRewrite(record, language)));
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
  if (!rows[0]) {
    return null;
  }

  let record = formatAiRewriteWithNewsRecord(rows[0]);
  if (language === "english" || language === "both") {
    const translation = await ensureEnglishTranslationForRewrite(dbPool, record);
    record = applyEnglishTranslationCache(record, translation);
  }

  return formatDeliveredRewrite(record, language);
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
  await invalidateCategoryCache(dbPool);

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

async function runAiRewriteCycleForCategories({ dbPool, categories, createBrowserPage, afterRewriteSaved = null, isDuplicateOfPublished = null }) {
  if (!AI_REWRITE_ENABLED) {
    return (categories || []).map((category) => ({
      status: "Skipped",
      category,
      message: "AI rewriting is currently disabled.",
    }));
  }

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

        if (typeof isDuplicateOfPublished === "function") {
          try {
            const duplicate = await isDuplicateOfPublished(articleRecord.title);
            if (duplicate) {
              const duplicateError = new Error(
                `Skipped: already published as news_id=${duplicate.news_id} (matching_tokens=${(duplicate.matching_tokens || []).join(",")}).`
              );
              skippedCandidates.push({
                news_id: articleRecord.id,
                title: articleRecord.title,
                message: duplicateError.message,
              });
              await recordAiRewriteSkip(dbPool, articleRecord, duplicateError, "duplicate_of_published");
              continue;
            }
          } catch (error) {
            console.warn(`[ai-rewrite] Duplicate-of-published check failed for news_id=${articleRecord.id}: ${error.message}`);
          }
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
      if (existingRewrite && isCurrentAiRewritePrompt(existingRewrite)) {
        return res.json({
          status: "Success",
          message: "Existing AI rewrite returned. Regeneration is disabled to prevent duplicate rewrites.",
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
          message: "AI rewrite created successfully.",
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
        if (existingRewrite && isCurrentAiRewritePrompt(existingRewrite)) {
          results.push({
            status: "Skipped",
            news_id: articleRecord.id,
            title: articleRecord.title,
            message: "AI rewrite already exists. Regeneration is disabled to prevent duplicate rewrites.",
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
      const category = req.query.category ? normalizeAiCategoryForDisplay(req.query.category) : null;
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
          const key = normalizeAiCategoryForDisplay(item.ui_hindi?.category || AI_DEFAULT_CATEGORY);
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

async function invalidateCategoryCache(dbPool) {
  try {
    const CategoryService = require("./services/category.service");
    const categoryService = new CategoryService({ dbPool });
    await categoryService.invalidateCache();
  } catch (err) {
    console.error("Cache invalidation error in ai-rewrites:", err.message);
  }
}

module.exports = {
  __test: {
    analyzeVerifiedSourceMaterial,
    assemblePublishableArticle,
    assertSufficientSourceMaterial,
    buildGeminiRequestBody,
    buildStage1CorePrompt,
    buildStage2ContinuationPrompt,
    buildCompactBilingualPayload,
    buildHindiOnlyPayload,
    createGeminiTerminationError,
    countBodyWords,
    countArticleWords,
    generateAiRewrite,
    generateCompactBilingualRewrite,
    generateHindiOnlyRewrite,
    generateLegacyHindiRewrite,
    normalizeSingleBodyTiers,
    planHindiOnlyRepairs,
    formatAiRewriteWithNewsRecord,
    formatDeliveredRewrite,
    getSubheadingCount,
    getCompactRawBodyCounts,
    getStage1CurrentCounts,
    getGeminiResponseInfo,
    isCurrentAiRewritePrompt,
    logGeminiResponseInfo,
    hasExactlyOneLabel,
    mergeCompactRepairs,
    normalizeProgressiveBodies,
    mergeStage2Continuation,
    planCompactRepairs,
    validateStage1CorePayload,
    validateAiPayload,
  },
  createOrUpdateRewriteForRecord,
  initializeAiRewriteStorage,
  findDeliveredAiRewrite,
  listAiRewrites,
  listDeliveredAiRewrites,
  registerAiRewriteRoutes,
  runAiRewriteCycleForCategories,
  setAiRewritePublicationStatus,
};

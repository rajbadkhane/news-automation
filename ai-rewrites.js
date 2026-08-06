const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || "gemini-flash-lite-latest").trim() || "gemini-flash-lite-latest";
const GEMINI_API_URL = process.env.GEMINI_API_URL
  || "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const {
  normalizeCategory: normalizeUnifiedCategory,
} = require("./config/news-categories");
const AI_PROMPT_VERSION = "bilingual-compact-v10-two-fact-subheadings-newspaper-style";
const AI_REWRITE_MODE = String(process.env.AI_REWRITE_MODE || "bilingual-compact").trim().toLowerCase();
const AI_REWRITE_MODES = Object.freeze({
  BILINGUAL_COMPACT: "bilingual-compact",
  HINDI_LEGACY: "hindi-legacy",
});
// Word-count anchors: short version targets 300 words, medium 600, long 1100.
// Field names (body100/body300/body1000, short_100/medium_300/long_500) are kept
// for DB/API compatibility even though their actual targets moved.
const AI_LONG_REWRITE_MIN_WORDS = 1050;
const AI_LONG_REWRITE_MAX_WORDS = 1150;
const AI_LEAD_BODY_MIN_WORDS = 285;
const AI_LEAD_BODY_MAX_WORDS = 315;
const AI_EXTENSION_200_MIN_WORDS = 275;
const AI_EXTENSION_200_MAX_WORDS = 325;
const AI_EXTENSION_700_MIN_WORDS = 750;
const AI_EXTENSION_700_MAX_WORDS = 790;
const AI_LEAD_BODY_ACCEPT_MIN_WORDS = 260;
const AI_LEAD_BODY_ACCEPT_MAX_WORDS = 340;
const AI_EXTENSION_200_ACCEPT_MIN_WORDS = 230;
const AI_EXTENSION_200_ACCEPT_MAX_WORDS = 370;
const AI_EXTENSION_700_ACCEPT_MIN_WORDS = 550;
const AI_EXTENSION_700_ACCEPT_MAX_WORDS = 880;
const AI_BODY_100_MIN_WORDS = 285;
const AI_BODY_100_MAX_WORDS = 315;
const AI_BODY_300_MIN_WORDS = 570;
const AI_BODY_300_MAX_WORDS = 630;
const AI_BODY_100_EMERGENCY_MIN_WORDS = 265;
const AI_BODY_100_EMERGENCY_MAX_WORDS = 335;
const AI_BODY_300_EMERGENCY_MIN_WORDS = 540;
const AI_BODY_300_EMERGENCY_MAX_WORDS = 660;
const AI_MIN_SOURCE_WORDS_FOR_LONG_REWRITE = 80;
const AI_MIN_SOURCE_FACT_TOKENS = 4;
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
- Generate progressive body sections once per language.
- Segment names describe editorial progression, not exact independent word-count contracts.
- Aim lead_100 at 260 to 340 body words when practical. It will become the 300-word version.
- Aim extension_200 at 230 to 370 additional body words when practical. lead_100 + extension_200 will become the 600-word version.
- extension_700 must usually be 550 to 880 additional supported body words.
- lead_100 + extension_200 + extension_700 must reach a publishable 1050 to 1150 body words in each language, preferably 1070 to 1130.
- Never stop the progressive stream around 350, 600 or 700 words when the supplied source has enough verified material for 1050 to 1150 words.
- This is a hard output contract: each language must contain enough body text for the cumulative stream to validate at 1050 to 1150 body words.
- For long bodies, write a detailed full news article from the verified source material rather than a compact summary.
- Keep sentences complete and reasonably short so the application can trim at sentence boundaries near 300, 600 and 1100 words.
- The application will assemble the compatibility fields short_100/medium_300/long_500 cumulatively as 300/600/1100-word versions from the progressive stream.
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
- lead_100 and extension_200 are progressive body sections. They must contain enough complete sentences for the application to assemble valid 300-word and 600-word article bodies.
- lead_100 must open with a place-name dateline followed by a period, then continue directly into the report (newspaper style, not agency style).
- lead_100 + extension_200 must be 570-630 body words in each language when possible.
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
  Math.min(Number.parseInt(process.env.AI_REWRITE_CANDIDATE_LIMIT || "30", 10), 50)
);
const AI_REWRITES_PER_CATEGORY_RUN = Math.max(
  1,
  Math.min(Number.parseInt(process.env.AI_REWRITES_PER_CATEGORY_RUN || "6", 10) || 6, 15)
);
const AI_REWRITE_AUTO_PUBLISH = !["false", "0", "no"].includes(
  String(process.env.AI_REWRITE_AUTO_PUBLISH || "true").toLowerCase()
);
const AI_REWRITE_ENABLED = !["false", "0", "no"].includes(
  String(process.env.AI_REWRITE_ENABLED || "true").toLowerCase()
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
        "ALTER TABLE ai_news_rewrites ADD COLUMN hindi_secondary_headline TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN english_secondary_headline TEXT",
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
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_image_url TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_image_prompt TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_source TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN ui_link TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN hindi_secondary_headline TEXT",
        "ALTER TABLE ai_news_rewrites ADD COLUMN english_secondary_headline TEXT",
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
  const signal = findMpCategorySignal([
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

  if (!signal || uiHindi.category === "Madhya Pradesh") {
    return uiHindi;
  }

  const previousCategory = uiHindi.category || AI_DEFAULT_CATEGORY;
  const reason = `Madhya Pradesh signal detected: ${signal}.`;
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
    confidence: normalizeAiConfidence(normalized.confidence),
    reason: normalizeClassificationReason(normalized.reason),
  };

  const uiHindi = {
    title: cleanedPayload.title,
    short_100: cleanedPayload.short_100,
    medium_300: cleanedPayload.medium_300,
    long_500: cleanedPayload.long_500,
    keywords,
    category: cleanedPayload.category,
    state: cleanedPayload.state,
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
  const remainingText = prefixText && cleanSourceText.startsWith(prefixText)
    ? cleanSourceText.slice(prefixText.length).trim()
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
    const sourceWords = cleanSourceText.split(/\s+/).filter(Boolean);
    const prefixWordList = prefixText ? prefixText.split(/\s+/).filter(Boolean) : [];
    const desiredTotal = Math.min(Math.max(target, emergencyMin), emergencyMax);
    const fallbackWords = prefixText && cleanSourceText.startsWith(prefixText)
      ? [
          ...prefixWordList,
          ...cleanSourceText.slice(prefixText.length).trim().split(/\s+/).filter(Boolean).slice(0, Math.max(0, desiredTotal - prefixWordList.length)),
        ]
      : sourceWords.slice(0, desiredTotal);
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
      if (summary.length !== 3 || summary.some(hasBadSubheadingLabel)) {
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
    if (!uiHindi.short_100 || !uiHindi.medium_300 || !uiHindi.long_500) {
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
        top_summary: cleanSummaryList(english.top_summary).slice(0, 3),
        short_description: cleanGeneratedText(english.short_description),
        long_description: cleanGeneratedText(english.long_description),
        what_to_watch_next: cleanGeneratedText(english.what_to_watch_next),
      },
      hindi: {
        headline: cleanGeneratedText(hindi.headline),
        top_summary: cleanSummaryList(hindi.top_summary).slice(0, 3),
        short_description: cleanGeneratedText(hindi.short_description),
        long_description: cleanGeneratedText(hindi.long_description),
        what_to_watch_next: cleanGeneratedText(hindi.what_to_watch_next),
      },
      ui_hindi: {
        ...uiHindi,
        subheadings: Array.isArray(payload.ui_hindi?.subheadings)
          ? cleanSummaryList(payload.ui_hindi.subheadings).slice(0, 3)
          : cleanSummaryList(hindi.top_summary).slice(0, 3),
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
        uiHindi?.medium_300 || null,
        uiHindi?.long_500 || null,
        JSON.stringify(Array.isArray(uiHindi?.keywords) ? uiHindi.keywords : []),
        uiHindi?.category || null,
        uiHindi?.state || null,
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
              ui_title, ui_short_100, ui_medium_300, ui_long_500, ui_keywords_json, ui_category, ui_state,
              ui_image_url, ui_image_prompt, ui_source, ui_link,
              raw_response
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (news_id) DO NOTHING
          `
        : `
            INSERT INTO ai_news_rewrites (
              news_id, model_name, prompt_version, source_url, source_title, source_excerpt,
              english_headline, english_secondary_headline, english_top_summary, english_short_description, english_long_description, english_what_to_watch_next,
              hindi_headline, hindi_secondary_headline, hindi_top_summary, hindi_short_description, hindi_long_description, hindi_what_to_watch_next,
              ui_title, ui_short_100, ui_medium_300, ui_long_500, ui_keywords_json, ui_category, ui_state,
              ui_image_url, ui_image_prompt, ui_source, ui_link,
              raw_response
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGeminiRequestBody(messages, { temperature, maxTokens })),
    });

    const payload = await response.json();
    logGeminiUsage(payload, { articleId, mode, call });
    const responseInfo = getGeminiResponseInfo(payload, { maxTokens, call });
    logGeminiResponseInfo(responseInfo, { articleId, mode });

    if (response.ok) {
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
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      continue;
    }

    throw lastError;
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
- Each language's lead_100 + extension_200 + extension_700 must contain 1050 to 1150 body words.
- Do not return only a 350-word or 600-word summary when the extracted source has enough material.

RAW ARTICLE TEXT
${truncateText(articleText.combinedText, 14000)}`;
}

function buildStage1CorePrompt(articleRecord, articleText) {
  return `${buildRawArticleContextPrompt(articleRecord, articleText)}

STAGE 1 OUTPUT
- Return classification, Hindi heading/secondary_heading/subheadings/photo_caption/lead_100/extension_200 and English heading/secondary_heading/subheadings/photo_caption/lead_100/extension_200.
- Do not return extension_700 yet.
- The core body must support local cumulative 300-word and 600-word normalization.
- In each language, lead_100 + extension_200 should be 570-630 body words total.
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
    hindiTarget: Math.max(500, 1100 - hindiCurrent),
    englishTarget: Math.max(500, 1100 - englishCurrent),
    hindiMin: Math.max(500, 1050 - hindiCurrent),
    hindiMax: Math.max(Math.max(500, 1050 - hindiCurrent) + 50, 1150 - hindiCurrent),
    englishMin: Math.max(500, 1050 - englishCurrent),
    englishMax: Math.max(Math.max(500, 1050 - englishCurrent) + 50, 1150 - englishCurrent),
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
- hindi_extension_700 must be Hindi only and ${counts.hindiMin}-${counts.hindiMax} words when possible.
- english_extension_700 must be English only and ${counts.englishMin}-${counts.englishMax} words when possible.
- Continue the existing report without repeating the Stage 1 body.
- Do not include heading, secondary heading, subheadings, caption, agency label or source label.
- Use complete sentences so local normalization can trim near 1100 words.

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
  const targetNeeded = Math.max(0, 1000 - currentWords);
  const requestedMinimum = minimumNeeded + 20;
  const requestedMaximum = Math.min(Math.max(requestedMinimum, targetNeeded + 80), 350);
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
          required: `Replace the full ${language} package because its progressive body is only ${range.currentWords} words and cannot be rescued by one continuation. Return heading, secondary_heading, exactly two subheadings, photo_caption, lead_100, extension_200 and extension_700 with a cumulative 1050-1150 body words.`,
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
    "hindi.lead_100": `approximately 300 Hindi body words opening with a place-name dateline, acceptable ${AI_LEAD_BODY_ACCEPT_MIN_WORDS}-${AI_LEAD_BODY_ACCEPT_MAX_WORDS}`,
    "english.lead_100": `approximately 300 English body words opening with a place-name dateline, acceptable ${AI_LEAD_BODY_ACCEPT_MIN_WORDS}-${AI_LEAD_BODY_ACCEPT_MAX_WORDS}`,
    "hindi.extension_200": `approximately 300 additional Hindi body words, acceptable ${AI_EXTENSION_200_ACCEPT_MIN_WORDS}-${AI_EXTENSION_200_ACCEPT_MAX_WORDS}`,
    "english.extension_200": `approximately 300 additional English body words, acceptable ${AI_EXTENSION_200_ACCEPT_MIN_WORDS}-${AI_EXTENSION_200_ACCEPT_MAX_WORDS}`,
    "hindi.extension_700": `approximately 750 additional Hindi body words, acceptable ${AI_EXTENSION_700_ACCEPT_MIN_WORDS}-${AI_EXTENSION_700_ACCEPT_MAX_WORDS}`,
    "english.extension_700": `approximately 750 additional English body words, acceptable ${AI_EXTENSION_700_ACCEPT_MIN_WORDS}-${AI_EXTENSION_700_ACCEPT_MAX_WORDS}`,
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
For replace_language, the returned language package must include lead_100, extension_200 and extension_700 with a cumulative 950-1050 body words.
Use replace for missing, empty, wrong-language or malformed fields. Replacement body fields replace the old field; they are not appended.
Use append only for long_cumulative repair, and only at hindi.extension_700 or english.extension_700.
For append operations, return continuation sentences within requestedMinimum/requestedMaximum words from the repair plan.
After append, the cumulative body1000 must be 950 to 1050 body words.
For body100_cumulative, replace lead_100 only so the compatibility field short_100 becomes the 250-word version.
For body300_cumulative, replace extension_200 only so the compatibility field medium_300 becomes the 500-word version.
For long_cumulative, append continuation to extension_700 only.
If repairing subheadings, return the full array at hindi.subheadings or english.subheadings with exactly three factual mini-headlines.
For body repairs, use complete sentences and avoid repeating the headline, subheadings or caption.
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

async function generateAiRewrite(articleRecord, articleText) {
  if (AI_REWRITE_MODE === AI_REWRITE_MODES.HINDI_LEGACY) {
    return generateLegacyHindiRewrite(articleRecord, articleText);
  }

  if (AI_REWRITE_MODE && AI_REWRITE_MODE !== AI_REWRITE_MODES.BILINGUAL_COMPACT) {
    console.warn(`[ai-rewrite] Unknown AI_REWRITE_MODE="${AI_REWRITE_MODE}". Using bilingual-compact.`);
  }

  return generateCompactBilingualRewrite(articleRecord, articleText);
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
  }

  formatted.ui_english = {
    title: formatted.english.headline,
    secondary_headline: formatted.english.secondary_headline,
    short_100: formatted.english.short_description,
    medium_300: formatted.english.what_to_watch_next,
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
      words_1000: formatted.ui_hindi?.long_500 || formatted.hindi?.long_description || "",
      words_600: formatted.ui_hindi?.long_500 || formatted.hindi?.long_description || "",
      words_500: formatted.ui_hindi?.long_500 || formatted.hindi?.long_description || "",
    },
    raw_articles_by_language: {
      hindi: {
        words_100: formatted.hindi?.short_description || formatted.ui_hindi?.short_100 || "",
        words_300: formatted.hindi?.what_to_watch_next || formatted.ui_hindi?.medium_300 || "",
        words_1000: formatted.hindi?.long_description || formatted.ui_hindi?.long_500 || "",
        words_500: formatted.hindi?.long_description || formatted.ui_hindi?.long_500 || "",
        words_600: formatted.hindi?.long_description || formatted.ui_hindi?.long_500 || "",
      },
      english: {
        words_100: formatted.english?.short_description || "",
        words_300: formatted.english?.what_to_watch_next || "",
        words_1000: formatted.english?.long_description || "",
        words_500: formatted.english?.long_description || "",
        words_600: formatted.english?.long_description || "",
      },
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

async function runAiRewriteCycleForCategories({ dbPool, categories, createBrowserPage, afterRewriteSaved = null }) {
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
    createGeminiTerminationError,
    countBodyWords,
    countArticleWords,
    generateAiRewrite,
    generateCompactBilingualRewrite,
    generateLegacyHindiRewrite,
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

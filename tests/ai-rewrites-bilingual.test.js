const assert = require("assert");
const { __test } = require("../ai-rewrites");

const hindiWords = [
  "समाचार",
  "विभाग",
  "समीक्षा",
  "प्रक्रिया",
  "नागरिक",
  "सेवा",
  "असर",
  "दस्तावेज",
  "तैयारी",
  "जानकारी",
];

const englishWords = [
  "verified",
  "news",
  "agency",
  "review",
  "process",
  "public",
  "service",
  "records",
  "context",
  "update",
];

function sentence(words, offset = 0, end = ".") {
  return Array.from({ length: 10 }, (_, index) => words[(index + offset) % words.length]).join(" ") + end;
}

function repeatSentences(words, count, end = ".") {
  return Array.from({ length: count }, (_, index) => sentence(words, index, end)).join(" ");
}

function countWords(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function makeCompactPayload(overrides = {}) {
  const base = {
    classification: {
      category: "National",
      state: "राष्ट्रीय",
      confidence: 0.98,
      reason: "The primary event is an Indian national issue outside Madhya Pradesh.",
      keywords: ["नीति", "सेवा", "अपडेट"],
    },
    hindi: {
      heading: "केंद्र की नई व्यवस्था पर विभागों ने समीक्षा प्रक्रिया तेज की",
      secondary_heading: "केंद्र, समीक्षा : विभागों ने नई व्यवस्था पर जवाबदेही तय करने के लिए ठोस कदम उठाए",
      subheadings: [
        "विभागीय समीक्षा में प्रक्रिया और जवाबदेही पर मुख्य ध्यान रखा गया",
        "नागरिक सेवाओं से जुड़े असर को सावधानी से परखा जा रहा है",
      ],
      photo_caption: "प्रशासनिक समीक्षा से जुड़ी प्रतीकात्मक तस्वीर, जिसमें नीति और नागरिक सेवाओं पर ध्यान केंद्रित है।",
      lead_100: repeatSentences(hindiWords, 9, "।"),
      extension_200: repeatSentences(hindiWords, 23, "।"),
      extension_700: repeatSentences(hindiWords, 108, "।"),
    },
    english: {
      heading: "Departments Step Up Review Of New Central Administrative Process",
      secondary_heading: "Center, review : Departments take concrete steps to fix accountability under the new system",
      subheadings: [
        "Departmental review focuses on process clarity and accountability",
        "Potential impact on citizen services is being assessed carefully",
      ],
      photo_caption: "A representative context image related to policy review and citizen service processes under administrative assessment.",
      lead_100: repeatSentences(englishWords, 9),
      extension_200: repeatSentences(englishWords, 23),
      extension_700: repeatSentences(englishWords, 108),
    },
  };

  return {
    ...base,
    ...overrides,
    hindi: {
      ...base.hindi,
      ...(overrides.hindi || {}),
    },
    english: {
      ...base.english,
      ...(overrides.english || {}),
    },
  };
}

const articleRecord = {
  id: 123,
  category: "National",
  title: "Departments review central administrative process",
  source_url: "https://example.com/news/story",
  source_excerpt: "Departments are reviewing a central administrative process.",
};

const articleText = {
  title: articleRecord.title,
  combinedText: repeatSentences(englishWords, 40),
};

const compactRequestBody = __test.buildGeminiRequestBody([{ role: "user", content: "Return JSON." }], {
  temperature: 0.2,
  maxTokens: 20000,
});
assert.strictEqual(compactRequestBody.model, "gemini-flash-lite-latest");
assert.strictEqual(Object.prototype.hasOwnProperty.call(compactRequestBody, "thinking"), false);
assert.strictEqual(compactRequestBody.max_tokens, 20000);
assert.deepStrictEqual(compactRequestBody.response_format, { type: "json_object" });
assert.strictEqual(Object.prototype.hasOwnProperty.call(compactRequestBody, "extra_body"), false);

const stoppedInfo = __test.getGeminiResponseInfo({
  model: "gemini-flash-lite-latest",
  choices: [{
    finish_reason: "stop",
    message: { content: "{\"ok\":true}" },
  }],
  usage: {
    prompt_tokens: 11,
    completion_tokens: 13,
    completion_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 24,
  },
}, { maxTokens: 20000, call: "main" });
assert.strictEqual(stoppedInfo.finish_reason, "stop");
assert.strictEqual(stoppedInfo.reasoning_tokens, 0);
assert.strictEqual(stoppedInfo.content_chars, 11);
assert.strictEqual(__test.createGeminiTerminationError(stoppedInfo), null);

const lengthInfo = {
  ...stoppedInfo,
  finish_reason: "length",
};
assert.throws(
  () => {
    const error = __test.createGeminiTerminationError(lengthInfo);
    if (error) throw error;
  },
  /generation token limit/
);

const capturedLogs = [];
const originalLog = console.log;
console.log = (line) => capturedLogs.push(String(line));
try {
  __test.logGeminiResponseInfo({
    requested_model: "gemini-flash-lite-latest",
    returned_model: "gemini-flash-lite-latest",
    thinking: "disabled",
    max_tokens: 20000,
    finish_reason: "stop",
    prompt_tokens: 10,
    completion_tokens: 20,
    reasoning_tokens: 0,
    total_tokens: 30,
    content_chars: 999,
    call: "main",
    content: "FULL GENERATED ARTICLE TEXT MUST NOT BE LOGGED",
  }, {
    articleId: 123,
    mode: "bilingual-compact",
  });
} finally {
  console.log = originalLog;
}
assert.ok(capturedLogs[0].includes("finish_reason=stop"));
assert.ok(capturedLogs[0].includes("reasoning_tokens=0"));
assert.ok(!capturedLogs[0].includes("FULL GENERATED ARTICLE"));
assert.strictEqual(
  __test.isCurrentAiRewritePrompt({ prompt_version: "hindi-only-v13-1000-1100-words" }),
  true
);
assert.strictEqual(
  __test.isCurrentAiRewritePrompt({ prompt_version: "hindi-ui-news-v8-journalist-grade-ge" }),
  false
);

const compact = makeCompactPayload();
const stage1Fixture = {
  classification: compact.classification,
  hindi: {
    heading: compact.hindi.heading,
    subheadings: compact.hindi.subheadings,
    photo_caption: compact.hindi.photo_caption,
    lead_100: compact.hindi.lead_100,
    extension_200: compact.hindi.extension_200,
  },
  english: {
    heading: compact.english.heading,
    subheadings: compact.english.subheadings,
    photo_caption: compact.english.photo_caption,
    lead_100: compact.english.lead_100,
    extension_200: compact.english.extension_200,
  },
};
const stage1Prompt = __test.buildStage1CorePrompt(articleRecord, articleText);
assert.ok(stage1Prompt.includes("Do not return extension_700 yet."));
assert.ok(stage1Prompt.includes("RAW ARTICLE TEXT"));
assert.strictEqual(Object.prototype.hasOwnProperty.call(stage1Fixture.hindi, "extension_700"), false);
const validatedStage1 = __test.validateStage1CorePayload(stage1Fixture, articleRecord, articleText);
const stage1Counts = __test.getStage1CurrentCounts(validatedStage1);
assert.ok(stage1Counts.hindiCurrent >= 300);
assert.ok(stage1Counts.englishCurrent >= 300);
const stage2Prompt = __test.buildStage2ContinuationPrompt(articleRecord, articleText, validatedStage1);
assert.ok(stage2Prompt.includes(String(stage1Counts.hindiCurrent)));
assert.ok(stage2Prompt.includes(validatedStage1.hindi.lead_100.slice(0, 30)));
assert.ok(stage2Prompt.includes("Return only:"));
assert.ok(stage2Prompt.includes("hindi_extension_700"));
assert.ok(stage2Prompt.includes("english_extension_700"));
const twoStageMerged = __test.mergeStage2Continuation(validatedStage1, {
  hindi_extension_700: compact.hindi.extension_700,
  english_extension_700: compact.english.extension_700,
});
assert.strictEqual(twoStageMerged.hindi.lead_100, validatedStage1.hindi.lead_100);
assert.strictEqual(twoStageMerged.english.extension_200, validatedStage1.english.extension_200);
assert.strictEqual(twoStageMerged.hindi.extension_700, compact.hindi.extension_700);

const normalized = __test.buildCompactBilingualPayload(compact, articleRecord, articleText);

assert.strictEqual(__test.hasExactlyOneLabel(normalized.hindi.short_description, "Subheadings:"), false);
assert.strictEqual(__test.hasExactlyOneLabel(normalized.english.short_description, "Subheadings:"), false);
assert.strictEqual(__test.hasExactlyOneLabel(normalized.hindi.short_description, "Photo Caption:"), true);
assert.strictEqual(__test.hasExactlyOneLabel(normalized.english.short_description, "Photo Caption:"), true);
assert.strictEqual(normalized.hindi.top_summary.length, 2);
assert.strictEqual(normalized.english.top_summary.length, 2);
assert.strictEqual(normalized.ui_hindi.subheadings.length, 2);
assert.strictEqual(normalized.ui_english.subheadings.length, 2);
// Body tiers deliberately do NOT repeat the title/secondary headline anymore
// (they're already separate fields) — this was pure duplication for a
// consumer rendering title, sub-headline and body as distinct elements.
assert.ok(!normalized.hindi.short_description.includes(normalized.ui_hindi.secondary_headline));
assert.ok(!normalized.english.short_description.includes(normalized.ui_english.secondary_headline));
assert.strictEqual(normalized.ui_hindi.long_500, normalized.hindi.long_description);
assert.strictEqual(normalized.ui_english.long_500, normalized.english.long_description);
assert.strictEqual(normalized.raw_articles, undefined);
assert.ok(countWords(compact.hindi.lead_100) < 95, "lead segment count is not an independent hard contract");
assert.ok(normalized._compact_counts.hindi.normalized.body100 >= 300);
assert.ok(normalized._compact_counts.hindi.normalized.body300 >= 600);
assert.ok(normalized._compact_counts.hindi.normalized.body1000 >= 1000);
assert.ok(normalized._compact_counts.hindi.normalized.body1000 <= 1100);
assert.ok(normalized._compact_counts.english.normalized.body100 >= 300);
assert.ok(normalized._compact_counts.english.normalized.body300 >= 600);
assert.ok(normalized._compact_counts.english.normalized.body1000 >= 1000);

const toppedUpLead = makeCompactPayload({
  hindi: {
    lead_100: repeatSentences(hindiWords, 7, "।"),
    extension_200: repeatSentences(hindiWords, 19, "।"),
  },
  english: {
    lead_100: repeatSentences(englishWords, 7),
    extension_200: repeatSentences(englishWords, 19),
  },
});
const toppedNormalized = __test.buildCompactBilingualPayload(toppedUpLead, articleRecord, articleText);
assert.strictEqual(countWords(toppedUpLead.english.lead_100), 70);
assert.ok(toppedNormalized._compact_counts.english.normalized.body100 >= 300);

const progressive = __test.normalizeProgressiveBodies(toppedUpLead.english, "english");
assert.ok(progressive.bodies.body300.startsWith(progressive.bodies.body100));
assert.ok(progressive.bodies.body1000.startsWith(progressive.bodies.body300));

const overlong = __test.buildCompactBilingualPayload(makeCompactPayload({
  hindi: { extension_700: repeatSentences(hindiWords, 150, "।") },
  english: { extension_700: repeatSentences(englishWords, 150) },
}), articleRecord, articleText);
assert.ok(overlong._compact_counts.english.segment.extension_700 > 1400);
assert.ok(overlong._compact_counts.english.normalized.body1000 <= 1100);

assert.throws(
  () => __test.buildCompactBilingualPayload(makeCompactPayload({
    hindi: { extension_700: repeatSentences(hindiWords, 20, "।") },
    english: { extension_700: repeatSentences(englishWords, 20) },
  }), articleRecord, articleText),
  (error) => {
    assert.ok(error.invalidFields.includes("hindi.long_cumulative"));
    assert.ok(error.invalidFields.includes("english.long_cumulative"));
    assert.ok(error.validationDetails["english.long_cumulative"].words < 1000);
    return true;
  }
);

const shortPlan = __test.planCompactRepairs(makeCompactPayload({
  english: { extension_700: repeatSentences(englishWords, 64) },
}), ["english.long_cumulative"], {
  "english.long_cumulative": { words: 900 },
});
assert.ok(shortPlan.append["english.extension_700"]);
assert.ok(shortPlan.append["english.extension_700"].requestedMinimum > 0);
assert.deepStrictEqual(Object.keys(shortPlan.replace), []);

const tooShortPlan = __test.planCompactRepairs(makeCompactPayload({
  english: { extension_700: repeatSentences(englishWords, 10) },
}), ["english.long_cumulative"], {
  "english.long_cumulative": { words: 390 },
});
assert.ok(tooShortPlan.replace_language.english);
assert.strictEqual(tooShortPlan.append["english.extension_700"], undefined);

const malformedLeadPlan = __test.planCompactRepairs(makeCompactPayload({
  english: { lead_100: "गलत भाषा" },
}), ["english.lead_100"]);
assert.ok(malformedLeadPlan.replace["english.lead_100"]);
assert.strictEqual(malformedLeadPlan.append["english.lead_100"], undefined);

const unusableEnglishPlan = __test.planCompactRepairs(makeCompactPayload({
  english: {
    heading: "गलत",
    photo_caption: "गलत",
    lead_100: "गलत",
    extension_200: "गलत",
    extension_700: "गलत",
  },
}), ["english.heading", "english.photo_caption", "english.lead_100", "english.extension_200", "english.extension_700"]);
assert.ok(unusableEnglishPlan.replace_language.english);
assert.strictEqual(unusableEnglishPlan.replace_language.hindi, undefined);

const repaired = __test.mergeCompactRepairs(makeCompactPayload(), {
  replace: {
    "english.lead_100": { text: repeatSentences(englishWords, 9) },
  },
  append: {
    "english.extension_700": { continuation: repeatSentences(englishWords, 5) },
  },
});
assert.strictEqual(countWords(repaired.english.lead_100), 90);
assert.strictEqual(countWords(repaired.english.extension_700), 1130);

assert.throws(
  () => __test.buildCompactBilingualPayload(makeCompactPayload({
    hindi: {
      subheadings: ["Fact 1", "Fact 2", "Fact 3"],
    },
  }), articleRecord, articleText),
  /subheadings/
);

assert.throws(
  () => __test.assertSufficientSourceMaterial(articleRecord, {
    combinedText: "Only a headline",
  }),
  /Insufficient verified source material/
);

const formattedDelivery = __test.formatDeliveredRewrite({
  id: 99,
  news_id: 123,
  model_name: "gemini-flash-lite-latest",
  prompt_version: "test",
  source_url: articleRecord.source_url,
  source_title: articleRecord.title,
  source_excerpt: articleRecord.source_excerpt,
  english_headline: normalized.english.headline,
  english_top_summary: JSON.stringify(normalized.english.top_summary),
  english_short_description: normalized.english.short_description,
  english_long_description: normalized.english.long_description,
  english_what_to_watch_next: normalized.english.what_to_watch_next,
  hindi_headline: normalized.hindi.headline,
  hindi_top_summary: JSON.stringify(normalized.hindi.top_summary),
  hindi_short_description: normalized.hindi.short_description,
  hindi_long_description: normalized.hindi.long_description,
  hindi_what_to_watch_next: normalized.hindi.what_to_watch_next,
  ui_title: normalized.ui_hindi.title,
  ui_short_100: normalized.ui_hindi.short_100,
  ui_medium_300: normalized.ui_hindi.medium_300,
  ui_long_500: normalized.ui_hindi.long_500,
  ui_keywords_json: JSON.stringify(normalized.ui_hindi.keywords),
  ui_category: normalized.ui_hindi.category,
  ui_state: normalized.ui_hindi.state,
  ui_source: normalized.ui_hindi.source,
  ui_link: normalized.ui_hindi.link,
  raw_response: JSON.stringify(normalized),
  publication_status: "published",
  delivery_slug: "test-story-99",
  news_title: articleRecord.title,
  news_source_url: articleRecord.source_url,
  news_image_link: "https://example.com/image.jpg",
  news_image_source: "article-image",
  news_fetched_at: "2026-08-02T00:00:00.000Z",
  news_feed_source: "test",
  news_feed_url: "https://example.com/feed.xml",
  category: "National",
}, "both");

// Delivery payloads intentionally omit raw_articles / raw_articles_by_language / the
// top-level article blob — they duplicated ui_hindi/ui_english content several times
// over and were bloating the public delivery API response for no benefit.
assert.strictEqual(formattedDelivery.raw_articles, undefined);
assert.strictEqual(formattedDelivery.raw_articles_by_language, undefined);
assert.strictEqual(formattedDelivery.article, undefined);
assert.strictEqual(formattedDelivery.ui_hindi.short_100, normalized.ui_hindi.short_100);
assert.strictEqual(formattedDelivery.ui_english.image_url, "https://example.com/image.jpg");
assert.strictEqual(formattedDelivery.ui_hindi.image_url, "https://example.com/image.jpg");
assert.strictEqual(typeof __test.generateLegacyHindiRewrite, "function");
assert.strictEqual(typeof __test.generateCompactBilingualRewrite, "function");

console.log("ai rewrite bilingual compact tests passed");

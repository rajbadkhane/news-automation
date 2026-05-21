const assert = require("node:assert/strict");
const {
  DEFAULT_UNIFIED_CATEGORY,
  UNIFIED_NEWS_CATEGORIES,
  createUnifiedNewsArticle,
  normalizeCategory,
} = require("../config/news-categories");

const cases = [
  ["madhyapradesh", "Madhyapradesh"],
  ["madhya pradesh district", "Madhyapradesh"],
  ["mpinfo", "Madhyapradesh"],
  ["national/state", "National/State"],
  ["National / राष्ट्रीय", "National/State"],
  ["states", "National/State"],
  ["india", "National/State"],
  ["regional mp local", "National/State"],
  ["tech", "National/State"],
  ["world", "International"],
  ["internationala", "International"],
  ["global affairs", "International"],
  ["business-economy", "Business"],
  ["finance markets", "Business"],
  ["cricket world cup", "Sports"],
  ["football", "Sports"],
  ["bollywood celebrity", "Entertainment"],
  ["tv cinema", "Entertainment"],
];

for (const [input, expected] of cases) {
  assert.equal(normalizeCategory(input), expected, `${input} should map to ${expected}`);
}

assert.equal(normalizeCategory("unknown-category"), DEFAULT_UNIFIED_CATEGORY);
assert.deepEqual(UNIFIED_NEWS_CATEGORIES, [
  "Madhyapradesh",
  "National/State",
  "International",
  "Business",
  "Sports",
  "Entertainment",
]);

assert.deepEqual(
  createUnifiedNewsArticle({
    title: "Sample",
    description: "Description",
    source: "dd",
    category: "international",
    publishedAt: "2026-05-20T10:00:00Z",
    url: "https://example.com/news",
    image: "https://example.com/image.jpg",
  }),
  {
    title: "Sample",
    description: "Description",
    source: "dd",
    originalCategory: "international",
    normalizedCategory: "International",
    publishedAt: "2026-05-20T10:00:00Z",
    url: "https://example.com/news",
    image: "https://example.com/image.jpg",
  }
);

console.log("news category normalization tests passed");

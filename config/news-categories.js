const DEFAULT_UNIFIED_CATEGORY = "National/State";

const UNIFIED_NEWS_CATEGORIES = Object.freeze([
  "Madhyapradesh",
  "National/State",
  "International",
  "Business",
  "Sports",
  "Entertainment",
]);

const CATEGORY_MAPPING = Object.freeze({
  Madhyapradesh: Object.freeze([
    "madhyapradesh",
    "madhya pradesh",
    "madhya-pradesh",
    "mpinfo",
    "mp info",
    "mpinfo district",
    "mp district",
    "mp districts",
    "madhya pradesh district",
    "madhya pradesh districts",
  ]),
  "National/State": Object.freeze([
    "national",
    "national/state",
    "state",
    "states",
    "india",
    "india news",
    "regional",
    "mp",
    "madhya pradesh",
    "nation",
    "local",
    "top",
    "top stories",
    "top_stories",
    "general",
    "politics",
    "science",
    "health",
    "tech",
    "technology",
    "food",
    "travel",
    "national राष्ट्रीय",
    "state news राज्य समाचार",
    "regional क्षेत्रीय",
    "special news विशेष",
    "article लेख",
    "government",
    "pib",
  ]),
  International: Object.freeze([
    "world",
    "world news",
    "worldnews",
    "international",
    "international अंतरराष्ट्रीय",
    "internationala",
    "global",
    "foreign",
  ]),
  Business: Object.freeze([
    "business",
    "business व्यापार",
    "business economy",
    "business-economy",
    "businesseconomy",
    "finance",
    "economy",
    "market",
    "markets",
    "stocks",
    "stock",
    "sensex",
    "nifty",
  ]),
  Sports: Object.freeze([
    "sports",
    "sports खेल",
    "sport",
    "cricket",
    "football",
    "hockey",
    "ipl",
    "olympics",
  ]),
  Entertainment: Object.freeze([
    "entertainment",
    "entertainment मनोरंजन",
    "movies",
    "movie",
    "cinema",
    "bollywood",
    "tv",
    "television",
    "celebrity",
    "showbiz",
    "film",
  ]),
});

const CATEGORY_PRIORITY = Object.freeze([...UNIFIED_NEWS_CATEGORIES]);

// Normalize category strings without losing the National/State slash separator.
function normalizeCategoryToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}/]+/gu, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function getCategoryAliases(category) {
  const canonical = UNIFIED_NEWS_CATEGORIES.includes(category) ? category : DEFAULT_UNIFIED_CATEGORY;
  return [canonical, ...(CATEGORY_MAPPING[canonical] || [])];
}

function getExactCategoryMatch(normalizedInput) {
  for (const category of CATEGORY_PRIORITY) {
    const aliases = getCategoryAliases(category);
    if (aliases.some((alias) => normalizeCategoryToken(alias) === normalizedInput)) {
      return category;
    }
  }

  return null;
}

function containsAlias(normalizedInput, normalizedAlias) {
  if (!normalizedInput || !normalizedAlias) {
    return false;
  }

  if (normalizedInput === normalizedAlias) {
    return true;
  }

  const escapedAlias = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundaryPattern = new RegExp(`(^|[\\s/])${escapedAlias}($|[\\s/])`, "i");
  return boundaryPattern.test(normalizedInput);
}

function getKeywordCategoryMatch(normalizedInput) {
  const matches = [];

  for (const category of CATEGORY_PRIORITY) {
    const aliases = getCategoryAliases(category)
      .map((alias) => normalizeCategoryToken(alias))
      .filter(Boolean)
      .sort((left, right) => right.length - left.length);
    const matchedAlias = aliases.find((alias) => containsAlias(normalizedInput, alias));
    if (matchedAlias) {
      matches.push({ category, alias: matchedAlias });
    }
  }

  if (!matches.length) {
    return null;
  }

  // Resolve multi-match conflicts by the most specific alias, then the stable category order.
  matches.sort((left, right) => {
    const aliasLengthDiff = right.alias.length - left.alias.length;
    if (aliasLengthDiff !== 0) {
      return aliasLengthDiff;
    }

    return CATEGORY_PRIORITY.indexOf(left.category) - CATEGORY_PRIORITY.indexOf(right.category);
  });

  return matches[0].category;
}

function logUnmatchedCategory(rawCategory, options = {}) {
  const rawValue = String(rawCategory || "").trim();
  if (!rawValue) {
    return;
  }

  const logger = options.logger;
  if (typeof logger?.warn === "function") {
    const source = options.source ? ` from ${options.source}` : "";
    logger.warn(`[category-normalizer] Unmatched category${source}: "${rawValue}". Defaulting to ${DEFAULT_UNIFIED_CATEGORY}.`);
  }
}

function normalizeCategory(sourceCategory, options = {}) {
  const normalizedInput = normalizeCategoryToken(sourceCategory);
  if (!normalizedInput) {
    return DEFAULT_UNIFIED_CATEGORY;
  }

  const exactMatch = getExactCategoryMatch(normalizedInput);
  if (exactMatch) {
    return exactMatch;
  }

  const keywordMatch = getKeywordCategoryMatch(normalizedInput);
  if (keywordMatch) {
    return keywordMatch;
  }

  logUnmatchedCategory(sourceCategory, options);
  return DEFAULT_UNIFIED_CATEGORY;
}

// Internal shape for scrapers. Only normalizedCategory should be persisted or sent to the frontend.
function createUnifiedNewsArticle({
  title = "",
  description = "",
  source = "",
  category = "",
  publishedAt = "",
  url = "",
  image = "",
} = {}) {
  const originalCategory = String(category || "").trim();
  const normalizedCategory = normalizeCategory(originalCategory, { source });

  return {
    title: String(title || ""),
    description: String(description || ""),
    source: String(source || ""),
    originalCategory,
    normalizedCategory,
    publishedAt: String(publishedAt || ""),
    url: String(url || ""),
    image: String(image || ""),
  };
}

function getCategoryDisplayName(category) {
  return normalizeCategory(category);
}

function getCategorySearchQuery(category) {
  const normalizedCategory = normalizeCategory(category);
  const queries = {
    "National/State": "india",
    International: "world",
    Business: "business",
    Sports: "sports",
    Entertainment: "entertainment",
  };

  return queries[normalizedCategory] || queries[DEFAULT_UNIFIED_CATEGORY];
}

module.exports = {
  CATEGORY_MAPPING,
  DEFAULT_UNIFIED_CATEGORY,
  UNIFIED_NEWS_CATEGORIES,
  createUnifiedNewsArticle,
  getCategoryAliases,
  getCategoryDisplayName,
  getCategorySearchQuery,
  normalizeCategory,
  normalizeCategoryToken,
};

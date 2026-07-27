const CategoryService = require("../services/category.service");

// Allowed categories mapped from slug to canonical name
const ALLOWED_SLUGS = new Set([
  "national",
  "international",
  "sports",
  "business",
  "madhya-pradesh",
  "entertainment"
]);

function parsePage(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

function parseLimit(value, max = 100) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, max) : 20;
}

function parseSort(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["latest", "popular", "trending"].includes(normalized) ? normalized : "latest";
}

class CategoryController {
  constructor({ dbPool }) {
    this.service = new CategoryService({ dbPool });
  }

  // GET /api/v1/news/category/:category
  getArticlesByCategory = async (req, res) => {
    try {
      const categorySlug = String(req.params.category || "").trim().toLowerCase();
      if (!ALLOWED_SLUGS.has(categorySlug)) {
        return res.status(400).json({
          success: false,
          error: "INVALID_CATEGORY",
          message: `Category '${req.params.category}' is invalid. Allowed: ${Array.from(ALLOWED_SLUGS).join(", ")}`
        });
      }

      const page = parsePage(req.query.page);
      const limit = parseLimit(req.query.limit);
      const sort = parseSort(req.query.sort);
      const date = req.query.date === "today" ? "today" : null;
      const featured = req.query.featured === "true" || req.query.featured === true;
      const search = typeof req.query.search === "string" ? req.query.search.trim() : null;

      const result = await this.service.getArticlesByCategory(categorySlug, {
        page,
        limit,
        sort,
        date,
        featured,
        search
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("[api] Category fetch failed:", error);
      return res.status(500).json({
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching category news."
      });
    }
  };

  // GET /api/v1/news/home
  getHome = async (req, res) => {
    try {
      const result = await this.service.getHomeArticles();
      return res.status(200).json(result);
    } catch (error) {
      console.error("[api] Home fetch failed:", error);
      return res.status(500).json({
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while loading the homepage sections."
      });
    }
  };

  // GET /api/v1/news/latest
  getLatest = async (req, res) => {
    try {
      const page = parsePage(req.query.page);
      const limit = parseLimit(req.query.limit);
      const result = await this.service.getLatestArticles({ page, limit });
      return res.status(200).json(result);
    } catch (error) {
      console.error("[api] Latest fetch failed:", error);
      return res.status(500).json({
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching latest news."
      });
    }
  };

  // GET /api/v1/news/breaking
  getBreaking = async (req, res) => {
    try {
      const page = parsePage(req.query.page);
      const limit = parseLimit(req.query.limit);
      const result = await this.service.getBreakingArticles({ page, limit });
      return res.status(200).json(result);
    } catch (error) {
      console.error("[api] Breaking fetch failed:", error);
      return res.status(500).json({
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching breaking news."
      });
    }
  };

  // GET /api/v1/news/trending
  getTrending = async (req, res) => {
    try {
      const page = parsePage(req.query.page);
      const limit = parseLimit(req.query.limit);
      const result = await this.service.getTrendingArticles({ page, limit });
      return res.status(200).json(result);
    } catch (error) {
      console.error("[api] Trending fetch failed:", error);
      return res.status(500).json({
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching trending news."
      });
    }
  };

  // GET /api/v1/news/search
  search = async (req, res) => {
    try {
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      if (!search) {
        return res.status(400).json({
          success: false,
          error: "MISSING_SEARCH_QUERY",
          message: "The search query parameter '?search=...' is required."
        });
      }

      const page = parsePage(req.query.page);
      const limit = parseLimit(req.query.limit);
      const sort = parseSort(req.query.sort);

      const result = await this.service.searchArticles({ search, page, limit, sort });
      return res.status(200).json(result);
    } catch (error) {
      console.error("[api] Search failed:", error);
      return res.status(500).json({
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred during search."
      });
    }
  };

  // GET /api/v1/news/article/:slug
  getArticleBySlug = async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim();
      if (!slug) {
        return res.status(400).json({
          success: false,
          error: "MISSING_SLUG",
          message: "Article slug is required."
        });
      }

      const article = await this.service.getArticleBySlug(slug);
      if (!article) {
        return res.status(404).json({
          success: false,
          error: "NOT_FOUND",
          message: `Article not found with slug: ${slug}`
        });
      }

      return res.status(200).json({
        success: true,
        article
      });
    } catch (error) {
      console.error("[api] Article fetch by slug failed:", error);
      return res.status(500).json({
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while retrieving the article."
      });
    }
  };

  // GET /api/v1/news/related/:slug
  getRelated = async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim();
      if (!slug) {
        return res.status(400).json({
          success: false,
          error: "MISSING_SLUG",
          message: "Article slug is required."
        });
      }

      const limit = parseLimit(req.query.limit, 10);
      const related = await this.service.getRelatedArticles(slug, { limit });

      return res.status(200).json({
        success: true,
        related
      });
    } catch (error) {
      console.error("[api] Related fetch failed:", error);
      return res.status(500).json({
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching related news."
      });
    }
  };
}

module.exports = CategoryController;

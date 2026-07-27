const { normalizeAiCategory } = require("../config/news-categories");

// Map URL slugs to DB category names
const SLUG_TO_CATEGORY = {
  "national": "National",
  "international": "International",
  "sports": "Sports",
  "business": "Business",
  "madhya-pradesh": "Madhya Pradesh",
  "entertainment": "Entertainment"
};

class CategoryService {
  constructor({ dbPool }) {
    this.dbPool = dbPool;
    this.memoryCache = new Map();
  }

  // Helper to normalize search and other queries safely to prevent injection
  escapeLikePattern(str) {
    return str.replace(/[%_\\]/g, '\\$&');
  }

  getLegacyCategory(aiCategory) {
    if (aiCategory === "Madhya Pradesh") return "Madhyapradesh";
    if (aiCategory === "National") return "National/State";
    return aiCategory;
  }

  // Get Redis client helper
  async getRedisClient() {
    if (global.getRedisClient) {
      return global.getRedisClient();
    }
    // Fallback: search process.env.REDIS_URL
    const REDIS_URL = process.env.REDIS_URL;
    if (!REDIS_URL) return null;

    if (!this.redisClientPromise) {
      try {
        const { createClient } = require("redis");
        const client = createClient({ url: REDIS_URL });
        client.on("error", (error) => {
          console.error("CategoryService Redis error:", error.message);
        });
        await client.connect();
        this.redisClient = client;
        this.redisClientPromise = Promise.resolve(client);
      } catch (error) {
        console.error("CategoryService Redis connection failed:", error.message);
        return null;
      }
    }
    return this.redisClient;
  }

  // In-memory cache operations
  getMemoryCache(key) {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.value;
  }

  setMemoryCache(key, value, ttlSeconds) {
    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });
  }

  // Unified caching loader
  async withCache(key, ttlSeconds, loader) {
    const memVal = this.getMemoryCache(key);
    if (memVal !== null) {
      console.log(`[cache] Memory Hit for key: ${key}`);
      return memVal;
    }

    const redis = await this.getRedisClient();
    if (redis) {
      try {
        const raw = await redis.get(key);
        if (raw) {
          console.log(`[cache] Redis Hit for key: ${key}`);
          const parsed = JSON.parse(raw);
          this.setMemoryCache(key, parsed, 5); // Cache locally for 5s
          return parsed;
        }
      } catch (err) {
        console.error(`[cache] Redis read error for ${key}:`, err.message);
      }
    }

    console.log(`[cache] Miss for key: ${key}. Loading from DB...`);
    const startTime = Date.now();
    const value = await loader();
    const duration = Date.now() - startTime;
    console.log(`[db] Query completed in ${duration}ms`);

    this.setMemoryCache(key, value, ttlSeconds);
    if (redis) {
      try {
        await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
      } catch (err) {
        console.error(`[cache] Redis write error for ${key}:`, err.message);
      }
    }

    return value;
  }

  // Clear cache
  async invalidateCache() {
    const keys = [
      "news:national",
      "news:international",
      "news:sports",
      "news:business",
      "news:madhya-pradesh",
      "news:entertainment",
      "news:homepage",
      "news:latest",
      "news:breaking",
      "news:trending"
    ];

    // Clear local memory
    for (const key of keys) {
      this.memoryCache.delete(key);
    }

    const redis = await this.getRedisClient();
    if (redis) {
      try {
        // Delete all cache keys from Redis
        for (const key of keys) {
          await redis.del(key).catch(() => {});
        }
        console.log("[cache] Redis invalidation successful.");
      } catch (err) {
        console.error("[cache] Redis invalidation failed:", err.message);
      }
    }
  }

  // Article mapping helper
  mapArticle(row) {
    return {
      id: row.id,
      title: row.ui_title || row.hindi_headline || row.english_headline || row.source_title || "No Title",
      slug: row.delivery_slug || "",
      summary: row.ui_short_100 || row.hindi_top_summary || row.english_top_summary || row.source_excerpt || "",
      image: row.ui_image_url || row.news_image_link || row.image_link || "",
      publishedAt: row.published_at || row.created_at,
      source: row.ui_source || row.news_feed_source || row.feed_source || "Unknown",
      category: row.ui_category || "National"
    };
  }

  // Build the main SQL query with joins and filters
  buildBaseQuery({ conditions = [], selectFields = "air.*, fn.image_link as news_image_link, fn.feed_source as news_feed_source, fn.title as source_title" } = {}) {
    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    return `
      SELECT ${selectFields}
      FROM ai_news_rewrites air
      INNER JOIN fetched_news fn ON fn.id = air.news_id
      ${whereClause}
    `;
  }

  // Retrieve paginated articles for a category
  async getArticlesByCategory(categorySlug, { page = 1, limit = 20, sort = "latest", date = null, search = null, featured = null }) {
    const dbCategory = SLUG_TO_CATEGORY[categorySlug.toLowerCase()];
    if (!dbCategory) {
      throw new Error(`Invalid category: ${categorySlug}`);
    }

    const cacheKey = `news:${categorySlug.toLowerCase()}:p${page}:l${limit}:s${sort}:d${date || "none"}:f${featured || "none"}:q${search || "none"}`;
    const ttl = 60; // 1 minute cache TTL for paginated results

    return this.withCache(cacheKey, ttl, async () => {
      const conditions = ["air.publication_status = 'published'"];
      const params = [];

      // Category filter (support both canonical and legacy categories)
      const legacyCategory = this.getLegacyCategory(dbCategory);
      if (legacyCategory !== dbCategory) {
        conditions.push("(air.ui_category = ? OR air.ui_category = ?)");
        params.push(dbCategory, legacyCategory);
      } else {
        conditions.push("air.ui_category = ?");
        params.push(dbCategory);
      }

      // Featured filter (if any, using ui_state or keywords as proxy, or if featured query param is true)
      if (featured === "true" || featured === true) {
        conditions.push("(air.ui_state = 'featured' OR air.ui_keywords_json LIKE ?)");
        params.push("%featured%");
      }

      // Date filtering
      if (date === "today") {
        if (this.dbPool.dialect === "postgres") {
          conditions.push("air.published_at >= CURRENT_DATE");
        } else {
          conditions.push("air.published_at >= CURDATE()");
        }
      }

      // Search keyword filter
      if (search) {
        const escaped = `%${this.escapeLikePattern(search)}%`;
        conditions.push("(air.ui_title LIKE ? OR air.hindi_headline LIKE ? OR air.english_headline LIKE ? OR air.ui_keywords_json LIKE ? OR fn.source_content LIKE ?)");
        params.push(escaped, escaped, escaped, escaped, escaped);
      }

      // Sorting
      let orderBySql = "ORDER BY air.published_at DESC, air.id DESC";
      if (sort === "popular" || sort === "trending") {
        // Left join with visitor views or count by visits
        orderBySql = `
          ORDER BY (
            SELECT COUNT(*) FROM visitor_events ve
            WHERE ve.path = CONCAT('/article/', air.delivery_slug)
               OR ve.path = CONCAT('/api/v1/news/article/', air.delivery_slug)
               OR ve.path = air.delivery_slug
          ) DESC, air.published_at DESC, air.id DESC
        `;
      }

      // Pagination setup
      const offset = (page - 1) * limit;

      // Count total query
      const countQuery = `
        SELECT COUNT(*) as total
        FROM ai_news_rewrites air
        INNER JOIN fetched_news fn ON fn.id = air.news_id
        WHERE ${conditions.join(" AND ")}
      `;
      const [countResult] = await this.dbPool.query(countQuery, params);
      const total = countResult[0]?.total || 0;

      // Data query
      const dataQuery = `
        ${this.buildBaseQuery({ conditions })}
        ${orderBySql}
        LIMIT ? OFFSET ?
      `;

      const queryParams = [...params, limit, offset];
      const [rows] = await this.dbPool.query(dataQuery, queryParams);

      const articles = rows.map(r => this.mapArticle(r));
      const hasMore = offset + articles.length < total;

      return {
        success: true,
        category: dbCategory,
        page,
        limit,
        total,
        hasMore,
        articles
      };
    });
  }

  // Get aggregated homepage segments
  async getHomeArticles() {
    const cacheKey = "news:homepage";
    const ttl = 120; // 2 minutes cache for homepage

    return this.withCache(cacheKey, ttl, async () => {
      const result = {
        success: true,
        breaking: [],
        latest: [],
        national: [],
        international: [],
        sports: [],
        business: [],
        madhyaPradesh: [],
        entertainment: []
      };

      // 1. Breaking (limit 5)
      // Note: We flag breaking news using keywords or ui_state. If none exists, we fallback to latest.
      const breakingQuery = `
        ${this.buildBaseQuery({ conditions: ["air.publication_status = 'published'", "(air.ui_state = 'breaking' OR air.ui_keywords_json LIKE '%breaking%')"] })}
        ORDER BY air.published_at DESC, air.id DESC
        LIMIT 5
      `;
      const [breakingRows] = await this.dbPool.query(breakingQuery);
      result.breaking = breakingRows.map(r => this.mapArticle(r));

      // 2. Latest (limit 10)
      const latestQuery = `
        ${this.buildBaseQuery({ conditions: ["air.publication_status = 'published'"] })}
        ORDER BY air.published_at DESC, air.id DESC
        LIMIT 10
      `;
      const [latestRows] = await this.dbPool.query(latestQuery);
      result.latest = latestRows.map(r => this.mapArticle(r));

      // Fallback for breaking if empty: use top latest as breaking
      if (result.breaking.length === 0) {
        result.breaking = result.latest.slice(0, 3);
      }

      // 3. Categories (limit 6 each)
      const categoriesToFetch = [
        { key: "national", name: "National" },
        { key: "international", name: "International" },
        { key: "sports", name: "Sports" },
        { key: "business", name: "Business" },
        { key: "madhyaPradesh", name: "Madhya Pradesh" },
        { key: "entertainment", name: "Entertainment" }
      ];

      for (const cat of categoriesToFetch) {
        const conditions = ["air.publication_status = 'published'"];
        const params = [];

        const legacy = this.getLegacyCategory(cat.name);
        if (legacy !== cat.name) {
          conditions.push("(air.ui_category = ? OR air.ui_category = ?)");
          params.push(cat.name, legacy);
        } else {
          conditions.push("air.ui_category = ?");
          params.push(cat.name);
        }

        const catQuery = `
          ${this.buildBaseQuery({ conditions })}
          ORDER BY air.published_at DESC, air.id DESC
          LIMIT 6
        `;
        const [catRows] = await this.dbPool.query(catQuery, params);
        result[cat.key] = catRows.map(r => this.mapArticle(r));
      }

      return result;
    });
  }

  // Get newest published articles
  async getLatestArticles({ page = 1, limit = 20 }) {
    const cacheKey = `news:latest:p${page}:l${limit}`;
    const ttl = 60;

    return this.withCache(cacheKey, ttl, async () => {
      const conditions = ["air.publication_status = 'published'"];
      const offset = (page - 1) * limit;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM ai_news_rewrites air
        WHERE ${conditions.join(" AND ")}
      `;
      const [countResult] = await this.dbPool.query(countQuery);
      const total = countResult[0]?.total || 0;

      const dataQuery = `
        ${this.buildBaseQuery({ conditions })}
        ORDER BY air.published_at DESC, air.id DESC
        LIMIT ? OFFSET ?
      `;
      const [rows] = await this.dbPool.query(dataQuery, [limit, offset]);
      const articles = rows.map(r => this.mapArticle(r));
      const hasMore = offset + articles.length < total;

      return {
        success: true,
        page,
        limit,
        total,
        hasMore,
        articles
      };
    });
  }

  // Get breaking news
  async getBreakingArticles({ page = 1, limit = 20 }) {
    const cacheKey = `news:breaking:p${page}:l${limit}`;
    const ttl = 60;

    return this.withCache(cacheKey, ttl, async () => {
      const conditions = ["air.publication_status = 'published'", "(air.ui_state = 'breaking' OR air.ui_keywords_json LIKE '%breaking%')"];
      const offset = (page - 1) * limit;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM ai_news_rewrites air
        WHERE ${conditions.join(" AND ")}
      `;
      const [countResult] = await this.dbPool.query(countQuery);
      const total = countResult[0]?.total || 0;

      const dataQuery = `
        ${this.buildBaseQuery({ conditions })}
        ORDER BY air.published_at DESC, air.id DESC
        LIMIT ? OFFSET ?
      `;
      const [rows] = await this.dbPool.query(dataQuery, [limit, offset]);
      
      let articles = rows.map(r => this.mapArticle(r));
      
      // Fallback: If no breaking articles exist, get latest
      if (articles.length === 0) {
        const fallbackQuery = `
          ${this.buildBaseQuery({ conditions: ["air.publication_status = 'published'"] })}
          ORDER BY air.published_at DESC, air.id DESC
          LIMIT ? OFFSET ?
        `;
        const [fallbackRows] = await this.dbPool.query(fallbackQuery, [limit, offset]);
        articles = fallbackRows.map(r => this.mapArticle(r));
      }

      const hasMore = offset + articles.length < total;

      return {
        success: true,
        page,
        limit,
        total,
        hasMore,
        articles
      };
    });
  }

  // Get trending articles ranked by views + recency
  async getTrendingArticles({ page = 1, limit = 20 }) {
    const cacheKey = `news:trending:p${page}:l${limit}`;
    const ttl = 60;

    return this.withCache(cacheKey, ttl, async () => {
      const conditions = ["air.publication_status = 'published'"];
      const offset = (page - 1) * limit;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM ai_news_rewrites air
        WHERE ${conditions.join(" AND ")}
      `;
      const [countResult] = await this.dbPool.query(countQuery);
      const total = countResult[0]?.total || 0;

      const dataQuery = `
        ${this.buildBaseQuery({ conditions })}
        ORDER BY (
          SELECT COUNT(*) FROM visitor_events ve
          WHERE ve.path = CONCAT('/article/', air.delivery_slug)
             OR ve.path = CONCAT('/api/v1/news/article/', air.delivery_slug)
             OR ve.path = air.delivery_slug
        ) DESC, air.published_at DESC, air.id DESC
        LIMIT ? OFFSET ?
      `;
      const [rows] = await this.dbPool.query(dataQuery, [limit, offset]);
      const articles = rows.map(r => this.mapArticle(r));
      const hasMore = offset + articles.length < total;

      return {
        success: true,
        page,
        limit,
        total,
        hasMore,
        articles
      };
    });
  }

  // Search articles across title, summary, content, keywords
  async searchArticles({ search = "", page = 1, limit = 20, sort = "latest" }) {
    if (!search || !search.trim()) {
      return {
        success: true,
        page,
        limit,
        total: 0,
        hasMore: false,
        articles: []
      };
    }

    const cacheKey = `news:search:q${search.trim().toLowerCase()}:p${page}:l${limit}:s${sort}`;
    const ttl = 30; // Shorter cache for search results

    return this.withCache(cacheKey, ttl, async () => {
      const conditions = ["air.publication_status = 'published'"];
      const params = [];

      const escaped = `%${this.escapeLikePattern(search.trim())}%`;
      conditions.push("(air.ui_title LIKE ? OR air.hindi_headline LIKE ? OR air.english_headline LIKE ? OR air.ui_keywords_json LIKE ? OR fn.source_content LIKE ? OR air.hindi_short_description LIKE ? OR air.english_short_description LIKE ?)");
      params.push(escaped, escaped, escaped, escaped, escaped, escaped, escaped);

      let orderBySql = "ORDER BY air.published_at DESC, air.id DESC";
      if (sort === "popular") {
        orderBySql = `
          ORDER BY (
            SELECT COUNT(*) FROM visitor_events ve
            WHERE ve.path = CONCAT('/article/', air.delivery_slug)
               OR ve.path = CONCAT('/api/v1/news/article/', air.delivery_slug)
               OR ve.path = air.delivery_slug
          ) DESC, air.published_at DESC, air.id DESC
        `;
      }

      const offset = (page - 1) * limit;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM ai_news_rewrites air
        INNER JOIN fetched_news fn ON fn.id = air.news_id
        WHERE ${conditions.join(" AND ")}
      `;
      const [countResult] = await this.dbPool.query(countQuery, params);
      const total = countResult[0]?.total || 0;

      const dataQuery = `
        ${this.buildBaseQuery({ conditions })}
        ${orderBySql}
        LIMIT ? OFFSET ?
      `;
      const [rows] = await this.dbPool.query(dataQuery, [...params, limit, offset]);
      const articles = rows.map(r => this.mapArticle(r));
      const hasMore = offset + articles.length < total;

      return {
        success: true,
        page,
        limit,
        total,
        hasMore,
        articles
      };
    });
  }

  // Get single article by slug
  async getArticleBySlug(slug) {
    if (!slug) return null;

    const query = `
      ${this.buildBaseQuery({ conditions: ["air.delivery_slug = ?", "air.publication_status = 'published'"] })}
      LIMIT 1
    `;
    const [rows] = await this.dbPool.query(query, [slug]);
    return rows[0] ? this.mapArticle(rows[0]) : null;
  }

  // Get related articles using same category / similar keywords
  async getRelatedArticles(slug, { limit = 5 }) {
    if (!slug) return [];

    const article = await this.getArticleBySlug(slug);
    if (!article) return [];

    const cacheKey = `news:related:${slug}:l${limit}`;
    const ttl = 120;

    return this.withCache(cacheKey, ttl, async () => {
      const conditions = [
        "air.publication_status = 'published'",
        "air.delivery_slug != ?"
      ];
      const params = [slug];

      // Match same category
      const dbCategory = article.category;
      const legacyCategory = this.getLegacyCategory(dbCategory);

      if (legacyCategory !== dbCategory) {
        conditions.push("(air.ui_category = ? OR air.ui_category = ?)");
        params.push(dbCategory, legacyCategory);
      } else {
        conditions.push("air.ui_category = ?");
        params.push(dbCategory);
      }

      // Fetch related from database ordered by publication date DESC
      const query = `
        ${this.buildBaseQuery({ conditions })}
        ORDER BY air.published_at DESC, air.id DESC
        LIMIT ?
      `;

      const [rows] = await this.dbPool.query(query, [...params, limit]);
      return rows.map(r => this.mapArticle(r));
    });
  }
}

module.exports = CategoryService;

const assert = require("node:assert/strict");
const { createDatabasePool } = require("../db");
const { initializeAiRewriteStorage } = require("../ai-rewrites");
const CategoryService = require("../services/category.service");
const CategoryController = require("../controllers/category.controller");

async function runTests() {
  console.log("Starting news category API tests...");

  // Initialize DB pool
  let dbPool;
  try {
    dbPool = await createDatabasePool();
    await initializeAiRewriteStorage(dbPool);
    console.log("Database pool initialized and migrations run.");
  } catch (error) {
    console.warn("Could not connect to database, switching to Mock mode:", error.message);
  }

  // 1. Mock DB Pool test (Unit tests)
  const mockDbPool = {
    dialect: "mysql",
    queriesMade: [],
    async query(sql, params = []) {
      this.queriesMade.push({ sql, params });
      // Return mock data depending on query type
      if (sql.includes("COUNT(*)")) {
        return [[{ total: 5 }]];
      }
      return [[
        {
          id: 1,
          ui_title: "Mock Title 1",
          delivery_slug: "mock-slug-1",
          ui_short_100: "Mock summary 1",
          ui_image_url: "https://example.com/image1.jpg",
          published_at: "2026-07-23T10:00:00Z",
          ui_source: "Source 1",
          ui_category: "Sports"
        }
      ]];
    }
  };

  const serviceWithMock = new CategoryService({ dbPool: mockDbPool });

  // Test category mapping validation
  console.log("Testing CategoryService mapping...");
  const sportsResult = await serviceWithMock.getArticlesByCategory("sports", { page: 1, limit: 1 });
  assert.strictEqual(sportsResult.success, true);
  assert.strictEqual(sportsResult.category, "Sports");
  assert.strictEqual(sportsResult.articles[0].title, "Mock Title 1");
  assert.strictEqual(sportsResult.articles[0].category, "Sports");

  // Verify correct SQL where clause was generated (should contain Sports or Sports legacy)
  const lastQuery = mockDbPool.queriesMade[mockDbPool.queriesMade.length - 1];
  assert.ok(lastQuery.sql.includes("air.ui_category = ?"), "SQL query must filter by ui_category");
  assert.strictEqual(lastQuery.params[0], "Sports");

  // Test invalid category in controller
  console.log("Testing CategoryController category slug validation...");
  const mockRes = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    }
  };

  const controller = new CategoryController({ dbPool: mockDbPool });
  await controller.getArticlesByCategory({ params: { category: "invalid-cat" }, query: {} }, mockRes);
  assert.strictEqual(mockRes.statusCode, 400);
  assert.strictEqual(mockRes.body.success, false);
  assert.strictEqual(mockRes.body.error, "INVALID_CATEGORY");

  // Test home sections in service
  console.log("Testing Homepage segments structure...");
  const homeResult = await serviceWithMock.getHomeArticles();
  assert.strictEqual(homeResult.success, true);
  assert.ok(Array.isArray(homeResult.breaking));
  assert.ok(Array.isArray(homeResult.latest));
  assert.ok(Array.isArray(homeResult.national));
  assert.ok(Array.isArray(homeResult.sports));

  // Test related articles exclude current article slug
  console.log("Testing Related articles query generation...");
  mockDbPool.queriesMade = [];
  await serviceWithMock.getRelatedArticles("mock-slug-1", { limit: 5 });
  const relatedQuery = mockDbPool.queriesMade.find(q => q.sql.includes("air.delivery_slug !="));
  assert.ok(relatedQuery, "Should query with exclusion of current article slug");
  assert.strictEqual(relatedQuery.params[0], "mock-slug-1");

  // Test caching logic
  console.log("Testing Cache operations...");
  let dbCallCount = 0;
  const mockLoader = async () => {
    dbCallCount++;
    return { data: "fresh" };
  };

  // First call (cache miss)
  const cachedVal1 = await serviceWithMock.withCache("test:cache-key", 10, mockLoader);
  assert.strictEqual(dbCallCount, 1);
  assert.deepEqual(cachedVal1, { data: "fresh" });

  // Second call (cache hit)
  const cachedVal2 = await serviceWithMock.withCache("test:cache-key", 10, mockLoader);
  assert.strictEqual(dbCallCount, 1); // Should still be 1 (retrieved from cache)
  assert.deepEqual(cachedVal2, { data: "fresh" });

  // Invalidate cache
  await serviceWithMock.invalidateCache();

  // 2. Live DB integration tests if connection is available
  if (dbPool) {
    console.log("Running Live DB Integration Tests...");
    const serviceWithLive = new CategoryService({ dbPool });

    // Ensure we can query home segments from DB without errors
    const liveHome = await serviceWithLive.getHomeArticles();
    assert.strictEqual(liveHome.success, true);
    console.log(`Live DB Homepage segments loaded successfully.`);

    // Query national category
    const liveCat = await serviceWithLive.getArticlesByCategory("national", { page: 1, limit: 5 });
    assert.strictEqual(liveCat.success, true);
    assert.strictEqual(liveCat.category, "National");
    console.log(`Live DB National category loaded successfully. Articles found: ${liveCat.articles.length}`);
  }

  console.log("All news category API tests passed successfully!");
  if (dbPool) {
    await dbPool.end();
  }
}

runTests().catch(error => {
  console.error("Test suite failed:", error);
  process.exit(1);
});

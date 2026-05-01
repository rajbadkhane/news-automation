const express = require("express");
const {
  crawlAllDistricts,
  crawlDistrict,
  crawlLatest,
  getDistrictConfigBySlug,
} = require("../services/mpinfo-scraper.service");

function isTruthy(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return ["true", "1", "yes", "y"].includes(String(value).toLowerCase());
}

function normalizeLimit(value, fallback = 20, max = 200) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function createMpInfoRoutes({
  saveArticle = null,
  rewriteArticle = null,
} = {}) {
  const router = express.Router();

  async function maybeSaveAndRewrite(articles, req) {
    const save = isTruthy(req.query.save, false);
    const rewrite = isTruthy(req.query.rewrite, false);
    const saved = [];
    const rewritten = [];

    if (!save || typeof saveArticle !== "function") {
      return { saved, rewritten };
    }

    for (const article of articles) {
      const savedRecord = await saveArticle(article);
      saved.push({
        articleId: article.articleId,
        savedId: savedRecord?.id || null,
        status: savedRecord?.status || "Skipped",
        message: savedRecord?.message || null,
      });

      if (rewrite && savedRecord?.record && typeof rewriteArticle === "function") {
        try {
          const rewriteRecord = await rewriteArticle(savedRecord.record, article);
          rewritten.push({
            articleId: article.articleId,
            newsId: savedRecord.record.id,
            rewriteId: rewriteRecord.id,
            status: "Success",
            title: rewriteRecord.ui_hindi?.title || savedRecord.record.title,
            words_100: rewriteRecord.ui_hindi?.short_100 || "",
            words_300: rewriteRecord.ui_hindi?.medium_300 || "",
            words_600: rewriteRecord.ui_hindi?.long_500 || "",
          });
        } catch (error) {
          rewritten.push({
            articleId: article.articleId,
            newsId: savedRecord.record.id,
            status: "Error",
            message: error.message,
          });
        }
      }
    }

    return { saved, rewritten };
  }

  router.get("/fetch-all", async (req, res) => {
    try {
      const limit = normalizeLimit(req.query.limit, 5, 50);
      const withContent = isTruthy(req.query.withContent, true);
      const saveSnapshots = isTruthy(req.query.saveSnapshots, false);
      const result = await crawlAllDistricts({ limit, withContent, saveSnapshots });
      const persistence = await maybeSaveAndRewrite(result.articles, req);

      return res.json({
        ...result,
        saved: persistence.saved,
        rewritten: persistence.rewritten,
      });
    } catch (error) {
      return res.status(500).json({
        status: "Error",
        message: error.message,
      });
    }
  });

  router.get("/fetch-district/:district", async (req, res) => {
    try {
      const districtConfig = getDistrictConfigBySlug(req.params.district);
      if (!districtConfig) {
        return res.status(404).json({
          status: "Error",
          message: `Unknown MP Info district: ${req.params.district}`,
        });
      }

      const limit = normalizeLimit(req.query.limit, 20, 100);
      const withContent = isTruthy(req.query.withContent, true);
      const result = await crawlDistrict(districtConfig, { limit, withContent });
      const persistence = await maybeSaveAndRewrite(result.articles, req);

      return res.json({
        status: result.status,
        source: "MP Info",
        result,
        articles: result.articles,
        saved: persistence.saved,
        rewritten: persistence.rewritten,
      });
    } catch (error) {
      return res.status(500).json({
        status: "Error",
        message: error.message,
      });
    }
  });

  router.get("/fetch-latest", async (req, res) => {
    try {
      const limit = normalizeLimit(req.query.limit, 20, 100);
      const withContent = isTruthy(req.query.withContent, true);
      const districtScanLimit = normalizeLimit(req.query.districtScanLimit, 12, 55);
      const result = await crawlLatest({ limit, withContent, districtScanLimit });
      const persistence = await maybeSaveAndRewrite(result.articles, req);

      return res.json({
        ...result,
        saved: persistence.saved,
        rewritten: persistence.rewritten,
      });
    } catch (error) {
      return res.status(500).json({
        status: "Error",
        message: error.message,
      });
    }
  });

  return router;
}

module.exports = {
  createMpInfoRoutes,
};

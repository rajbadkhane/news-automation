const express = require("express");
const CategoryController = require("../controllers/category.controller");

// Middleware to check if the client has at least one of the allowed scopes
function requireAnyApiScope(...scopes) {
  return (req, res, next) => {
    const auth = req.apiAuth;
    if (!auth) {
      return res.status(401).json({
        success: false,
        error: "UNAUTHORIZED",
        message: "API authentication context is missing."
      });
    }

    if (auth.type === "master" || auth.type === "legacy") {
      return next();
    }

    const hasScope = scopes.some(scope => auth.scopes && auth.scopes.includes(scope));
    if (!hasScope) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: `This client does not have any of the required scopes: ${scopes.join(", ")}`
      });
    }

    return next();
  };
}

function createCategoryRoutes({ dbPool }) {
  const router = express.Router();
  const controller = new CategoryController({ dbPool });
  const checkScope = requireAnyApiScope("news:read", "delivery:read");

  router.get("/home", checkScope, controller.getHome);
  router.get("/latest", checkScope, controller.getLatest);
  router.get("/breaking", checkScope, controller.getBreaking);
  router.get("/trending", checkScope, controller.getTrending);
  router.get("/search", checkScope, controller.search);
  router.get("/article/:slug", checkScope, controller.getArticleBySlug);
  router.get("/related/:slug", checkScope, controller.getRelated);
  router.get("/category/:category", checkScope, controller.getArticlesByCategory);

  return router;
}

module.exports = {
  createCategoryRoutes,
};

/*
Optional MongoDB/Mongoose model. Install mongoose and enable this only when
MongoDB persistence is needed.

const mongoose = require("mongoose");

const MpInfoArticleSchema = new mongoose.Schema({
  articleId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  subtitle: { type: String, default: null },
  publishDate: { type: String, default: null },
  district: { type: String, index: true },
  division: { type: String, index: true },
  source: { type: String, default: "MP Info" },
  sourceUrl: { type: String, required: true, unique: true },
  subdomain: String,
  imageUrl: String,
  fallbackImageUrl: String,
  contentHtml: String,
  contentText: String,
  tags: [String],
  language: { type: String, default: "hi" },
  fetchedAt: String,
}, { timestamps: true });

module.exports = mongoose.model("MpInfoArticle", MpInfoArticleSchema);
*/

module.exports = {};

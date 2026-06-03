const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "..", ".env");

const updates = {
  SCHEDULER_ENABLED: "true",
  AI_SCHEDULER_ENABLED: "true",
  SCHEDULER_GOOGLE_RSS_ENABLED: "true",
  SCHEDULER_ARTICLES_PER_CATEGORY_RUN: "10",
  SCHEDULER_PRIMARY_SOURCE_LIMIT: "8",
  AI_REWRITE_AUTO_PUBLISH: "true",
  AI_REWRITES_PER_CATEGORY_RUN: "6",
  AI_REWRITE_CANDIDATE_LIMIT: "30",
  MPINFO_DISTRICT_SCHEDULER_ENABLED: "true",
  MPINFO_DISTRICT_BROWSER_ENABLED: "true",
  MPINFO_DISTRICT_CATEGORY: "Madhyapradesh",
  MPINFO_DISTRICT_SCHEDULER_LIMIT: "24",
  MPINFO_DISTRICT_SCHEDULER_SCAN_LIMIT: "12",
  MPINFO_DISTRICT_SCHEDULER_INTERVAL_MS: "1800000",
  MPINFO_DISTRICT_SCHEDULER_TIMEOUT_MS: "2700000",
  MPINFO_DISTRICT_MAX_AGE_HOURS: "48",
  MPINFO_DISTRICT_SCHEDULER_REWRITE: "true",
  MPINFO_DISTRICT_SCHEDULER_STARTUP_RUN: "false",
  MPINFO_DISTRICT_CONCURRENCY: "2",
  MPINFO_ARTICLE_CONCURRENCY: "1",
};

if (!fs.existsSync(envPath)) {
  throw new Error(`Missing .env file at ${envPath}`);
}

const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
const nextLines = lines.filter((line) => {
  const match = line.match(/^([A-Z0-9_]+)=/);
  return !match || !(match[1] in updates);
});

nextLines.push("");
nextLines.push("# NeevCloud scheduler tuning");
for (const [key, value] of Object.entries(updates)) {
  nextLines.push(`${key}=${value}`);
}

fs.writeFileSync(envPath, nextLines.join("\n").replace(/\n{3,}/g, "\n\n"), "utf8");

console.log("NeevCloud scheduler env updated:");
for (const [key, value] of Object.entries(updates)) {
  console.log(`${key}=${value}`);
}

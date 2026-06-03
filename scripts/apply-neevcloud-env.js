const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "..", ".env");

const updates = {
  SCHEDULER_ARTICLES_PER_CATEGORY_RUN: "10",
  SCHEDULER_PRIMARY_SOURCE_LIMIT: "8",
  AI_REWRITES_PER_CATEGORY_RUN: "6",
  AI_REWRITE_CANDIDATE_LIMIT: "30",
  MPINFO_DISTRICT_SCHEDULER_LIMIT: "24",
  MPINFO_DISTRICT_SCHEDULER_SCAN_LIMIT: "12",
  MPINFO_DISTRICT_SCHEDULER_INTERVAL_MS: "1800000",
  MPINFO_DISTRICT_SCHEDULER_TIMEOUT_MS: "2700000",
  MPINFO_DISTRICT_MAX_AGE_HOURS: "48",
  MPINFO_DISTRICT_CONCURRENCY: "2",
  MPINFO_ARTICLE_CONCURRENCY: "1",
};

if (!fs.existsSync(envPath)) {
  throw new Error(`Missing .env file at ${envPath}`);
}

const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
const seen = new Set();
const nextLines = lines.map((line) => {
  const match = line.match(/^([A-Z0-9_]+)=/);
  if (!match || !(match[1] in updates)) {
    return line;
  }

  seen.add(match[1]);
  return `${match[1]}=${updates[match[1]]}`;
});

for (const [key, value] of Object.entries(updates)) {
  if (!seen.has(key)) {
    nextLines.push(`${key}=${value}`);
  }
}

fs.writeFileSync(envPath, nextLines.join("\n").replace(/\n{3,}/g, "\n\n"), "utf8");

console.log("NeevCloud scheduler env updated:");
for (const [key, value] of Object.entries(updates)) {
  console.log(`${key}=${value}`);
}

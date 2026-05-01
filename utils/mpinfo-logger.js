const fs = require("fs");
const path = require("path");

const logDir = path.resolve(__dirname, "..", "logs");
const logFile = path.join(logDir, "mpinfo-scraper.log");

function writeMpInfoLog(level, message, details = {}) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      logFile,
      `${JSON.stringify({
        at: new Date().toISOString(),
        level,
        message,
        ...details,
      })}\n`,
      "utf8"
    );
  } catch {
    // Logging must never break scraping.
  }
}

module.exports = {
  writeMpInfoLog,
};

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const envPath = path.resolve(__dirname, "..", ".env");

function readEnvFile() {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing .env file at ${envPath}`);
  }

  return fs.readFileSync(envPath, "utf8");
}

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });
}

function maskKey(value) {
  const key = String(value || "").trim();
  if (key.length <= 10) {
    return key ? "********" : "";
  }

  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function updateEnv(content, updates) {
  const lines = content.split(/\r?\n/);
  const nextLines = lines.filter((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    return !match || !(match[1] in updates);
  });

  nextLines.push("");
  nextLines.push("# Gemini AI key updated by scripts/set-gemini-env.js");
  for (const [key, value] of Object.entries(updates)) {
    nextLines.push(`${key}=${value}`);
  }

  return nextLines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "") + "\n";
}

async function main() {
  const apiKeyArg = process.argv[2] || process.env.NEW_GEMINI_API_KEY || "";
  const modelArg = process.argv[3] || process.env.NEW_GEMINI_MODEL || "";
  const apiKey = String(apiKeyArg || await ask("Paste Gemini API key and press Enter: ")).trim();
  const model = String(modelArg || await ask("Gemini model [gemini-2.5-flash-lite]: ")).trim() || "gemini-2.5-flash-lite";

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required.");
  }

  if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(apiKey)) {
    console.warn("Warning: this does not look like a usual Gemini API key, but it will still be saved.");
  }

  const current = readEnvFile();
  const backupPath = `${envPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.writeFileSync(backupPath, current, "utf8");

  const next = updateEnv(current, {
    GEMINI_API_KEY: apiKey,
    GEMINI_MODEL: model,
    AI_SCHEDULER_ENABLED: "true",
    AI_REWRITE_AUTO_PUBLISH: "true",
  });
  fs.writeFileSync(envPath, next, "utf8");

  console.log("Gemini env updated.");
  console.log(`Saved GEMINI_API_KEY=${maskKey(apiKey)}`);
  console.log(`Saved GEMINI_MODEL=${model}`);
  console.log(`Backup: ${backupPath}`);
  console.log("");
  console.log("Next commands:");
  console.log("pm2 restart gautam_news_bot --update-env");
  console.log("node scripts/test-gemini-key.js");
  console.log("curl -X POST http://localhost:3000/ai/cron/run-now");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

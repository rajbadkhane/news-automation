const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const envPath = path.resolve(__dirname, ".env");
const defaultModel = "gemini-flash-lite-latest";

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });
}

function updateEnv(apiKey) {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing .env file at ${envPath}`);
  }

  const updates = {
    GEMINI_API_KEY: apiKey,
    GEMINI_MODEL: defaultModel,
    AI_SCHEDULER_ENABLED: "true",
    AI_REWRITE_AUTO_PUBLISH: "true",
  };
  const current = fs.readFileSync(envPath, "utf8");
  const backupPath = `${envPath}.bak-${Date.now()}`;
  fs.writeFileSync(backupPath, current, "utf8");

  const lines = current.split(/\r?\n/).filter((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    return !match || !(match[1] in updates);
  });

  lines.push("");
  lines.push("# Gemini AI key updated by node g");
  for (const [key, value] of Object.entries(updates)) {
    lines.push(`${key}=${value}`);
  }

  fs.writeFileSync(envPath, `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`, "utf8");
  console.log(`Backup saved: ${backupPath}`);
}

function run(command, args) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
}

async function main() {
  const apiKey = await ask("Gemini key: ");
  if (!apiKey) {
    throw new Error("Gemini key required.");
  }

  updateEnv(apiKey);
  run("pm2", ["restart", "gautam_news_bot", "--update-env"]);
  run("node", ["scripts/test-gemini-key.js"]);

  console.log("\n$ POST /ai/cron/run-now");
  const response = await fetch("http://localhost:3000/ai/cron/run-now", { method: "POST" });
  const text = await response.text();
  console.log(text.slice(0, 2000));
  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

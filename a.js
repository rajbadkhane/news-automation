const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, ".env");

function loadEnv() {
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

function run(command, args) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
}

async function postAiCron() {
  loadEnv();
  const apiKey = String(process.env.MASTER_API_KEY || process.env.API_KEYS?.split(",")?.[0] || "").trim();
  const url = apiKey
    ? "http://localhost:3000/api/v1/ai/cron/run-now"
    : "http://localhost:3000/ai/cron/run-now";
  const headers = apiKey
    ? { "x-api-key": apiKey, Authorization: `Bearer ${apiKey}` }
    : {};

  for (let attempt = 1; attempt <= 12; attempt += 1) {
    console.log(`\n$ POST ${new URL(url).pathname} (attempt ${attempt}/12)`);
    const response = await fetch(url, { method: "POST", headers });
    const text = await response.text();
    console.log(text.slice(0, 4000));

    if (response.ok) {
      return;
    }

    const busy = response.status === 409 && /AI_CRON_BUSY|ingestion cron|already running|try again/i.test(text);
    if (!busy || attempt === 12) {
      throw new Error(`AI cron failed with HTTP ${response.status}`);
    }

    console.log("\nIngestion is busy. Waiting 60 seconds before retry...");
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
}

async function main() {
  run("node", ["scripts/test-gemini-key.js"]);
  await postAiCron();
  console.log("\nDone. Check news table after 1-2 minutes.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

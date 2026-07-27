const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "..", ".env");

function loadEnv() {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing .env file at ${envPath}`);
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) {
      continue;
    }

    if (!process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

function maskKey(value) {
  const key = String(value || "").trim();
  if (key.length <= 10) {
    return key ? "********" : "";
  }

  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

async function main() {
  loadEnv();
  const apiKey = String(process.env.DEEPSEEK_API_KEY || "").trim();
  const model = String(process.env.DEEPSEEK_MODEL || "deepseek-v4-flash").trim();
  const apiUrl = String(process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/chat/completions").trim();

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is missing in .env.");
  }

  console.log(`Testing DeepSeek key ${maskKey(apiKey)} with model ${model}...`);
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: "Reply with exactly: OK",
        },
      ],
      temperature: 0,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`DeepSeek test failed: HTTP ${response.status}`);
    console.error(payload?.error?.message || JSON.stringify(payload));
    process.exit(2);
  }

  const text = String(payload?.choices?.[0]?.message?.content || "").trim();
  console.log(`DeepSeek test success: ${text || "response received"}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

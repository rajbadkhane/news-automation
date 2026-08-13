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
  const freeKey = String(process.env.GEMINI_FREE_API_KEY || "").trim();
  const paidKey = String(process.env.GEMINI_PAID_API_KEY || process.env.GEMINI_API_KEY || "").trim();
  const apiKeys = [
    freeKey ? { label: "free", value: freeKey } : null,
    paidKey && paidKey !== freeKey ? { label: "paid", value: paidKey } : null,
  ].filter(Boolean);
  const model = String(process.env.GEMINI_MODEL || "gemini-flash-lite-latest").trim();
  const apiUrl = String(process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions").trim();

  if (!apiKeys.length) {
    throw new Error("GEMINI_API_KEY is missing in .env.");
  }

  for (const apiKey of apiKeys) {
    console.log(`Testing Gemini ${apiKey.label} key ${maskKey(apiKey.value)} with model ${model}...`);
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.value}`,
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
      console.error(`Gemini ${apiKey.label} key test failed: HTTP ${response.status}`);
      console.error(payload?.error?.message || JSON.stringify(payload));
      continue;
    }

    const text = String(payload?.choices?.[0]?.message?.content || "").trim();
    console.log(`Gemini ${apiKey.label} key test success: ${text || "response received"}`);
    return;
  }

  process.exit(2);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

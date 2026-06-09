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
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  const model = String(process.env.GEMINI_MODEL || "gemini-2.5-flash-lite").trim();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing in .env.");
  }

  console.log(`Testing Gemini key ${maskKey(apiKey)} with model ${model}...`);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: "Reply with exactly: OK" }],
          },
        ],
        generationConfig: {
          temperature: 0,
        },
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`Gemini test failed: HTTP ${response.status}`);
    console.error(payload?.error?.message || JSON.stringify(payload));
    process.exit(2);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  console.log(`Gemini test success: ${text || "response received"}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

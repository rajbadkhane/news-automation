const { spawnSync } = require("child_process");

function run(command, args) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
}

async function postAiCron() {
  console.log("\n$ POST /ai/cron/run-now");
  const response = await fetch("http://localhost:3000/ai/cron/run-now", { method: "POST" });
  const text = await response.text();
  console.log(text.slice(0, 4000));
  if (!response.ok) {
    throw new Error(`AI cron failed with HTTP ${response.status}`);
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

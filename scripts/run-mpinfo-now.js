const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 45 * 60 * 1000);

async function main() {
  const url = "http://127.0.0.1:3000/api/mpinfo/fetch-latest?limit=24&districtScanLimit=12&save=true&rewrite=true";
  const response = await fetch(url, {
    signal: controller.signal,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  const saved = Array.isArray(payload.saved) ? payload.saved : [];
  const rewritten = Array.isArray(payload.rewritten) ? payload.rewritten : [];
  console.log("MPInfo district run completed");
  console.log(`status=${payload.status || "Success"}`);
  console.log(`districts=${payload.districtCount || 0}`);
  console.log(`fetched=${payload.fetchedCount || 0}`);
  console.log(`failed_districts=${payload.failedDistrictCount || 0}`);
  console.log(`saved=${saved.filter((item) => item.status === "Success").length}`);
  console.log(`existing=${saved.filter((item) => item.status === "Existing").length}`);
  console.log(`rewritten=${rewritten.filter((item) => item.status === "Success").length}`);
  console.log(`rewrite_errors=${rewritten.filter((item) => item.status === "Error").length}`);
}

main()
  .catch((error) => {
    console.error(error.message || String(error));
    process.exit(1);
  })
  .finally(() => {
    clearTimeout(timeout);
  });

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { chromium } = require("playwright");
const { getMpInfoDistricts } = require("../config/mpinfo-districts");
const {
  cleanHindiText,
  cleanHtml,
  createArticleHash,
  detectDistrictFromHostname,
  extractNewsId,
  normalizePublishDate,
  normalizeUrl,
  resolveImageUrl,
  uniqueBy,
} = require("../utils/mpinfo-utils");
const { writeMpInfoLog } = require("../utils/mpinfo-logger");

const DEFAULT_USER_AGENT =
  process.env.MPINFO_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36";
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.MPINFO_TIMEOUT_MS || "30000", 10);
const DEFAULT_DISTRICT_CONCURRENCY = Math.max(1, Number.parseInt(process.env.MPINFO_DISTRICT_CONCURRENCY || "1", 10));
const DEFAULT_ARTICLE_CONCURRENCY = Math.max(1, Number.parseInt(process.env.MPINFO_ARTICLE_CONCURRENCY || "1", 10));
const DEBUG_SNAPSHOT_DIR = path.resolve(__dirname, "..", "logs", "mpinfo-snapshots");

const articleLinkPatterns = [
  /\/Home\/TodaysNews/i,
  /\/TodaysNews/i,
  /\/SearchNews/i,
  /newsid=/i,
  /LocID=/i,
];

const listingSelectors = [
  "a[href*='TodaysNews']",
  "a[href*='SearchNews']",
  "a[href*='newsid=']",
  ".today-news a",
  ".TodaysNews a",
  ".news a",
  ".latest-news a",
  ".card a",
  "marquee a",
  "table a",
];

async function withConcurrency(items, limit, worker) {
  const results = [];
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
  return results;
}

async function createPlaywrightBrowser() {
  const chromeCandidates = [
    process.env.BROWSER_EXECUTABLE_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    (() => {
      try {
        return puppeteer.executablePath();
      } catch {
        return null;
      }
    })(),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  ].filter(Boolean);
  const executablePath = chromeCandidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });

  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
}

async function newPage(browser) {
  const page = await browser.newPage({
    userAgent: DEFAULT_USER_AGENT,
    viewport: { width: 1366, height: 900 },
    locale: "hi-IN",
  });
  page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS);
  page.setDefaultTimeout(12_000);
  return page;
}

async function gotoWithRetry(page, url, attempts = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT_MS,
      });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(600);
      return response;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(750 * (attempt + 1)).catch(() => {});
    }
  }

  throw lastError || new Error(`Unable to load ${url}`);
}

function isArticleUrl(url) {
  return articleLinkPatterns.some((pattern) => pattern.test(String(url || "")));
}

function getHeadlineFromUrlHash(sourceUrl) {
  try {
    const hash = new URL(sourceUrl).hash;
    if (!hash) {
      return "";
    }

    const decoded = decodeURIComponent(hash.slice(1).replace(/\+/g, " "));
    return cleanHindiText(decoded.replace(/-².*$/i, "").replace(/-\d+$/i, ""));
  } catch {
    return "";
  }
}

function getDistrictConfigBySlug(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  return getMpInfoDistricts().find((item) =>
    item.slug === normalized ||
    item.district.toLowerCase().replace(/\s+/g, "") === normalized ||
    item.subdomain.toLowerCase() === normalized
  );
}

async function discoverDistrictsFromMainSite(page) {
  try {
    await gotoWithRetry(page, "https://mpinfo.org/");
    const links = await page.$$eval("a[href]", (anchors) =>
      anchors.map((anchor) => ({
        text: anchor.innerText || anchor.textContent || "",
        href: anchor.href || anchor.getAttribute("href") || "",
      }))
    );

    return links
      .map((item) => item.href)
      .filter((href) => /^https:\/\/[a-z0-9-]+\.mpinfo\.org\/?$/i.test(href))
      .map((href) => {
        const parsed = new URL(href);
        return {
          district: parsed.hostname.split(".")[0],
          url: href,
          division: "Unknown",
          slug: parsed.hostname.split(".")[0],
          subdomain: parsed.hostname,
        };
      });
  } catch (error) {
    writeMpInfoLog("warn", "Main site district discovery failed", { error: error.message });
    return [];
  }
}

async function getDistrictCatalog({ discover = true } = {}) {
  const hardcoded = getMpInfoDistricts();
  if (!discover) {
    return hardcoded;
  }

  const browser = await createPlaywrightBrowser();
  try {
    const page = await newPage(browser);
    const discovered = await discoverDistrictsFromMainSite(page);
    const merged = [...hardcoded, ...discovered];
    return uniqueBy(merged, (item) => item.subdomain || item.url).map((district) => {
      const known = hardcoded.find((item) => item.subdomain === district.subdomain);
      return known || district;
    });
  } finally {
    await browser.close();
  }
}

async function extractListingImages(page) {
  return page.$$eval("a[href] img", (images) =>
    images.map((img) => {
      const anchor = img.closest("a");
      return {
        link: anchor?.href || anchor?.getAttribute("href") || "",
        src: img.currentSrc || img.src || img.getAttribute("data-src") || img.getAttribute("src") || "",
      };
    })
  ).catch(() => []);
}

async function extractArticleLinksFromPage(page, districtConfig, limit) {
  const baseUrl = districtConfig.url;
  const [selectorLinks, allLinks, listingImages] = await Promise.all([
    page.evaluate((selectors) => {
      const output = [];
      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((anchor) => {
          output.push({
            href: anchor.href || anchor.getAttribute("href") || "",
            text: anchor.innerText || anchor.textContent || "",
          });
        });
      }
      return output;
    }, listingSelectors).catch(() => []),
    page.$$eval("a[href]", (anchors) => anchors.map((anchor) => ({
      href: anchor.href || anchor.getAttribute("href") || "",
      text: anchor.innerText || anchor.textContent || "",
    }))).catch(() => []),
    extractListingImages(page),
  ]);
  const imageByLink = new Map();

  for (const item of listingImages) {
    const link = normalizeUrl(item.link, baseUrl);
    const image = resolveImageUrl(item.src, baseUrl);
    if (link && image && !imageByLink.has(link)) {
      imageByLink.set(link, image);
    }
  }

  const candidates = [...selectorLinks, ...allLinks]
    .map((item) => ({
      url: normalizeUrl(item.href, baseUrl),
      titleHint: cleanHindiText(item.text),
    }))
    .filter((item) => item.url && isArticleUrl(item.url))
    .filter((item) => item.url.includes("mpinfo.org"));

  const uniqueCandidates = uniqueBy(candidates, (item) => item.url);
  const hasAnchoredArticles = uniqueCandidates.some((item) => {
    try {
      return Boolean(new URL(item.url).hash);
    } catch {
      return false;
    }
  });
  const filteredCandidates = hasAnchoredArticles
    ? uniqueCandidates.filter((item) => {
        try {
          const parsed = new URL(item.url);
          return Boolean(parsed.hash) || !/TodaysNews\.aspx$/i.test(parsed.pathname);
        } catch {
          return true;
        }
      })
    : uniqueCandidates;

  return filteredCandidates
    .slice(0, Math.max(limit * 4, limit))
    .map((item) => ({
      ...item,
      listingImageUrl: imageByLink.get(item.url) || null,
    }));
}

async function fetchDistrictArticleLinks(page, districtConfig, limit) {
  const urlsToTry = [
    districtConfig.url,
    normalizeUrl("/Home/TodaysNews", districtConfig.url),
    normalizeUrl("/Home/TodaysNews?LocID=32", districtConfig.url),
  ].filter(Boolean);
  const allLinks = [];

  for (const url of urlsToTry) {
    try {
      await gotoWithRetry(page, url, 1);
      const links = await extractArticleLinksFromPage(page, districtConfig, limit);
      allLinks.push(...links);
      if (allLinks.length >= limit) {
        break;
      }
    } catch (error) {
      writeMpInfoLog("warn", "District listing failed", {
        district: districtConfig.district,
        url,
        error: error.message,
      });
    }
  }

  return uniqueBy(allLinks, (item) => item.url).slice(0, limit);
}

function scoreImageCandidate(candidate) {
  if (!candidate?.src) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  score += Math.min(candidate.width || 0, 2000);
  score += Math.min(candidate.height || 0, 1400);

  const normalized = `${candidate.src} ${candidate.alt || ""} ${candidate.className || ""}`.toLowerCase();
  if (/tn-250921125347\.jpg/.test(normalized)) {
    return Number.NEGATIVE_INFINITY;
  }

  if (/newsimages|mpinfonew\/newsimages/.test(normalized)) {
    score += 5000;
  }
  if (/news|article|photo|image|uploads|mpinfonew|todaysnews/.test(normalized)) {
    score += 1000;
  }
  if (/logo|icon|sprite|social|share|banner|placeholder|default|facebook|twitter|youtube|whatsapp|vaccination|mahaabhiyan|abhiyan/.test(normalized)) {
    score -= 3000;
  }
  if ((candidate.width && candidate.width < 180) || (candidate.height && candidate.height < 100)) {
    score -= 1500;
  }

  return score;
}

async function extractImageData(page, sourceUrl, listingImageUrl) {
  return page.evaluate(() => {
    const meta = (selector) => document.querySelector(selector)?.content || "";
    const link = (selector) => document.querySelector(selector)?.href || "";
    const jsonLdImages = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try {
        const parsed = JSON.parse(script.textContent || "{}");
        const nodes = Array.isArray(parsed) ? parsed : [parsed];
        nodes.forEach((node) => {
          const image = node.image;
          if (typeof image === "string") jsonLdImages.push(image);
          if (Array.isArray(image)) image.forEach((item) => jsonLdImages.push(typeof item === "string" ? item : item?.url));
          if (image?.url) jsonLdImages.push(image.url);
        });
      } catch {
        // Ignore invalid structured data.
      }
    });

    const articleRoot = document.querySelector("article, main, .news-details, .NewsDetails, .content, .body, #content") || document.body;
    const imageCandidates = Array.from(articleRoot.querySelectorAll("img"))
      .map((img) => ({
        src: img.currentSrc || img.src || img.getAttribute("data-src") || img.getAttribute("src") || "",
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
        alt: img.alt || "",
        className: img.className || "",
      }));

    return {
      ogImage: meta('meta[property="og:image"], meta[property="og:image:secure_url"]'),
      twitterImage: meta('meta[name="twitter:image"], meta[name="twitter:image:src"]'),
      linkImage: link('link[rel="image_src"]'),
      jsonLdImages,
      imageCandidates,
    };
  }).then((data) => {
    const articleImages = data.imageCandidates
      .map((candidate) => ({
        ...candidate,
        src: resolveImageUrl(candidate.src, sourceUrl),
        score: scoreImageCandidate(candidate),
      }))
      .filter((candidate) => candidate.src && Number.isFinite(candidate.score))
      .sort((left, right) => right.score - left.score);

    const priorityImages = [
      articleImages[0]?.src,
      data.ogImage,
      data.twitterImage,
      data.jsonLdImages?.[0],
      data.linkImage,
      listingImageUrl,
    ]
      .map((image) => resolveImageUrl(image, sourceUrl))
      .filter(Boolean);

    const uniqueImages = uniqueBy(priorityImages.map((url) => ({ url })), (item) => item.url).map((item) => item.url);
    return {
      imageUrl: uniqueImages[0] || null,
      fallbackImageUrl: uniqueImages.find((url) => url !== uniqueImages[0]) || null,
    };
  });
}

async function extractArticleBody(page) {
  return page.evaluate(() => {
    const junkSelectors = [
      "nav", "footer", "header", "script", "style", "noscript", "iframe",
      ".menu", ".navbar", ".footer", ".header", ".social", ".share", ".related", ".breadcrumb",
      "[class*='sidebar']", "[class*='advert']", "[id*='advert']",
    ];
    const clone = document.body.cloneNode(true);
    junkSelectors.forEach((selector) => clone.querySelectorAll(selector).forEach((node) => node.remove()));

    const candidates = [
      ...clone.querySelectorAll("article, main, .news-details, .NewsDetails, .content, .body, .container, table"),
    ].map((node) => ({
      html: node.innerHTML || "",
      text: node.innerText || node.textContent || "",
    }));

    candidates.sort((left, right) => (right.text || "").length - (left.text || "").length);
    const best = candidates[0] || { html: clone.innerHTML || "", text: clone.innerText || "" };
    return best;
  });
}

async function extractArticle(page, districtConfig, linkInfo) {
  const sourceUrl = linkInfo.url;
  await gotoWithRetry(page, sourceUrl, 2);

  const metadata = await page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.innerText || document.querySelector(selector)?.textContent || "";
    const meta = (selector) => document.querySelector(selector)?.content || "";
    const title =
      text("h1") ||
      text(".news-title") ||
      text(".NewsTitle") ||
      meta('meta[property="og:title"]') ||
      document.title ||
      "";
    const subtitle =
      text("h2") ||
      text(".subtitle") ||
      text(".sub-title") ||
      meta('meta[name="description"]') ||
      "";
    const publishDate =
      text("time") ||
      document.querySelector("time")?.getAttribute("datetime") ||
      text(".date") ||
      text(".publish-date") ||
      text("[class*='date']") ||
      "";
    const tags = Array.from(document.querySelectorAll("meta[name='keywords'], meta[property='article:tag']"))
      .flatMap((node) => String(node.content || "").split(","))
      .map((item) => item.trim())
      .filter(Boolean);

    return { title, subtitle, publishDate, tags };
  });
  const body = await extractArticleBody(page);
  const imageData = await extractImageData(page, sourceUrl, linkInfo.listingImageUrl);
  const hashTitle = getHeadlineFromUrlHash(sourceUrl);
  const title = cleanHindiText(hashTitle || linkInfo.titleHint || metadata.title || "MP Info News");
  const subtitle = cleanHindiText(metadata.subtitle) || null;
  const contentHtml = cleanHtml(body.html);
  const contentText = cleanHindiText(body.text);
  const newsId = extractNewsId(sourceUrl);
  const publishDate = normalizePublishDate(metadata.publishDate, sourceUrl);
  const articleId = newsId || createArticleHash({
    title,
    publishDate,
    district: districtConfig.district,
    contentText,
    sourceUrl,
  });

  return {
    articleId,
    title,
    subtitle,
    publishDate,
    district: districtConfig.district || detectDistrictFromHostname(new URL(sourceUrl).hostname),
    division: districtConfig.division || "Unknown",
    source: "MP Info",
    sourceUrl,
    subdomain: districtConfig.subdomain,
    imageUrl: imageData.imageUrl,
    fallbackImageUrl: imageData.fallbackImageUrl,
    contentHtml,
    contentText,
    tags: (metadata.tags || []).map(cleanHindiText).filter(Boolean).slice(0, 10),
    language: "hi",
    fetchedAt: new Date().toISOString(),
  };
}

async function crawlDistrict(districtConfig, options = {}) {
  const limit = Math.max(1, Number.parseInt(options.limit || 10, 10));
  const withContent = options.withContent !== false;
  const browser = options.browser || await createPlaywrightBrowser();
  const closeBrowser = !options.browser;
  const page = await newPage(browser);
  const districtResult = {
    district: districtConfig.district,
    division: districtConfig.division,
    url: districtConfig.url,
    status: "Success",
    fetchedCount: 0,
    skippedDuplicates: 0,
    errors: [],
    articles: [],
  };

  try {
    const links = await fetchDistrictArticleLinks(page, districtConfig, limit);
    districtResult.discoveredCount = links.length;
    const articleLinks = links.slice(0, limit);
    const seen = new Set();

    for (const link of articleLinks) {
      const key = extractNewsId(link.url) || link.url;
      if (seen.has(key)) {
        districtResult.skippedDuplicates += 1;
        continue;
      }
      seen.add(key);

      try {
        const article = withContent
          ? await extractArticle(page, districtConfig, link)
          : {
              articleId: extractNewsId(link.url) || createArticleHash({ title: link.titleHint, district: districtConfig.district }),
              title: link.titleHint || "MP Info News",
              subtitle: null,
              publishDate: normalizePublishDate("", link.url),
              district: districtConfig.district,
              division: districtConfig.division,
              source: "MP Info",
              sourceUrl: link.url,
              subdomain: districtConfig.subdomain,
              imageUrl: link.listingImageUrl || null,
              fallbackImageUrl: null,
              contentHtml: "",
              contentText: "",
              tags: [],
              language: "hi",
              fetchedAt: new Date().toISOString(),
            };

        districtResult.articles.push(article);
      } catch (error) {
        districtResult.errors.push({ url: link.url, message: error.message });
        if (options.saveSnapshots) {
          await saveDebugSnapshot(page, districtConfig, link.url).catch(() => {});
        }
      }
    }

    districtResult.articles = uniqueBy(districtResult.articles, (article) => article.articleId).slice(0, limit);
    districtResult.fetchedCount = districtResult.articles.length;
    writeMpInfoLog("info", "District crawl completed", {
      district: districtConfig.district,
      fetchedCount: districtResult.fetchedCount,
      errors: districtResult.errors.length,
    });
  } catch (error) {
    districtResult.status = "Error";
    districtResult.errors.push({ url: districtConfig.url, message: error.message });
    writeMpInfoLog("error", "District crawl failed", {
      district: districtConfig.district,
      error: error.message,
    });
  } finally {
    await page.close().catch(() => {});
    if (closeBrowser) {
      await browser.close().catch(() => {});
    }
  }

  return districtResult;
}

async function saveDebugSnapshot(page, districtConfig, sourceUrl) {
  fs.mkdirSync(DEBUG_SNAPSHOT_DIR, { recursive: true });
  const slug = `${districtConfig.slug}-${Date.now()}`;
  fs.writeFileSync(path.join(DEBUG_SNAPSHOT_DIR, `${slug}.html`), await page.content(), "utf8");
  fs.writeFileSync(path.join(DEBUG_SNAPSHOT_DIR, `${slug}.txt`), sourceUrl, "utf8");
}

async function crawlAllDistricts(options = {}) {
  const limit = Math.max(1, Number.parseInt(options.limit || 5, 10));
  const districts = options.districts || getMpInfoDistricts();
  const browser = await createPlaywrightBrowser();

  try {
    const results = await withConcurrency(
      districts,
      options.concurrency || DEFAULT_DISTRICT_CONCURRENCY,
      (district) => crawlDistrict(district, {
        ...options,
        limit,
        browser,
      })
    );
    const articles = uniqueBy(results.flatMap((result) => result.articles || []), (article) => article.articleId);

    return {
      status: "Success",
      source: "MP Info",
      districtCount: districts.length,
      fetchedCount: articles.length,
      failedDistrictCount: results.filter((result) => result.status === "Error").length,
      results,
      articles,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function crawlLatest(options = {}) {
  const limit = Math.max(1, Number.parseInt(options.limit || 20, 10));
  const perDistrictLimit = Math.max(1, Math.ceil(limit / Math.max(1, Number.parseInt(options.districtBatch || "8", 10))));
  const allDistricts = options.districts || getMpInfoDistricts();
  const scanLimit = Math.max(1, Math.min(Number.parseInt(options.districtScanLimit || "1", 10), allDistricts.length));
  const startIndex = Math.max(0, Number.parseInt(options.districtStartIndex || "0", 10)) % Math.max(1, allDistricts.length);
  const districts = Array.from({ length: scanLimit }, (_, offset) => allDistricts[(startIndex + offset) % allDistricts.length]);
  const result = await crawlAllDistricts({
    ...options,
    limit: perDistrictLimit,
    districts,
    concurrency: options.concurrency || DEFAULT_DISTRICT_CONCURRENCY,
  });

  result.articles = result.articles
    .sort((left, right) => new Date(right.publishDate || right.fetchedAt) - new Date(left.publishDate || left.fetchedAt))
    .slice(0, limit);
  result.fetchedCount = result.articles.length;
  result.districtStartIndex = startIndex;
  result.nextDistrictIndex = (startIndex + scanLimit) % Math.max(1, allDistricts.length);
  return result;
}

module.exports = {
  crawlAllDistricts,
  crawlDistrict,
  crawlLatest,
  getDistrictConfigBySlug,
  getDistrictCatalog,
};

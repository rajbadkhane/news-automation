const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_LIMIT = 10;
const ARTICLE_IMAGE_FETCH_PROFILES = [
  { userAgent: DEFAULT_USER_AGENT },
  { userAgent: "Mozilla/5.0" },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
];
const DEFAULT_LOCALE = {
  hl: "en-IN",
  gl: "IN",
  ceid: "IN:en",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtmlEntities(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)));
}

function sanitizeText(value = "") {
  return decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildGoogleNewsRssUrl(query, locale = {}) {
  const mergedLocale = { ...DEFAULT_LOCALE, ...locale };
  const params = new URLSearchParams({
    q: query,
    hl: mergedLocale.hl,
    gl: mergedLocale.gl,
    ceid: mergedLocale.ceid,
  });

  return `https://news.google.com/rss/search?${params.toString()}`;
}

async function fetchText(url, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: options.redirect || "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": options.userAgent || DEFAULT_USER_AGENT,
        Accept: options.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(options.headers || {}),
      },
    });

    return {
      response,
      text: await response.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function withRetry(task, retries = 2) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
      }
    }
  }

  throw lastError;
}

function extractAttributesFromTag(tag = "") {
  const attributes = {};
  const attributePattern = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;

  while ((match = attributePattern.exec(String(tag)))) {
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(match[3] || match[4] || match[5] || "");
  }

  return attributes;
}

function extractTagValue(xml, tagName) {
  const escapedTag = String(tagName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, "i");
  const match = String(xml || "").match(pattern);
  return match ? decodeHtmlEntities(match[1]).trim() : "";
}

function absolutizeUrl(value, baseUrl) {
  if (!value || value === "undefined" || value === "null") {
    return null;
  }

  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

function extractRssImageUrl(itemXml, feedUrl) {
  const item = String(itemXml || "");
  const tagPatterns = [
    /<media:content\b[^>]*>/gi,
    /<media:thumbnail\b[^>]*>/gi,
    /<enclosure\b[^>]*>/gi,
  ];

  for (const pattern of tagPatterns) {
    const tags = item.match(pattern) || [];
    for (const tag of tags) {
      const attributes = extractAttributesFromTag(tag);
      const rawUrl = attributes.url || attributes.href || "";
      const type = String(attributes.type || "").toLowerCase();
      if (!rawUrl || (type && !type.startsWith("image/"))) {
        continue;
      }

      return absolutizeUrl(rawUrl, feedUrl) || rawUrl;
    }
  }

  const imageTag = item.match(/<image\b[\s\S]*?<\/image>/i)?.[0] || "";
  const imageUrl = extractTagValue(imageTag, "url");
  if (imageUrl) {
    return absolutizeUrl(imageUrl, feedUrl) || imageUrl;
  }

  const description = extractTagValue(item, "description");
  const descriptionImageTag = description.match(/<img\b[^>]*>/i)?.[0] || "";
  const descriptionImage = extractAttributesFromTag(descriptionImageTag).src;
  return descriptionImage ? absolutizeUrl(descriptionImage, feedUrl) || descriptionImage : null;
}

function extractMetaContentFromHtml(html, metaKey) {
  const metaTags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  const normalizedKey = String(metaKey || "").toLowerCase();

  for (const tag of metaTags) {
    const attributes = extractAttributesFromTag(tag);
    const property = String(attributes.property || "").toLowerCase();
    const name = String(attributes.name || "").toLowerCase();
    if (attributes.content && (property === normalizedKey || name === normalizedKey)) {
      return attributes.content;
    }
  }

  return null;
}

function extractTitleFromHtml(html) {
  return sanitizeText(
    extractMetaContentFromHtml(html, "og:title") ||
      extractMetaContentFromHtml(html, "twitter:title") ||
      String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
      ""
  );
}

function extractLinkHrefFromHtml(html, relValue) {
  const linkTags = String(html || "").match(/<link\b[^>]*>/gi) || [];
  const normalizedRelValue = String(relValue || "").toLowerCase();

  for (const tag of linkTags) {
    const attributes = extractAttributesFromTag(tag);
    const relTokens = String(attributes.rel || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (relTokens.includes(normalizedRelValue) && attributes.href) {
      return attributes.href;
    }
  }

  return null;
}

function isGoogleNewsUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "news.google.com";
  } catch {
    return false;
  }
}

function isGoogleHostedImageUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "lh3.googleusercontent.com" || hostname.endsWith(".googleusercontent.com");
  } catch {
    return false;
  }
}

function pickBestSrcsetCandidate(srcset, articleUrl) {
  const candidates = String(srcset || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const pieces = part.split(/\s+/).filter(Boolean);
      const rawUrl = pieces.shift();
      const descriptor = pieces[0] || "";
      let score = 0;

      if (descriptor.endsWith("w")) {
        score = Number.parseInt(descriptor, 10) || 0;
      } else if (descriptor.endsWith("x")) {
        score = Math.round((Number.parseFloat(descriptor) || 0) * 1000);
      }

      return { rawUrl, score };
    })
    .filter((item) => item.rawUrl);

  candidates.sort((left, right) => right.score - left.score);
  return candidates.length ? absolutizeUrl(candidates[0].rawUrl, articleUrl) : null;
}

function isLikelyDecorativeImageUrl(value) {
  const normalized = String(value || "").toLowerCase();
  const isLikelyContentUpload =
    normalized.includes("/wp-content/uploads/") ||
    normalized.includes("/upload/") ||
    normalized.includes("/uploads/") ||
    normalized.includes("/images/") ||
    normalized.includes("/image/");

  return (
    !normalized ||
    normalized.includes("sprite") ||
    normalized.includes("avatar") ||
    /(?:^|[/?&_.-])ads?(?:[/?&_.=-]|$)/.test(normalized) ||
    /(?:^|[/?&_.-])advert(?:ising|isement)?(?:[/?&_.=-]|$)/.test(normalized) ||
    normalized.includes("social") ||
    normalized.includes("share") ||
    normalized.includes("follow-us") ||
    normalized.includes("placeholder") ||
    normalized.includes("default-image") ||
    normalized.includes("google-play") ||
    normalized.includes("play-store") ||
    normalized.includes("app-store") ||
    normalized.endsWith(".svg") ||
    (!isLikelyContentUpload &&
      (normalized.includes("logo") || normalized.includes("icon") || normalized.includes("banner")))
  );
}

function extractImageFromHtml(html, articleUrl) {
  const imageTags = String(html || "").match(/<img\b[^>]*>/gi) || [];
  let bestCandidate = null;

  for (const tag of imageTags) {
    const attributes = extractAttributesFromTag(tag);
    const srcsetCandidate = pickBestSrcsetCandidate(
      attributes.srcset ||
        attributes["data-srcset"] ||
        attributes["data-original-set"] ||
        attributes["data-lazy-srcset"] ||
        "",
      articleUrl
    );
    const rawSrc =
      attributes.src ||
      attributes["data-src"] ||
      attributes["data-lazy-src"] ||
      attributes["data-original"] ||
      attributes["data-img-url"] ||
      srcsetCandidate;
    const absoluteUrl = absolutizeUrl(rawSrc, articleUrl);

    if (!absoluteUrl || isLikelyDecorativeImageUrl(absoluteUrl)) {
      continue;
    }

    const width = Number.parseInt(attributes.width, 10) || 0;
    const height = Number.parseInt(attributes.height, 10) || 0;
    const className = String(attributes.class || "").toLowerCase();
    const area = width * height;
    let score = area;

    if (/article|story|post|content|featured|hero/.test(className)) {
      score += 500_000;
    }

    if (/feature|featured|hero|lead|story|article|post|news|uploads/.test(absoluteUrl.toLowerCase())) {
      score += 250_000;
    }

    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = { url: absoluteUrl, score };
    }
  }

  return bestCandidate?.url || null;
}

function extractJsonLdImageUrl(html, articleUrl) {
  const scripts = String(html || "").match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];

  function collectImage(value) {
    if (!value) {
      return null;
    }

    if (typeof value === "string") {
      return absolutizeUrl(value, articleUrl);
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const imageUrl = collectImage(item);
        if (imageUrl) {
          return imageUrl;
        }
      }
      return null;
    }

    if (typeof value === "object") {
      return collectImage(value.url || value.contentUrl || value.thumbnailUrl);
    }

    return null;
  }

  for (const script of scripts) {
    const json = script
      .replace(/^<script\b[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(decodeHtmlEntities(json));
      const records = Array.isArray(parsed) ? parsed : [parsed];
      for (const record of records) {
        const imageUrl = collectImage(record?.image || record?.thumbnailUrl || record?.primaryImageOfPage);
        if (imageUrl && !isLikelyDecorativeImageUrl(imageUrl)) {
          return imageUrl;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

function extractBestImageFromHtml(html, articleUrl) {
  const finalUrl = articleUrl;
  const ogImage =
    extractMetaContentFromHtml(html, "og:image") ||
    extractMetaContentFromHtml(html, "og:image:secure_url") ||
    extractMetaContentFromHtml(html, "og:image:url");
  const twitterImage =
    extractMetaContentFromHtml(html, "twitter:image") ||
    extractMetaContentFromHtml(html, "twitter:image:src");
  const linkImage = extractLinkHrefFromHtml(html, "image_src");
  const jsonLdImage = extractJsonLdImageUrl(html, finalUrl);
  const htmlImage = extractImageFromHtml(html, finalUrl);
  const imageUrl =
    absolutizeUrl(ogImage, finalUrl) ||
    absolutizeUrl(twitterImage, finalUrl) ||
    absolutizeUrl(linkImage, finalUrl) ||
    jsonLdImage ||
    htmlImage;

  return {
    title: extractTitleFromHtml(html) || null,
    imageUrl: imageUrl && !isLikelyDecorativeImageUrl(imageUrl) ? imageUrl : null,
    imageSource: ogImage
      ? "og:image"
      : twitterImage
        ? "twitter:image"
        : linkImage
          ? "link[rel=image_src]"
          : jsonLdImage
            ? "json-ld"
            : htmlImage
              ? "html-image"
              : null,
  };
}

async function resolveGoogleNewsLink(url, options = {}) {
  if (!url || !url.includes("news.google.com")) {
    return url;
  }

  try {
    const parsed = new URL(url);
    const directUrl = parsed.searchParams.get("url");
    if (directUrl) {
      return directUrl;
    }
  } catch {
    return url;
  }

  const decodedUrl = await decodeGoogleNewsUrl(url, options);
  if (decodedUrl) {
    return decodedUrl;
  }

  try {
    const { response } = await fetchText(url, {
      ...options,
      redirect: "follow",
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    });

    if (response?.url && !response.url.includes("news.google.com")) {
      return response.url;
    }
  } catch {
    // Keep the RSS item usable even when Google does not expose a redirect.
  }

  return url;
}

function getGoogleNewsBase64Path(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const section = pathParts[pathParts.length - 2];
    const base64Path = pathParts[pathParts.length - 1];

    if (parsed.hostname === "news.google.com" && ["articles", "read"].includes(section) && base64Path) {
      return base64Path;
    }
  } catch {
    return null;
  }

  return null;
}

async function getGoogleNewsDecodingParams(base64Path, options = {}) {
  const candidateUrls = [
    `https://news.google.com/articles/${base64Path}`,
    `https://news.google.com/rss/articles/${base64Path}`,
  ];

  for (const candidateUrl of candidateUrls) {
    try {
      const { response, text: html } = await fetchText(candidateUrl, {
        ...options,
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      });

      if (!response?.ok) {
        continue;
      }

      const wizardTag = (html.match(/<c-wiz\b[^>]*>\s*<div\b[^>]*jscontroller[^>]*>/i)?.[0] || "")
        .match(/<div\b[^>]*jscontroller[^>]*>/i)?.[0];
      const attributes = extractAttributesFromTag(wizardTag || "");
      const signature = attributes["data-n-a-sg"];
      const timestamp = attributes["data-n-a-ts"];

      if (signature && timestamp) {
        return { signature, timestamp, base64Path };
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function decodeGoogleNewsUrl(sourceUrl, options = {}) {
  const base64Path = getGoogleNewsBase64Path(sourceUrl);
  if (!base64Path) {
    return null;
  }

  const params = await getGoogleNewsDecodingParams(base64Path, options);
  if (!params) {
    return null;
  }

  const payload = [
    "Fbv4je",
    `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${params.base64Path}",${params.timestamp},"${params.signature}"]`,
  ];
  const body = `f.req=${encodeURIComponent(JSON.stringify([[payload]]))}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": options.userAgent || DEFAULT_USER_AGENT,
        },
        body,
      });

      if (!response.ok) {
        return null;
      }

      const text = await response.text();
      const dataLine = text.split("\n\n")[1];
      if (!dataLine) {
        return null;
      }

      const parsed = JSON.parse(dataLine);
      const decodedPayload = JSON.parse(parsed[0][2]);
      return decodedPayload[1] || null;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

async function extractBestImageFromArticle(articleUrl, options = {}) {
  if (!articleUrl) {
    return { imageUrl: null, imageSource: null };
  }

  for (const profile of ARTICLE_IMAGE_FETCH_PROFILES) {
    try {
      const { response, text: html } = await withRetry(
        () =>
          fetchText(articleUrl, {
            ...options,
            userAgent: profile.userAgent,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          }),
        options.retries ?? 1
      );

      if (!response?.ok) {
        continue;
      }

      const imageResult = extractBestImageFromHtml(html, response.url || articleUrl);
      if (imageResult.imageUrl || imageResult.title) {
        return imageResult;
      }
    } catch {
      continue;
    }
  }

  return { title: null, imageUrl: null, imageSource: null };
}

function parseGoogleRssItems(xml, feedUrl, limit = DEFAULT_LIMIT) {
  const itemMatches = Array.from(String(xml || "").matchAll(/<item\b[\s\S]*?<\/item>/gi));
  const items = [];
  const seen = new Set();

  for (const match of itemMatches) {
    const itemXml = match[0];
    const googleLink = extractTagValue(itemXml, "link").replace(/&amp;/g, "&").trim();
    const title = sanitizeText(extractTagValue(itemXml, "title"));

    if (!googleLink || !title || seen.has(googleLink)) {
      continue;
    }

    seen.add(googleLink);
    const sourceTag = itemXml.match(/<source\b[^>]*>/i)?.[0] || "";
    const sourceAttributes = extractAttributesFromTag(sourceTag);
    const rssImageUrl = extractRssImageUrl(itemXml, feedUrl);

    items.push({
      title,
      google_link: googleLink,
      link: googleLink,
      image_link: rssImageUrl,
      image_source: rssImageUrl ? "rss-image" : null,
      description: sanitizeText(extractTagValue(itemXml, "description")),
      published_at: sanitizeText(extractTagValue(itemXml, "pubDate")),
      source: sanitizeText(extractTagValue(itemXml, "source") || "Google News"),
      source_url: sourceAttributes.url || null,
    });

    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

async function fetchGoogleRssFeed(options = {}) {
  const query = options.query || "India news";
  const limit = Math.max(1, Number.parseInt(options.limit || DEFAULT_LIMIT, 10));
  const feedUrl = options.feedUrl || buildGoogleNewsRssUrl(query, options.locale);
  const { response, text: xml } = await withRetry(
    () =>
      fetchText(feedUrl, {
        ...options,
        accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      }),
    options.retries ?? 2
  );

  if (!response?.ok) {
    throw new Error(`Google RSS request failed with status ${response?.status || "unknown"}`);
  }

  const items = parseGoogleRssItems(xml, feedUrl, limit);
  const resolvedItems = [];

  for (const item of items) {
    const articleUrl = await resolveGoogleNewsLink(item.google_link, options);
    if (!articleUrl || isGoogleNewsUrl(articleUrl)) {
      resolvedItems.push({
        ...item,
        link: null,
        image_link: null,
        image_source: null,
        skipped_reason: "Google RSS link could not be resolved to the original publisher URL.",
      });
      continue;
    }

    const articleImage = await extractBestImageFromArticle(articleUrl, options);
    const rssImageUrl = item.image_link && !isGoogleHostedImageUrl(item.image_link) ? item.image_link : null;
    const imageUrl = articleImage.imageUrl || rssImageUrl || null;

    resolvedItems.push({
      ...item,
      title: articleImage.title || item.title,
      link: articleUrl,
      image_link: imageUrl,
      image_source: articleImage.imageUrl ? articleImage.imageSource : rssImageUrl ? item.image_source : null,
    });
  }

  return {
    query,
    feed_url: feedUrl,
    fetched_count: resolvedItems.length,
    items: resolvedItems,
  };
}

module.exports = {
  buildGoogleNewsRssUrl,
  decodeGoogleNewsUrl,
  extractBestImageFromArticle,
  fetchGoogleRssFeed,
  isGoogleNewsUrl,
  parseGoogleRssItems,
  resolveGoogleNewsLink,
};

if (require.main === module) {
  const query = process.argv.slice(2).join(" ") || process.env.GOOGLE_RSS_QUERY || "India news";
  const limit = process.env.GOOGLE_RSS_LIMIT || DEFAULT_LIMIT;

  fetchGoogleRssFeed({ query, limit })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

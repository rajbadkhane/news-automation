# MP Info District Scraper

Production-oriented Playwright scraper for Madhya Pradesh Information & Public Relations Department district portals.

## Files

- `config/mpinfo-districts.js` - hardcoded district URL and division mapping.
- `services/mpinfo-scraper.service.js` - Playwright crawler, rendered DOM extraction, image fallbacks, dedupe.
- `routes/mpinfo.routes.js` - Express API routes.
- `utils/mpinfo-utils.js` - URL, Hindi text, image, hash, and date helpers.
- `utils/mpinfo-logger.js` - JSONL scraper log writer.
- `models/mpinfo-article.model.js` - optional commented MongoDB/Mongoose schema.
- `logs/mpinfo-scraper.log` - per-district success/failure logs.

## API

```http
GET /api/mpinfo/fetch-all?limit=2&save=false&withContent=true
GET /api/mpinfo/fetch-district/katni?limit=2&save=true&rewrite=true&withContent=true
GET /api/mpinfo/fetch-latest?limit=20&save=false&withContent=true
```

Query params:

- `limit` - articles per district or latest total.
- `save=true` - saves into existing `fetched_news`.
- `rewrite=true` - after save, runs existing AI rewrite pipeline.
- `withContent=false` - listing-only mode.
- `saveSnapshots=true` - writes failed rendered HTML snapshots to `logs/mpinfo-snapshots`.

## Extraction Notes

The scraper always loads district pages with Playwright and uses rendered DOM. It handles Angular/template-heavy pages and removes `{{...}}` placeholders. Update these arrays in `services/mpinfo-scraper.service.js` if MP Info changes layout:

- `listingSelectors`
- `articleLinkPatterns`
- `junkSelectors` inside `extractArticleBody`
- image scoring logic in `scoreImageCandidate`

Image priority:

1. Main content image
2. `og:image`
3. `twitter:image`
4. JSON-LD image
5. First meaningful content image
6. Listing/card image
7. `null`

## MongoDB

MongoDB is optional. `models/mpinfo-article.model.js` contains a ready Mongoose schema. Install `mongoose`, connect in app bootstrap, then replace or supplement `saveArticle` in `routes/mpinfo.routes.js`.

## Cron

Optional auto-fetch every 10-15 minutes can be added with `node-cron`:

```js
cron.schedule("*/15 * * * *", async () => {
  await crawlLatest({ limit: 50, withContent: true });
});
```

Respect MP Info infrastructure: keep concurrency low (`MPINFO_DISTRICT_CONCURRENCY=2`) and avoid aggressive crawl intervals.

## Tested Command

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/mpinfo/fetch-district/katni?limit=2&save=true&rewrite=true&withContent=true"
```

This fetched 2 district articles with images, saved them, and generated 100/300/600-word AI rewrites.

# Client API Onboarding Guide

## Welcome

You have been granted access to the Gautam News Bot API.

Important:

- RSS ingestion and raw news collection are internal-only systems
- clients do not consume our raw RSS pipeline directly
- clients receive only our approved AI-modified published news
- published delivery responses can include the final article image and real-time availability from our cron pipeline

Your access is controlled by:

- your client API key
- your approved website origin(s)
- the API scopes enabled for your account
- your usage quota

## Base URLs

Documentation:

- `/api/v1/docs`
- `/api/v1/openapi.json`
- `/api/v1/swagger`

## Authentication

Send your API key in one of these ways:

### Option 1: `x-api-key`

```http
x-api-key: YOUR_CLIENT_API_KEY
```

### Option 2: Bearer token

```http
Authorization: Bearer YOUR_CLIENT_API_KEY
```

## Browser Origin Rules

Your API key works only from the website origin(s) approved for your account.

Example approved origin:

- `https://yourwebsite.com`

If your domain changes, contact us so we can update your allowed origins.

## Example Request

```bash
curl "https://api.example.com/api/v1/delivery/news?language=english&limit=5" \
  -H "x-api-key: YOUR_CLIENT_API_KEY"
```

## Client Endpoints

For normal client websites, the intended endpoints are:

- `GET /api/v1/delivery/news`
- `GET /api/v1/delivery/news/grouped`
- `GET /api/v1/delivery/news/:idOrSlug`
- `GET /api/v1/delivery/feed`

These are the endpoints that expose your final published AI-written content.

## Published Article Feed

The recommended production feed for client websites is:

- `GET /api/v1/delivery/news`
- `GET /api/v1/delivery/news/grouped`
- `GET /api/v1/delivery/feed`

Supported query parameters:

- `category=National/State`
- `language=english`
- `language=hindi`
- `language=both`
- `limit=20`

Single article lookup:

- `GET /api/v1/delivery/news/:idOrSlug`

Category-grouped article list:

- `GET /api/v1/delivery/news/grouped`

Important:

- this feed only returns articles that have been explicitly approved and published by us
- draft AI rewrites are not exposed through the delivery feed
- use `language=english` or `language=hindi` when you want one ready-to-render article block
- images are included through the `media.image_link` field when available

Use grouped delivery when your website homepage or category sections need data like:

- `National/State -> [articles]`
- `International -> [articles]`
- `Sports -> [articles]`

Default category order is stable for delivery responses:

- `National/State`
- `International`
- `Business`
- `Sports`
- `Entertainment`

## Cron-Aligned Feed

If you want your website to follow our scheduler pipeline, use:

- `GET /api/v1/delivery/feed`

This endpoint returns:

- published AI-written articles
- scheduler freshness details
- category-level cron state
- AI rewrite cron state

Example:

```bash
curl "https://api.example.com/api/v1/delivery/feed?language=english&limit=24&grouped=true" \
  -H "x-api-key: YOUR_CLIENT_API_KEY"
```

Use this endpoint when your frontend needs to know:

- what content is currently available from our cron pipeline
- which categories were updated recently
- whether the feed is healthy enough to trust for live display

In simple words:

- our cron fetches raw news internally
- our AI rewrites and modifies it internally
- only the published modified version is delivered to your website

## Error Meanings

`401 Unauthorized`

- your API key is missing, invalid, or inactive

`403 Forbidden`

- your API key does not have the required scope
- your website origin is not approved

`429 Too Many Requests`

- you exceeded a rate limit or quota

## Security Rules

- keep your API key private
- do not expose your key in public repositories
- do not share your key with third parties
- contact us immediately if you think your key is compromised

## Support Requests

Contact us when you need:

- a new domain/origin added
- more quota
- more scopes
- a rotated API key
- temporary troubleshooting support

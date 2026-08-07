# Category-Wise News API — Integration Guide

This document describes how an external system (e.g. a newspaper page-layout tool) can
pull published, AI-rewritten Hindi news — headline, secondary headline, subheadings,
body text, image, and image caption — filtered by category.

Two ways to call this API are documented below. **Use the public endpoint (Option A)
unless you have a specific reason to hit the backend directly.**

---

## Option A — Public endpoint (recommended)

- **Base URL:** `https://news.gautamenterprises.org/api/dashboard`
- **Auth:** none required (it's a public read-only proxy)
- **TLS:** valid certificate, no special handling needed
- **Caching:** live data, `Cache-Control: no-store` on the endpoints below

Use this from any external system with a plain HTTPS GET — no key to store or rotate.

## Option B — Direct backend (advanced)

- **Base URL:** `https://103.192.198.73/api/v1`
- **Auth required:** header `x-api-key: <MASTER_API_KEY>` (ask the site admin for the key)
- **TLS:** the server presents a **self-signed certificate** — your HTTP client must
  either trust it explicitly or disable cert verification (e.g. `curl -k`,
  `requests.get(..., verify=False)`). Only use this if Option A doesn't cover your case
  (e.g. you need to fetch a single article by ID — see below).

All endpoint paths below are given relative to whichever base URL you choose. On the
public proxy (Option A), backend paths are exposed as-is (no `/api/v1` prefix needed —
the proxy adds it for you).

---

## 1. Categories

Published/rewritten articles use **6 categories**. This is a smaller set than the 9
categories used at the fetching stage — `Science`, `Health`, and `Technology` articles
are fetched under those names but re-tagged as `National` once AI-rewritten.

Use these exact strings (case-sensitive) as the `category` filter value:

| Category value    | Notes                                             |
|--------------------|----------------------------------------------------|
| `Madhya Pradesh`   | MP state/district government news (MP Info portal) |
| `National`         | National/state news, incl. ex-Science/Health/Tech   |
| `International`    | World news                                          |
| `Business`         | Business/economy                                    |
| `Sports`           | Sports                                              |
| `Entertainment`    | Entertainment                                       |

To see the full fetch-time category → source mapping (9 categories, useful for context
but not for filtering published articles), call:

```
GET /categories
```

---

## 2. Recommended endpoint — grouped-by-category table

```
GET /delivery/news/grouped?compact=table&limit=500
```

Returns **all published articles grouped by category** in one call, in the same
flattened shape the internal news table uses. This is the simplest way to build a
category-wise feed: fetch once, then read `grouped_records[i].category` /
`.records[]`.

### Query params

| Param      | Type   | Default | Notes                                              |
|------------|--------|---------|-----------------------------------------------------|
| `compact`  | string | —       | Pass `table` to get the flattened print-friendly shape (recommended) |
| `limit`    | number | 500     | Max records per pull, up to 1000                    |
| `language` | string | both    | `hindi` to restrict to Hindi-only records            |

### Response shape

```json
{
  "status": "Success",
  "grouped_records": [
    {
      "category": "Madhya Pradesh",
      "count": 69,
      "records": [
        {
          "id": 11551,
          "rewrite_id": 11717,
          "category": "Madhya Pradesh",
          "title": "मुख्य हेडलाइन",
          "source_url": "https://...",
          "image_link": "https://... (or empty string if no image)",
          "image_caption": "फोटो कैप्शन",
          "image_source": "article-image",
          "place_name": "भोपाल",
          "fetched_at": "2026-08-07T02:25:30.000Z",
          "feed_source": "mpinfo-ratlam",
          "feed_url": "https://ratlam.mpinfo.org/",
          "ui_hindi": {
            "title": "मुख्य हेडलाइन",
            "secondary_headline": "2-3 keywords : 10-14 शब्द का उपशीर्षक",
            "subheadings": ["उप-शीर्षक 1 (factual, ~8-18 words)", "उप-शीर्षक 2 (factual, ~8-18 words)", "उप-शीर्षक 3 (standalone, 5-7 words)"],
            "short_100": "≈300-शब्द बॉडी (headline + secondary + body टेक्स्ट सहित)",
            "medium_300": "≈600-शब्द बॉडी",
            "long_500": "≈1100+-शब्द पूरी बॉडी",
            "category": "Madhya Pradesh",
            "state": "मध्य प्रदेश",
            "place_name": "भोपाल",
            "district": ""
          }
        }
      ]
    }
  ],
  "count": 200,
  "category_count": 6
}
```

### To filter to ONE category client-side

```js
const category = "Business";
const group = json.grouped_records.find(g => g.category === category);
const articles = group ? group.records : [];
```

This is the recommended pattern — one HTTP call, filter locally. It avoids re-fetching
per category and keeps your integration simple.

---

## 3. Alternative — server-side category filter (single category, raw shape)

```
GET /delivery/news?category=Business&limit=50
```

Filters on the server to one category, but returns the **raw record shape** (not the
flattened print-friendly shape from `compact=table`) — heavier payload, includes the
full bilingual raw AI-response fields. Prefer Option A above unless you specifically
need server-side filtering to cut payload size for a very large `limit`.

| Param      | Type   | Default | Notes                            |
|------------|--------|---------|-----------------------------------|
| `category` | string | —       | One of the 6 values from §1       |
| `limit`    | number | 50      | Max 200                           |
| `language` | string | both    | `hindi` to restrict to Hindi-only |

---

## 4. Single article by ID or slug (backend-only, Option B required)

```
GET /delivery/news/:idOrSlug
```

**Not available on the public proxy** (`Option A` returns `403 DASHBOARD_ROUTE_DISABLED`
for this path) — you must call the backend directly with the `x-api-key` header:

```bash
curl -k "https://103.192.198.73/api/v1/delivery/news/11717" \
  -H "x-api-key: <MASTER_API_KEY>"
```

Accepts either the numeric `rewrite_id` (the `id` field from the grouped response) or
the `slug` field.

---

## 5. Field reference — mapping to a print layout

| Layout element     | JSON field                                          |
|---------------------|------------------------------------------------------|
| Main headline        | `ui_hindi.title` (same as top-level `title`)          |
| Secondary headline   | `ui_hindi.secondary_headline` (10–14 words total, incl. 2–3 lead keywords before the colon) |
| Subheading 1 / 2     | `ui_hindi.subheadings[0]` / `[1]` — factual mini-headlines, ~8-18 words each |
| Subheading 3          | `ui_hindi.subheadings[2]` — a short, standalone, self-contained mini-headline, strictly 5-7 words, meaningful without reading the article |
| Body text            | Pick one length tier: `ui_hindi.short_100` (~300 words), `.medium_300` (~600 words), `.long_500` (~1100+ words). Field names are legacy — the word counts were upgraded from 100/300/1000 to 300/600/1100, but the field names were kept for compatibility. |
| Article image        | `image_link` (empty string if no image was found)     |
| Photo caption         | `image_caption`                                        |
| State                | `ui_hindi.state`                                        |
| Place name (dateline) | `place_name` (top-level, same as `ui_hindi.place_name`) — the single city/town used to open the article, e.g. भोपाल, नई दिल्ली. Always populated: the model returns it directly, or it's derived from the body's own opening dateline, or falls back to the state name. |
| District (MP only)    | `ui_hindi.district`                                     |
| Original source URL   | `source_url`                                            |
| Fetched timestamp     | `fetched_at`                                             |

Note: body fields already contain the headline + secondary headline + a `Photo Caption:`
line prepended in-text as part of the newspaper-style layout — if your system renders
headline/secondary headline/caption as separate elements, you may want to strip the
first two lines and the trailing `Photo Caption:` line before laying out the body,
since those are duplicated by the dedicated fields above.

---

## 6. Example code

### curl

```bash
curl -s "https://news.gautamenterprises.org/api/dashboard/delivery/news/grouped?compact=table&limit=500"
```

### Python

```python
import requests

resp = requests.get(
    "https://news.gautamenterprises.org/api/dashboard/delivery/news/grouped",
    params={"compact": "table", "limit": 500},
)
data = resp.json()

for group in data["grouped_records"]:
    if group["category"] != "Business":
        continue
    for item in group["records"]:
        ui = item["ui_hindi"]
        print(ui["title"])
        print(ui["secondary_headline"])
        print(item["image_link"], "|", item["image_caption"])
```

### Node.js

```js
const resp = await fetch(
  "https://news.gautamenterprises.org/api/dashboard/delivery/news/grouped?compact=table&limit=500"
);
const data = await resp.json();

const business = data.grouped_records.find(g => g.category === "Business");
for (const item of business?.records || []) {
  console.log(item.ui_hindi.title, item.image_link);
}
```

---

## 7. Operational notes

- This is a **public, unauthenticated** endpoint (Option A) — anyone with the URL can
  read it, same as the published news table on the site. If you need it locked down for
  your printing system specifically (e.g. usage tracking, rate limiting, or a private
  key), ask and it can be added.
- Data updates continuously as the automatic scheduler fetches and AI-rewrites new
  articles. There is no webhook — poll on whatever interval matches your print
  deadline (e.g. every 15–30 minutes).
- `image_link` can be an empty string for source articles where no usable image was
  extracted. Always check before rendering.
- Only `Madhya Pradesh`, `National`, `International`, `Business`, `Sports`, and
  `Entertainment` will ever appear as `category` values on published articles.

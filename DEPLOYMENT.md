# Production Deployment Guide

## What This Backend Is Ready For

This backend is prepared for production use as a reusable API for multiple websites, with:

- Versioned API routes under `/api/v1`
- Per-client API key authentication with revocable access
- Per-client quotas and usage tracking
- Admin audit logs for permission changes
- CORS allow-list support
- Rate limiting
- Health checks
- OpenAPI spec and Swagger UI
- Main scheduler and AI scheduler monitoring
- Persistent scheduler audit logs in MySQL
- MySQL-backed distributed locks to reduce duplicate cron execution across instances

## Internal Pipeline Vs Client Delivery

This system has two separate layers:

1. Internal pipeline
   - RSS feeds
   - raw news fetch
   - AI rewrite generation
   - cron and sync jobs

2. Client delivery layer
   - only approved and published AI-modified news
   - image included when available
   - real-time delivery shaped from the cron pipeline

Normal client websites should use only:

- `/api/v1/delivery/news`
- `/api/v1/delivery/news/grouped`
- `/api/v1/delivery/news/:idOrSlug`
- `/api/v1/delivery/feed`

Do not give normal clients access to raw/internal endpoints unless you intentionally sell that as a separate product tier.

## Important Production Rules

1. Use a strong master API key.
2. Create individual client keys for each customer/site.
2. Do not keep `API_CORS_ORIGINS=*` in production.
3. Use a real MySQL server with backups enabled.
4. Run the backend behind a reverse proxy such as Nginx or a cloud load balancer.
5. Keep scheduler-enabled instances limited and controlled.

## Recommended Backend Environment

Use values like these in production:

```env
NODE_ENV=production
PORT=3000
TRUST_PROXY_ENABLED=true

DB_DIALECT=mysql
DB_HOST=your-mysql-host
DB_PORT=3306
DB_USER=your-db-user
DB_PASSWORD=your-strong-db-password
DB_NAME=gautam_news_bot

# Or use Supabase Postgres instead:
# DB_DIALECT=postgres
# DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
# DB_SSL_MODE=require

BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome

SCHEDULER_ENABLED=true
AI_SCHEDULER_ENABLED=true

API_KEYS=
MASTER_API_KEY=replace-with-a-long-random-master-secret
API_CORS_ORIGINS=https://site-one.com,https://site-two.com
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=120

GEMINI_API_KEY=your-real-key
GEMINI_MODEL=gemini-2.5-flash-lite

NEXT_PUBLIC_API_BASE_URL=https://your-backend-domain.onrender.com
ADMIN_PANEL_MASTER_API_KEY=replace-with-the-same-master-key-used-by-the-backend
ADMIN_PANEL_PASSWORD=replace-with-a-strong-admin-panel-password
ADMIN_PANEL_SESSION_SECRET=replace-with-a-long-random-session-secret
```

## Render And Vercel Split

- Deploy the backend from the repository root to Render using [render.yaml](/d:/news_automation/news_automation/render.yaml).
- Deploy the Next.js app from [frontend](/d:/news_automation/news_automation/frontend) to Vercel.
- In Vercel, set the project root directory to `frontend`.
- Add these Vercel environment variables:
  - `NEXT_PUBLIC_API_BASE_URL`
  - `ADMIN_PANEL_MASTER_API_KEY`
  - `ADMIN_PANEL_PASSWORD`
  - `ADMIN_PANEL_SESSION_SECRET`
- The frontend now fails fast in production if these values are missing, localhost-based, or left as placeholders.

## Admin Panel

The Next.js frontend now includes a protected admin panel at:

- `/admin`

Use it to:

- create and disable client accounts
- rotate client keys
- publish and unpublish AI rewrites
- trigger main and AI cron runs
- review current delivery categories
- watch recent scheduler activity

Important:

- the browser does not receive the master API key directly
- the admin panel uses secure server-side proxy routes
- protect it with strong values for `ADMIN_PANEL_PASSWORD` and `ADMIN_PANEL_SESSION_SECRET`

## PM2 Deployment

Install PM2:

```bash
npm install -g pm2
```

Start the backend:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## Health And Docs

Public:

- `/api/v1/health`
- `/api/v1/docs`
- `/api/v1/openapi.json`
- `/api/v1/swagger`

Protected with `x-api-key`:

- `/api/v1/news`
- `/api/v1/news/grouped`
- `/api/v1/delivery/news`
- `/api/v1/delivery/news/:idOrSlug`
- `/api/v1/delivery/feed`
- `/api/v1/rss-feeds`
- `/api/v1/sync/rss`
- `/api/v1/sync/rss/all`
- `/api/v1/sync/mpinfo`
- `/api/v1/cron/status`
- `/api/v1/cron/run-now`
- `/api/v1/ai/news`
- `/api/v1/ai/news/grouped`
- `/api/v1/ai/cron/status`
- `/api/v1/ai/cron/run-now`
- `/api/v1/scheduler/logs`

Admin only with the master key:

- `/api/v1/admin/clients`
- `/api/v1/admin/clients/:clientId`
- `/api/v1/admin/clients/:clientId/rotate-key`
- `/api/v1/admin/usage`
- `/api/v1/admin/audit-logs`

## MySQL Recommendations

- Enable automatic backups.
- Use InnoDB tables.
- Restrict DB access by firewall or private network.
- Monitor connection count and slow queries.
- Create a staging database before changing production schema.

## Reverse Proxy Recommendations

Put Nginx or another proxy in front of Node:

- terminate HTTPS at the proxy
- forward to backend port `3000`
- allow only required origins
- optionally restrict Swagger in production to internal/admin use

## Final Pre-Launch Checklist

1. Replace the default master API key.
2. Replace wildcard CORS with exact domains.
3. Point `DB_*` to production MySQL.
4. Confirm `/api/v1/health` returns `200`.
5. Confirm `/api/v1/swagger` loads.
6. Confirm one authenticated request succeeds.
7. Confirm scheduler logs are being written.
8. Confirm Chrome is installed at the configured path.

## Client Access Model

You keep the `MASTER_API_KEY`.

Use it to create client API keys through the admin endpoints. Each client can have:

- its own API key
- its own active/inactive status
- its own allowed origins
- its own allowed scopes
- its own quota window and quota limit

That means a client only gets access after you explicitly create and enable them.

## Commercial Readiness Features

- Reusable versioned API
- Protected client keys
- Client-specific permissions
- Client-specific origin allow-lists
- Client usage logging
- Client quota enforcement
- Admin audit logging

## Included Production Templates

- `.env.production.example`
- `deploy/nginx-news-bot.conf.example`
- `MYSQL_PRODUCTION_CHECKLIST.md`
- `ADMIN_API_COMMANDS.md`
- `CLIENT_ONBOARDING.md`

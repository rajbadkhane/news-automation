# NeevCloud Backend Migration

This move keeps the Next.js frontend on Vercel and moves the backend plus its
embedded schedulers from Render to one always-on NeevCloud server.

The backend does not need a separate Linux cron entry for normal operation.
`index.js` starts the main scheduler, AI scheduler, MP Info district scheduler,
retention cleanup scheduler, and watchdog after the database initializes. Run
one scheduler-enabled PM2 process first; do not leave Render and NeevCloud
ingesting in parallel after cutover.

## 1. Prepare NeevCloud

Use the server public IP from the NeevCloud dashboard for SSH and DNS.

Keep inbound access narrow:

- `22/tcp` from your admin IP for SSH
- `80/tcp` from the internet for the first Nginx and certificate flow
- `443/tcp` from the internet for HTTPS

Allow outbound traffic needed by this service:

- DNS, HTTP, and HTTPS for package installs, RSS/news sources, Gemini, and image fetches
- the remote database port when the database is outside the server, such as a
  Supabase/Postgres pooler port
- Redis egress when `REDIS_URL` points outside the server

Point an API hostname such as `api.your-domain.com` to the NeevCloud public IP
before the HTTPS step.

## 2. Install Server Packages

The repository requires Node.js 20 or newer. On the server, install Node.js
20+, Git, Nginx, PM2, and certificate tooling with your preferred Ubuntu
package flow, then verify:

```bash
node --version
npm --version
nginx -v
pm2 --version
```

The app uses Puppeteer and Playwright. After dependencies are installed, add
Linux browser dependencies before starting production traffic:

```bash
sudo npx playwright install-deps chromium
```

## 3. Clone And Configure

Use a stable server path so the Puppeteer cache path does not change between
deploys:

```bash
sudo mkdir -p /srv/news_automation
sudo chown -R "$USER":"$USER" /srv/news_automation
git clone <your-repository-url> /srv/news_automation
cd /srv/news_automation
cp .env.production.example .env
```

Fill `.env` with the real production values. For the first migration, keep the
same external database that Render uses so the server move and database move do
not happen at the same time.

For a Render deployment that currently uses Supabase Postgres, the important
backend values look like:

```env
NODE_ENV=production
PORT=3000
TRUST_PROXY_ENABLED=true

DB_DIALECT=postgres
DATABASE_URL=postgresql://...
DB_SSL_MODE=require

BROWSER_EXECUTABLE_PATH=
PUPPETEER_CACHE_DIR=/srv/news_automation/.puppeteer-cache

SCHEDULER_ENABLED=true
AI_SCHEDULER_ENABLED=true
MPINFO_DISTRICT_SCHEDULER_ENABLED=true
MPINFO_DISTRICT_BROWSER_ENABLED=true

MASTER_API_KEY=...
API_CORS_ORIGINS=https://your-frontend-domain.com
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-flash-lite-latest
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
REDIS_URL=...
```

Carry over the scheduler limits, retention settings, API keys, CORS origins,
Gemini settings, and Redis URL from Render when they are already in use.

Install repository dependencies from the backend root:

```bash
cd /srv/news_automation
npm ci
```

`npm ci` runs this repository's postinstall hook and downloads the browser
assets into `.puppeteer-cache`.

## 4. Start The Backend

Start the single production process with the existing PM2 config:

```bash
cd /srv/news_automation
pm2 start ecosystem.config.cjs --update-env
pm2 save
pm2 startup
```

Run the extra command printed by `pm2 startup`, then save again if PM2 asks for
it.

Check the process and local health before exposing it:

```bash
pm2 status
pm2 logs gautam-news-bot
curl http://127.0.0.1:3000/api/v1/health
```

The health response should return HTTP `200`. The PM2 logs should show the
schedulers as enabled after database initialization.

## 5. Put Nginx In Front

Copy the included Nginx template and replace the domain:

```bash
sudo cp deploy/nginx-news-bot.conf.example /etc/nginx/sites-available/news-bot
sudo nano /etc/nginx/sites-available/news-bot
sudo ln -s /etc/nginx/sites-available/news-bot /etc/nginx/sites-enabled/news-bot
sudo nginx -t
sudo systemctl reload nginx
```

The template proxies public traffic to `127.0.0.1:3000`; keep Node on the local
port and expose Nginx on `80` and `443`.

After DNS reaches the NeevCloud IP, request HTTPS:

```bash
sudo certbot --nginx -d api.your-domain.com
```

Verify public health:

```bash
curl https://api.your-domain.com/api/v1/health
```

## 6. Cut Over From Render

1. Confirm `/api/v1/health`, `/api/v1/cron/status`, and
   `/api/v1/ai/cron/status` work through the NeevCloud domain.
2. In Vercel, update `NEXT_PUBLIC_API_BASE_URL` to the NeevCloud API domain.
3. Keep the same admin panel master key unless you intentionally rotate it.
4. Redeploy the frontend so server-side proxy routes use the new backend base URL.
5. Disable or stop the Render backend after NeevCloud cron status and scheduler
   logs look healthy.

## 7. Deploy Updates Later

For later backend releases:

```bash
cd /srv/news_automation
git pull
npm ci
pm2 restart gautam-news-bot --update-env
curl http://127.0.0.1:3000/api/v1/health
```

Review PM2 logs after every restart:

```bash
pm2 logs gautam-news-bot
```

## Rollback

If the NeevCloud backend fails during cutover:

1. Point Vercel `NEXT_PUBLIC_API_BASE_URL` back to the Render backend domain.
2. Redeploy the frontend.
3. Re-enable the Render backend if it was stopped.
4. Stop or disable the NeevCloud PM2 process until the issue is fixed.

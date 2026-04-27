# Redeploy Checklist

Use this checklist to redeploy the backend on Render, the frontend on Vercel, and confirm the database on Supabase.

## 1) Backend on Render

- [ ] Push the latest commit to the branch connected to Render.
- [ ] Open the backend service in Render.
- [ ] Verify environment variables:
  - [ ] `DB_DIALECT`
  - [ ] `DATABASE_URL` or `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME`
  - [ ] `MASTER_API_KEY`
  - [ ] `GEMINI_API_KEY`
  - [ ] `API_CORS_ORIGINS`
  - [ ] `SCHEDULER_ENABLED=true`
  - [ ] `AI_SCHEDULER_ENABLED=true`
- [ ] If using Supabase Postgres, set:
  - [ ] `DB_DIALECT=postgres`
  - [ ] `DATABASE_URL=postgresql://...`
  - [ ] `DB_SSL_MODE=require`
- [ ] Trigger a manual deploy on Render.
- [ ] Wait for the service to finish booting.
- [ ] Verify health and status endpoints:
  - [ ] `/api/v1/health`
  - [ ] `/api/v1/cron/status`
  - [ ] `/api/v1/ai/cron/status`
  - [ ] `/api/v1/news/grouped`

## 2) Frontend on Vercel

- [ ] Open the Vercel project.
- [ ] Confirm the project root is set to `frontend`.
- [ ] Verify environment variables:
  - [ ] `NEXT_PUBLIC_API_BASE_URL`
  - [ ] `ADMIN_PANEL_MASTER_API_KEY`
  - [ ] `ADMIN_PANEL_PASSWORD`
  - [ ] `ADMIN_PANEL_SESSION_SECRET`
- [ ] Redeploy the Vercel project.
- [ ] Confirm the dashboard loads without errors.
- [ ] Confirm the status card shows:
  - [ ] Backend API: Connected
  - [ ] Database: Connected

## 3) Supabase

- [ ] Confirm the backend is using the Supabase connection string.
- [ ] Confirm Supabase SSL is enabled.
- [ ] Verify the database schema exists.
- [ ] Confirm retention and cleanup jobs are working.
- [ ] Check that old rows are being removed according to retention rules.
- [ ] Confirm the dashboard no longer shows the database as unavailable.

## 4) Post-deploy verification

- [ ] Open the live site.
- [ ] Refresh the dashboard and confirm the status cards are correct.
- [ ] Check one RSS-fed article and one AI-rewritten article.
- [ ] Confirm article images load correctly.
- [ ] Confirm cron status updates appear.
- [ ] Confirm scheduler logs are being written.

## 5) If anything fails

- [ ] Check Render logs for backend startup or DB connection errors.
- [ ] Check Vercel logs for frontend environment or API fetch errors.
- [ ] Check Supabase network and connection settings.
- [ ] Re-run the deployment after fixing the failing env var or schema issue.

## 6) Recommended order

1. Update environment variables.
2. Redeploy backend on Render.
3. Verify backend health.
4. Redeploy frontend on Vercel.
5. Verify the dashboard.
6. Confirm Supabase connectivity and cleanup jobs.

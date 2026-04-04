# MySQL Production Checklist

## Before Migration

1. Create a dedicated MySQL user for this app. Do not use `root`.
2. Create the production database separately from staging/dev.
3. Restrict MySQL network access to the app server only.
4. Enable automatic backups before first production deploy.
5. Confirm the server timezone and app timezone assumptions.

## Security

1. Use a strong password for the app DB user.
2. Grant only required privileges on `gautam_news_bot`.
3. Deny public internet access to port `3306` if possible.
4. Use private networking, firewall rules, or security groups.

## Backups

1. Schedule daily logical backups with `mysqldump` or managed backups.
2. Keep at least 7-14 days of retention.
3. Test one restore before go-live.
4. Store backups off-server.

## Performance

1. Confirm InnoDB is enabled.
2. Monitor connection counts and slow queries.
3. Watch table growth for:
   - `fetched_news`
   - `ai_news_rewrites`
   - `scheduler_runs`
4. Add archival/cleanup rules later if data grows quickly.

## Validation Queries

Run these after deployment:

```sql
SHOW DATABASES;
USE gautam_news_bot;
SHOW TABLES;
SELECT COUNT(*) AS fetched_news_count FROM fetched_news;
SELECT COUNT(*) AS ai_rewrites_count FROM ai_news_rewrites;
SELECT COUNT(*) AS scheduler_runs_count FROM scheduler_runs;
```

## Rollback Safety

1. Keep a fresh backup before schema changes.
2. Test schema upgrades in staging first.
3. Avoid destructive manual changes directly in production.

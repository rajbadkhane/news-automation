# Admin API Commands

Replace:

- `https://api.example.com` with your production API domain
- `YOUR_MASTER_API_KEY` with your private master key

## 1. Create A New Client

Use this for real client websites that should receive only your final AI-modified published news.

```bash
curl -X POST "https://api.example.com/api/v1/admin/clients" \
  -H "x-api-key: YOUR_MASTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Client One",
    "allowed_origins": ["https://client-one.com", "https://www.client-one.com"],
    "allowed_scopes": ["delivery:read", "cron:read"],
    "quota_limit": 5000,
    "quota_window": "day",
    "notes": "Paid plan"
  }'
```

The response returns:

- the client record
- the client API key

Store the returned client API key securely. You will not be able to recover the plain key later unless you rotate it.

## 2. List Clients

```bash
curl "https://api.example.com/api/v1/admin/clients" \
  -H "x-api-key: YOUR_MASTER_API_KEY"
```

## 3. Disable A Client

```bash
curl -X PATCH "https://api.example.com/api/v1/admin/clients/CLIENT_ID" \
  -H "x-api-key: YOUR_MASTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "is_active": false,
    "notes": "Disabled for non-payment"
  }'
```

## 4. Re-enable A Client

```bash
curl -X PATCH "https://api.example.com/api/v1/admin/clients/CLIENT_ID" \
  -H "x-api-key: YOUR_MASTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "is_active": true,
    "notes": "Re-enabled"
  }'
```

## 5. Change Client Origins, Scopes, Or Quota

```bash
curl -X PATCH "https://api.example.com/api/v1/admin/clients/CLIENT_ID" \
  -H "x-api-key: YOUR_MASTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "allowed_origins": ["https://new-client-domain.com"],
    "allowed_scopes": ["delivery:read"],
    "quota_limit": 10000,
    "quota_window": "month",
    "notes": "Plan upgraded"
  }'
```

## 6. Rotate A Client Key

```bash
curl -X POST "https://api.example.com/api/v1/admin/clients/CLIENT_ID/rotate-key" \
  -H "x-api-key: YOUR_MASTER_API_KEY"
```

This returns a new client API key. Share the new key securely with the client and invalidate the old one immediately.

## 7. View Usage Logs

```bash
curl "https://api.example.com/api/v1/admin/usage?limit=50" \
  -H "x-api-key: YOUR_MASTER_API_KEY"
```

## 8. List AI Rewrites By Publication Status

```bash
curl "https://api.example.com/api/v1/admin/ai/rewrites?status=draft&limit=20" \
  -H "x-api-key: YOUR_MASTER_API_KEY"
```

## 9. Publish An AI Rewrite For Client Delivery

```bash
curl -X POST "https://api.example.com/api/v1/admin/ai/rewrites/REWRITE_ID/publish" \
  -H "x-api-key: YOUR_MASTER_API_KEY"
```

## 10. Unpublish An AI Rewrite

```bash
curl -X POST "https://api.example.com/api/v1/admin/ai/rewrites/REWRITE_ID/unpublish" \
  -H "x-api-key: YOUR_MASTER_API_KEY"
```

## 11. View Admin Audit Logs

```bash
curl "https://api.example.com/api/v1/admin/audit-logs?limit=50" \
  -H "x-api-key: YOUR_MASTER_API_KEY"
```

## Recommended Scope Sets

Read-only client:

```json
["delivery:read", "cron:read"]
```

Client websites that should consume the cron-aligned published feed can work with only:

```json
["delivery:read"]
```

Do not give normal paying clients these internal scopes unless you explicitly want that:

```json
["news:read", "feeds:read", "sync:write", "ai:read", "ai:write", "cron:write", "logs:read"]
```

Content sync client:

```json
["delivery:read", "news:read", "feeds:read", "sync:write", "ai:read", "cron:read"]
```

Internal ops client:

```json
["delivery:read", "news:read", "feeds:read", "sync:write", "cron:read", "cron:write", "ai:read", "ai:write", "logs:read"]
```

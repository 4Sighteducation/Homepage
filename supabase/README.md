# Supabase Edge Functions (Homepage)

## staff-admin-cache
Caches Knack records for staff admin report pages.

### Secrets (Supabase Project)
- `SB_URL`
- `SB_SERVICE_ROLE_KEY`
- `KNACK_APP_ID`
- `KNACK_API_KEY`
- `KNACK_API_URL` (optional, default `https://api.knack.com/v1`)
- `CACHE_TTL_MINUTES` (set to `30`)

### Deployment
1. Deploy the function:
   - `supabase functions deploy staff-admin-cache`
2. Schedule a trigger (optional) in Supabase dashboard:
   - Frequency: every 30 minutes
   - Payload: `{ "action": "reportProfilesStudent", "cacheKey": "warmup", "knackObject": "object_6", "recordId": "example-id" }`

### Cache Table
Apply the migration in `supabase/migrations/20260114_staff_admin_cache.sql`.

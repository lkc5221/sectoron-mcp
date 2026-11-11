# Daily topic digest — implementation gate

Status: **schema draft only; no migration applied; no notification enabled.**

## Current supported preview
The MCP tool `preview_daily_topic_digest` is read-only and searches the recent WordPress RSS feed for `semiconductors` and `ai_datacenters`. The RSS feed is not a full archive and may omit articles if publication volume exceeds its window.

## Delivery decision required
Confirm the delivery channel (email vs ChatGPT scheduled message), delivery time in JST, and subscription entrypoint before adding an active scheduler or subscription endpoint. The schema draft assumes opt-in email and must be revised if the channel differs.

## Safety requirements
- Explicit opt-in, verified destination (double opt-in for email), unsubscribe and delete workflow.
- Never activate an unverified subscriber; no unsolicited delivery.
- Authenticate and rate-limit subscription mutations; hash one-time confirmation and unsubscribe tokens, expire confirmation tokens, and avoid logging email addresses.
- D1 migration review and backup before applying; secrets via Cloudflare bindings, not repository.
- Daily JST run uses a durable deduplication key per subscriber/day. Avoid duplicates on retry and concurrent runs; persist send outcome and handle uncertain provider responses without blindly resending.
- Store article URLs in delivery history and only send newly published, matching articles since the last successful delivery. Define a first-run lookback and a no-news policy.
- Test consent, duplicates, missing RSS articles, provider failures, and unsubscribe before enabling Cron.
- Existing MCP search endpoints remain read-only and independent of subscription functionality.

## Rollout
1. Confirm channel and time.
2. Implement opt-in and verified subscriber management, with tests.
3. Implement digest collection, idempotent delivery and provider integration, with tests.
4. Configure D1 and secrets in staging, run dry-run tests.
5. Deploy behind a disabled feature flag, then activate only after an explicit go-live decision.

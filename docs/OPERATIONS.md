# Clovair Mail operations

## Deployment and authentication

- Account: `5d286664ee0a1f7d2ed43aeb5de4d36a` (`cozy-lounge@naver.com`).
- Workers Paid was verified in the account dashboard on 2026-10-08 KST. No plan purchase or upgrade was performed.
- Worker: `agentic-inbox`; web hostname: `mails.clovair.dev`.
- R2: `agentic-inbox`; D1: `agentic-inbox-auth` (`e8b2a980-ddae-4d5b-93b6-e104ef9fd1fd`).
- Always use `npm run cf -- ...`: it clears inherited credentials/API proxy and pins the account. OAuth credentials stay in ignored `.wrangler/auth`. The separate cf profile is `clovair`; global environment tokens override that profile unless explicitly removed.
- Better Auth replaces Access at the user's request. No public signup. `admin@clovair.dev` is the initial administrator; use **내 계정** to change its password and **팀원 관리** to create members. Initial passwords are not stored in this repository.
- All team members can use every mailbox. Only admins can create or manage users through Better Auth's admin API. Removing/revoking sessions is effective immediately (cookie caching is disabled).
- Do not remove `BETTER_AUTH_SECRET` during updates. Keep the same secret for rolling deployments. Rotating it invalidates current cookies. Store it as a Worker secret, never a plain variable.

## Mail routing: current and proposed

On 2026-10-08 KST, after explicit approval, only `ggm@clovair.dev` was changed from direct Gmail forwarding to Worker `agentic-inbox` (rule `1332fd772bd8402782d3fa7d8380dd76`). The Worker saves the message and forwards it to `gjwnsan9420@gmail.com`. `payments`, `tech`, and `admin` still forward directly to Gmail. MX is unchanged and catch-all stays disabled. The ggm mailbox registry was checked in R2 before this change. External delivery verification is pending the user's fresh test message.

The Worker now stores each message using Cloudflare's actual SMTP envelope recipient (`event.to`), not the visible MIME To header. BCC-only and forwarded messages therefore do not select an unrelated mailbox. Addresses are case normalized, but plus tags are not merged and arbitrary aliases are not invented. Only the four configured addresses are enabled. Unprovisioned allowed mailboxes cause a delivery error instead of silent loss.

`INBOUND_FORWARDING` configures the four exact addresses to also forward to the existing verified Gmail destination. The Worker attempts Gmail forwarding even when app storage fails. Either failure is surfaced to Email Routing. Partial success is possible and a later retry can duplicate a successful copy; exactly-once delivery is not implemented. Gmail state and sent replies are not synchronized back to the app.

Before cutover:

1. Approve a dedicated test recipient and the external sender/destination. Add a test mailbox and exact routing/forwarding configuration temporarily, or use an approved subdomain. Do not alter the four live rules for the test.
2. Verify external inbound delivery, BCC, forwarding, attachments, new outbound mail, replies and sender selection. Confirm both app and Gmail copies. No real mail is sent without approved recipients.
3. User enters `DISCORD_WEBHOOK_URL` with `npm run cf -- secret put DISCORD_WEBHOOK_URL` or the dashboard, then approves the channel and test notification. Verify the message contains only `New mail: <mailbox address>`.
4. Confirm `AUTO_DRAFT_ENABLED=false`. Mock tests verify no incoming-mail AI calls, no notification before storage, and Discord failure isolation.
5. Show a diff of all four individual rules: **forward to Gmail → send to agentic-inbox Worker**. Individual rules take precedence over catch-all. Obtain approval, then change only those four actions. No MX change is expected when retaining Cloudflare Email Routing.
6. Roll back by restoring the four Gmail-forward actions. Leave app data intact.

Catch-all requires a separately approved design: exact registered recipients go to their mailboxes, unknown recipients go to a dedicated shared catch-all mailbox. The fallback is implemented using CATCH_ALL_MAILBOX=etc@clovair.dev, with the SMTP envelope recipient stored separately from MIME To and displayed in the message. Unknown addresses in DOMAINS go to etc; provisioned addresses keep their mailbox. Missing configured mailboxes fail instead of silently misfiling mail. Catch-all routing remains disabled pending explicit approval. Unknown addresses do not forward to Gmail.

## Backup and recovery

Three independent stores require protection; a code rollback is not a data restore.

### Authentication (D1)

Export periodically to an encrypted, access-controlled location outside Git:

```bash
npm run cf -- d1 export AUTH_DB --remote --output /secure/backup/auth.sql
npm run cf -- d1 time-travel info AUTH_DB
```

D1 Time Travel on Paid covers the previous 30 days. During an approved recovery window, identify a timestamp/bookmark and run `npm run cf -- d1 time-travel restore AUTH_DB --timestamp <UTC timestamp>`. This rolls back users and sessions too; revoke affected sessions afterward. An SQL export can also be imported into a **new** D1 database with `d1 execute --remote --file`, verified, and then bound as AUTH_DB. Do not blindly import over a live database.

### Mail bodies, folders and metadata (Durable Objects)

Mailbox data is SQLite inside each `MailboxDO`, addressed by the exact mailbox ID. Cloudflare provides point-in-time recovery for the prior 30 days. Preserve the Worker/class/namespace mapping; do not delete Durable Object namespaces.

Recovery requires a maintenance deployment using `ctx.storage.getBookmarkForTime(timestamp)` and `ctx.storage.onNextSessionRestoreBookmark(bookmark)`, followed by `ctx.abort()` for that mailbox. Pause writes/routing for the affected mailbox first, preserve a current bookmark, restore, and verify mailbox counts, threads and attachment references before resuming. These maintenance methods are not exposed as public app routes. There is currently no portable full-mailbox export/import or scheduled backup job; implementing and rehearsing one remains necessary for long-term independent retention.

### Attachments and mailbox registry (R2)

Back up **both** `attachments/` and `mailboxes/` prefixes from `agentic-inbox`, including original object keys and metadata, to a separate access-controlled destination. A private S3-compatible backup tool can perform this with bucket-scoped credentials supplied by the owner. Preserve deleted objects in backup; do not use a deletion-propagating sync as the only backup. R2 alone is not an independent backup, and Gmail copies do not cover app folders, sent mail or drafts.

Restore the mailbox registry and referenced attachments at a compatible snapshot time with the Durable Object restore. Verify hashes and test attachment downloads using an approved test mailbox. Do not delete originals until recovery validation succeeds. No production restore or backup schedule has been executed yet.

References:
- https://developers.cloudflare.com/d1/reference/time-travel/
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/


2026-10-08 reception investigation: ggm inbox API returned HTTP 200 with totalCount 0. The Naver test at 02:51:53 KST is recorded as a forwarding action in Email Routing; the Worker email-event log query returned zero events. A fresh test is pending to distinguish routing propagation from worker delivery. DISCORD_WEBHOOK_URL has now been registered as a Worker secret.

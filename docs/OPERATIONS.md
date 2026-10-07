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

## Live mail routing (2026-10-08 KST)

All four original address rules (ggm, payments, tech, admin) and catch-all now target `agentic-inbox`, following operator approval. Root receiving MX records were not changed. The Worker stores incoming mail and forwards only those four exact addresses to `gjwnsan9420@gmail.com`. New mailboxes and unknown addresses do not forward to Gmail.

SMTP envelope recipient (`event.to`) determines storage, including BCC. Registered recipients use their own mailbox; other clovair.dev recipients go to etc. MIME To is retained separately. Plus tags are not automatically collapsed. Creating a mailbox queues a durable move of existing etc messages with that exact envelope recipient. Batches copy successfully before deleting source rows, preserve attachment objects, and retry failures. Moves do not send duplicate Discord alerts. Messages predating envelope metadata cannot be reliably reclassified automatically.

The home page supports adding mailboxes within clovair.dev. All authenticated team members share mailbox access. New mail and replies support choosing a provisioned sender and up to 10 attachments totaling 3MB. Draft attachment storage is not supported. Cloudflare sending onboarding is active with DNS configured (cf-bounce MX/SPF/DKIM and DMARC); no additional paid product was purchased. The previous unconfigured sending domain rejected non-verified destinations.

Discord uses subject/body-preview embeds with mentions disabled, no attachments, and a mailbox link. This replaces the earlier address-only policy at the operator's request. Worker fetch uses manual redirect mode: the earlier error redirect mode failed in the runtime. Actual inbound events after deployment logged `Discord notification accepted`. Notifications remain best effort, with no durable retry queue; failed notifications do not block mailbox storage. AUTO_DRAFT_ENABLED remains false.

Verification: etc reply to Gmail with BCC asd123@clovair.dev was accepted, BCC arrived in etc, and adding asd123 moved that existing message into its new mailbox. Original Naver inbound tests were visible in ggm and etc. Gmail inbox confirmed both tech sender-selection and etc reply test messages. Naver inbox confirmed `Re: asd2` from etc@clovair.dev to heojunmoo@naver.com at 03:25 KST. Browser attachment end-to-end testing remains blocked by the extension's file URL permission. The actual provider Message-ID is stored for future reply threading. Reply quotes remove CSS/script content.

Rollback routing by restoring the original four Gmail-forward actions and disabling catch-all if required. Keep app data intact. Gmail forwarding is attempted even if storage fails; partial success and duplicates on retries are possible. Gmail folders/read state and sent replies are not synchronized to the app.

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

Recovery requires a maintenance deployment using `ctx.storage.getBookmarkForTime(timestamp)` and `ctx.storage.onNextSessionRestoreBookmark(bookmark)`, followed by `ctx.abort()` for that mailbox. Pause writes/routing for the affected mailbox first, preserve a current bookmark, restore, and verify mailbox counts, threads and attachment references before resuming. These maintenance methods are not exposed as public app routes. An administrator can download a JSON snapshot at `/api/v1/mailboxes/<email>/backup` while logged in. It includes folders, emails, attachment metadata and mailbox settings, but not R2 attachment bytes. For restoration, import the snapshot into an isolated MailboxDO with `importRecipientBatch`, restore matching R2 objects and registry, verify counts/content, then perform a separately reviewed production cutover. There is no public restore endpoint or scheduled independent backup job.

### Attachments and mailbox registry (R2)

Back up **both** `attachments/` and `mailboxes/` prefixes from `agentic-inbox`, including original object keys and metadata, to a separate access-controlled destination. A private S3-compatible backup tool can perform this with bucket-scoped credentials supplied by the owner. Preserve deleted objects in backup; do not use a deletion-propagating sync as the only backup. R2 alone is not an independent backup, and Gmail copies do not cover app folders, sent mail or drafts.

Restore the mailbox registry and referenced attachments at a compatible snapshot time with the Durable Object restore. Verify hashes and test attachment downloads using an approved test mailbox. Do not delete originals until recovery validation succeeds. D1 was exported to a protected ignored local backup on 2026-10-08 and restored into an isolated SQLite file; integrity_check passed and one user was preserved. No production restore or backup schedule has been executed. Local backups must be copied to a separate protected destination for disaster recovery.

References:
- https://developers.cloudflare.com/d1/reference/time-travel/
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/


The administrator-only etc snapshot was downloaded and restored into an isolated local SQLite database on 2026-10-08: four emails, zero attachments, integrity_check=ok. Authentication backup restore also passed. These are local rehearsal copies, not scheduled offsite backups.

Deployment 03edac7f-0718-4426-96cd-f20b12833c20 contains recipient migration, snapshot export, actual outbound Message-ID storage and quote cleanup. Validation: 76 tests, typecheck and production build passed.

Round-trip Naver replies revealed a pre-existing threading bug: incoming References/Message-ID strings were used directly as internal conversation IDs. Inbound delivery now resolves these IDs to the existing stored thread. Migration 11 reconnects existing split conversations whose thread ID matches an original Message-ID. Sent messages using a different selected sender are excluded when choosing the latest incoming message for another reply.

Final deployed code commit: e69ba9c8f166908e496626cd96c7f44044504b07; Cloudflare version: 283e7f50-6b9a-4261-808b-0be237555e79. After deployment, the original Naver message, outgoing etc reply and returning Naver reply appeared together as one three-message conversation.

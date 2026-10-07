<div align="center">
  <h1>Agentic Inbox</h1>
  <p><em>A self-hosted email client with an AI agent, running entirely on Cloudflare Workers</em></p>
</div>

Agentic Inbox lets you send, receive, and manage emails through a modern web interface -- all powered by your own Cloudflare account. Incoming emails arrive via [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/), each mailbox is isolated in its own [Durable Object](https://developers.cloudflare.com/durable-objects/) with a SQLite database, and attachments are stored in [R2](https://developers.cloudflare.com/r2/).

An **AI-powered Email Agent** can read your inbox, search conversations, and draft replies -- built with the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) and [Workers AI](https://developers.cloudflare.com/workers-ai/).

![Agentic Inbox screenshot](./demo_app.png)


Read the blog post to learn more about Cloudflare Email Service and how to use it with the Agents SDK, MCP, and from the Wrangler CLI: [Email for Agents](https://blog.cloudflare.com/email-for-agents/).

## Clovair deployment

This fork uses Better Auth email/password login instead of Cloudflare Access.
The web app is configured for `https://mails.clovair.dev`. All authenticated team
members can access every mailbox. Only administrators can create login accounts
from **팀원 관리**. Public signup is disabled. Password changes are available in
**내 계정**; login sessions last up to 30 days and can be ended with logout.

Deployment uses Wrangler and `wrangler.jsonc`, not `cf deploy`. Run commands through
`npm run cf -- ...` to use this directory's OAuth login and the pinned Clovair account,
without inheriting the global Cloudflare API token or API proxy.

```bash
npm ci
npm run cf -- whoami
npm run cf -- d1 migrations apply AUTH_DB --remote
npm run auth:bootstrap -- --remote
npm run deploy
```

The bootstrap command privately prompts for the initial administrator password,
stores only a Better Auth password hash, and does not reset an existing account.
Set `BETTER_AUTH_SECRET` as a Worker secret and `BETTER_AUTH_URL` to the HTTPS app
origin. Local development requires a separate ignored `.dev.vars` with these two
values (`BETTER_AUTH_URL=http://localhost:5173`) and local D1 migrations.

Do **not** enable catch-all or replace existing Gmail routing during app deployment.
Provision the four configured mailboxes first. Once a test address is approved and
verified, present the individual rule changes for approval before switching delivery.
See [operations and recovery](docs/OPERATIONS.md) for the rollout and backup procedure.

## Features

- **Full email client** — Send and receive emails via Cloudflare Email Routing with a rich text composer, reply/forward threading, folder organization, search, and attachments
- **Per-mailbox isolation** — Each mailbox runs in its own Durable Object with SQLite storage and R2 for attachments
- **Built-in AI agent** — Side panel with 9 email tools for reading, searching, drafting, and sending
- **Opt-in auto-draft** — Automatic AI processing of incoming mail is disabled by default; interactive drafting remains available
- **Discord previews** — New-mail embeds include the mailbox, subject, a bounded body preview, and an inbox link; mentions are disabled and attachments are excluded
- **Configurable and persistent** — Custom system prompts per mailbox, persistent chat history, streaming markdown responses, and tool call visibility

## Stack

- **Frontend:** React 19, React Router v7, Tailwind CSS, Zustand, TipTap, `@cloudflare/kumo`
- **Backend:** Hono, Cloudflare Workers, Durable Objects (SQLite), R2, Email Routing
- **AI Agent:** Cloudflare Agents SDK (`AIChatAgent`), AI SDK v6, Workers AI (`@cf/moonshotai/kimi-k2.5`), `react-markdown` + `remark-gfm`
- **Auth:** Better Auth, private email/password accounts, D1 sessions, administrator-only account creation

## Getting Started

```bash
npm install
npm run dev
```

### Configuration

1. Set your domain in `wrangler.jsonc`
2. Create an R2 bucket named `agentic-inbox`: `wrangler r2 bucket create agentic-inbox`

#### Automatic drafts

`AUTO_DRAFT_ENABLED` defaults to `false` in `wrangler.jsonc`. When it is unset or
false, incoming emails are saved without triggering AI reads, scans, or draft
generation. The agent's incoming-email endpoint also enforces this setting.
Manually requested AI chat and drafting still work. Existing drafts are retained.
To opt back in, explicitly set this variable to boolean `true` or string `"true"`.

#### Discord notifications (optional)

Create an incoming webhook in the Discord **text channel** approved to receive
mail subject and body previews. Store the copied URL as a Worker secret, using the
Cloudflare dashboard or `wrangler secret put DISCORD_WEBHOOK_URL`. For local
development only, put it in the ignored `.dev.vars` file. Never commit the URL:
it contains a token that grants permission to post to that Discord channel.

When configured, each successfully stored incoming email sends a Clovair Mail
embed containing the mailbox address, subject (up to 256 characters), plain-text
body preview (up to 700 characters), received time, and a link to the inbox.
The operator explicitly requested subject/body previews on 2026-10-08, replacing
the original address-only policy. Sender fields, attachments and raw headers are
not sent. Mentions are disabled. This webhook receives notifications for all
mailboxes handled by the Worker.

Only HTTPS URLs on `discord.com` matching `/api/webhooks/ID/TOKEN` or
`/api/v10/webhooks/ID/TOKEN` are accepted. Query strings, fragments, custom ports,
and redirects are rejected. Forum/media channels and thread destinations are not
supported. Omit or remove the secret to disable notifications.

Notifications run in the background **after email storage**, independently of
auto-drafting. They are best-effort, have a five-second timeout, and are not
retried automatically. A Discord outage or rate limit never rejects a stored
email, but the alert can be missed. Failures log only generic messages or HTTP
status codes, never webhook tokens or email data. A retried upstream mail
delivery may result in a duplicate message and notification, as before.

### Verification

Use Node.js 24 or later for the dependency-free test runner.

```bash
npm test
npm run typecheck
npm run build
```

The tests mock network requests and Cloudflare bindings; they do not send real
emails or Discord messages.

### Deploy

```bash
npm run deploy
```

## Prerequisites

- Cloudflare account with a domain
- [Email Routing](https://developers.cloudflare.com/email-routing/) enabled for receiving
- [Email Service](https://developers.cloudflare.com/email-service/) enabled for sending
- [Workers AI](https://developers.cloudflare.com/workers-ai/) enabled (for the agent)
- Better Auth signing secret and migrated D1 authentication database

Any authenticated team member can access all mailboxes. Storage separation between
mailboxes does not provide employee-level privacy. The API, attachments, agent
connections and MCP endpoint require a valid Better Auth session; cookie-authenticated
writes and WebSockets also require the same Origin. External MCP clients need an
explicit future authentication integration; the former Access token is not accepted.

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser    │────>│  Hono Worker     │────>│  MailboxDO      │
│  React SPA   │     │  (API + SSR)     │     │  (SQLite + R2)  │
│  Agent Panel │     │                  │     └─────────────────┘
└──────┬───────┘     │  /agents/* ──────┼────>┌─────────────────┐
       │             │                  │     │  EmailAgent DO  │
       │ WebSocket   │                  │     │  (AIChatAgent)  │
       └─────────────┤                  │     │  9 email tools  │
                     │                  │────>│  Workers AI     │
                     └──────────────────┘     └─────────────────┘
```

## License

Apache 2.0 -- see [LICENSE](LICENSE).

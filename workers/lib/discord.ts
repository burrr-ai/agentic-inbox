import { MailboxSettingsSchema, excludesDiscordSubject } from "../../shared/discord-filters";
// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

const NOTIFICATION_TIMEOUT_MS = 5_000;

function webhookUrl(value: string): URL | null {
	try {
		const url = new URL(value);
		// Only Discord's incoming-webhook endpoint is a valid destination. Do not
		// allow arbitrary hosts, query parameters, credentials, or redirects.
		if (
			url.protocol !== "https:" || url.hostname !== "discord.com" ||
			url.port || url.username || url.password || url.search || url.hash ||
			!/^\/api(?:\/v10)?\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname)
		) return null;
		url.searchParams.set("wait", "true");
		return url;
	} catch {
		return null;
	}
}

/**
 * Best-effort notification after inbox storage. Optional previews were explicitly
 * enabled by the operator; sender, attachments and raw headers are not included.
 * Failures must not reject mail delivery, and secrets must never enter logs.
 */
export async function notifyDiscordNewMail(
	env: { DISCORD_WEBHOOK_URL?: string; BETTER_AUTH_URL?: string },
	mailboxAddress: string,
	preview?: { subject: string; text: string },
): Promise<void> {
	if (!env.DISCORD_WEBHOOK_URL) return;
	const url = webhookUrl(env.DISCORD_WEBHOOK_URL);
	if (!url) {
		console.warn("Discord notification skipped: invalid webhook configuration");
		return;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), NOTIFICATION_TIMEOUT_MS);
	try {
		const address = mailboxAddress
			.replace(/[\x00-\x1f\x7f]/g, "")
			.slice(0, 320)
			.replace(/[\\`*_~|[\]<>]/g, "\\$&");
		const clean = (value: string, limit: number) => {
			const text = value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").trim();
			return text.length > limit ? text.slice(0, limit - 1) + "…" : text;
		};
		let inboxUrl: string | undefined;
		try {
			const origin = new URL(env.BETTER_AUTH_URL || "");
			if (origin.protocol === "https:") inboxUrl = `${origin.origin}/mailbox/${encodeURIComponent(mailboxAddress)}/emails/inbox`;
		} catch { /* Link is optional when no app origin is configured. */ }
		const payload = preview ? {
			username: "Clovair Mail",
			allowed_mentions: { parse: [] },
			embeds: [{
				author: { name: "📬 새 메일이 도착했습니다" },
				title: clean(preview.subject, 256) || "(제목 없음)",
				description: clean(preview.text, 700) || "본문 미리보기가 없습니다.",
				color: 0x5865f2,
				url: inboxUrl,
				fields: [{ name: "받은 메일함", value: address, inline: true },
					...(inboxUrl ? [{ name: "웹메일", value: `[수신함 열기](${inboxUrl})`, inline: true }] : [])],
				footer: { text: "Clovair · 팀 공용 메일" },
				timestamp: new Date().toISOString(),
			}],
		} : { content: `New mail: ${address}`, allowed_mentions: { parse: [] }, flags: 4 };
		const response = await fetch(url.toString(), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			redirect: "manual",
			signal: controller.signal,
		});
		if (!response.ok) {
			console.warn("Discord notification failed with HTTP status", response.status);
		}
		// wait=true confirms storage on Discord. We do not need its message body.
		await response.body?.cancel().catch(() => {});
		if (response.ok) console.info("Discord notification accepted");
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		const kind = controller.signal.aborted ? "timeout"
			: /redirect/i.test(message) ? "redirect"
			: /network|connection|socket|fetch failed|failed to fetch/i.test(message) ? "network"
			: /different request|I\/O|context/i.test(message) ? "request-context"
			: /ssl|tls|certificate/i.test(message) ? "tls" : "other";
		console.warn("Discord delivery error category", kind);
		// Fetch errors can contain the URL/token. Log only a constant message.
		console.warn("Discord notification failed; incoming email remains stored");
	} finally {
		clearTimeout(timeout);
	}
}

/** Read mailbox-specific policy after storage, isolated from delivery/forwarding. */
export async function notifyDiscordForMailbox(
	env: { DISCORD_WEBHOOK_URL?: string; BETTER_AUTH_URL?: string; BUCKET: R2Bucket },
	mailboxAddress: string,
	preview: { subject: string; text: string },
): Promise<void> {
	if (!env.DISCORD_WEBHOOK_URL) return;
	try {
		const obj = await env.BUCKET.get(`mailboxes/${mailboxAddress}.json`);
		const settings = MailboxSettingsSchema.parse(obj ? await obj.json() : {});
		if (excludesDiscordSubject(preview.subject, settings.discordSubjectExclusions || [])) return;
	} catch {
		// A settings outage must not silently suppress every notification.
		console.warn("Discord mailbox filter unavailable; sending notification");
	}
	await notifyDiscordNewMail(env, mailboxAddress, preview);
}

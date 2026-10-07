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
 * Best-effort notification after inbox storage. This deliberately accepts only
 * the mailbox address, never the message or any sender/content/attachment data.
 * Failures must not reject mail delivery, and secrets must never enter logs.
 */
export async function notifyDiscordNewMail(
	env: { DISCORD_WEBHOOK_URL?: string },
	mailboxAddress: string,
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
		const response = await fetch(url.toString(), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				content: `New mail: ${address}`,
				allowed_mentions: { parse: [] },
				flags: 4, // SUPPRESS_EMBEDS; never generate link previews.
			}),
			redirect: "error",
			signal: controller.signal,
		});
		if (!response.ok) {
			console.warn("Discord notification failed with HTTP status", response.status);
		}
		// wait=true confirms storage on Discord. We do not need its message body.
		await response.body?.cancel();
	} catch {
		// Fetch errors can contain the URL/token. Log only a constant message.
		console.warn("Discord notification failed; incoming email remains stored");
	} finally {
		clearTimeout(timeout);
	}
}

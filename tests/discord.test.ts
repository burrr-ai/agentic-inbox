import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { notifyDiscordNewMail } from "../workers/lib/discord.ts";

const webhook = "https://discord.com/api/webhooks/123456789/test-token";

describe("Discord new-mail notifications", () => {
	let fetchMock;
	let warn;
	beforeEach(() => {
		fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
		warn = mock.method(console, "warn", () => {});
	});
	afterEach(() => { mock.restoreAll(); mock.timers.reset(); });

	it("does nothing without a secret", async () => {
		await notifyDiscordNewMail({}, "inbox@example.com");
		assert.equal(fetchMock.mock.callCount(), 0);
	});
	it("sends only the mailbox address with mentions and previews disabled", async () => {
		await notifyDiscordNewMail({ DISCORD_WEBHOOK_URL: webhook }, "inbox@example.com");
		assert.equal(fetchMock.mock.callCount(), 1);
		const [url, init] = fetchMock.mock.calls[0].arguments;
		assert.equal(url, `${webhook}?wait=true`);
		assert.equal(init.method, "POST");
		assert.equal(init.redirect, "error");
		assert.ok(init.signal instanceof AbortSignal);
		assert.deepEqual(JSON.parse(init.body), {
			content: "New mail: inbox@example.com", allowed_mentions: { parse: [] }, flags: 4,
		});
	});
	it("accepts the official v10 webhook path", async () => {
		await notifyDiscordNewMail({ DISCORD_WEBHOOK_URL: webhook.replace("/api/", "/api/v10/") }, "inbox@example.com");
		assert.equal(fetchMock.mock.callCount(), 1);
	});
	for (const url of [
		"not-a-url", webhook.replace("https:", "http:"),
		webhook.replace("discord.com", "discord.com.evil.example"),
		webhook.replace("discord.com", "127.0.0.1"),
		webhook.replace("discord.com", "discord.com:8443"),
		webhook.replace("discord.com", "user:password@discord.com"),
		webhook.replace("/webhooks/", "/channels/"), webhook.replace("/api/", "/api/v9/"),
		`${webhook}/messages/1`, `${webhook}?thread_id=1`, `${webhook}#fragment`,
	]) {
		it(`rejects invalid destination ${url}`, async () => {
			await notifyDiscordNewMail({ DISCORD_WEBHOOK_URL: url }, "inbox@example.com");
			assert.equal(fetchMock.mock.callCount(), 0);
			assert.deepEqual(warn.mock.calls[0].arguments, ["Discord notification skipped: invalid webhook configuration"]);
		});
	}
	it("neutralizes control characters and Discord formatting", async () => {
		await notifyDiscordNewMail({ DISCORD_WEBHOOK_URL: webhook }, "<@everyone>\n**inbox**@example.com");
		const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
		assert.equal(body.content, "New mail: \\<@everyone\\>\\*\\*inbox\\*\\*@example.com");
		assert.deepEqual(body.allowed_mentions, { parse: [] });
	});
	for (const status of [302, 400, 429, 500]) {
		it(`does not throw or log response data for HTTP ${status}`, async () => {
			fetchMock.mock.mockImplementation(async () => new Response("private response", { status }));
			await notifyDiscordNewMail({ DISCORD_WEBHOOK_URL: webhook }, "inbox@example.com");
			assert.deepEqual(warn.mock.calls[0].arguments, ["Discord notification failed with HTTP status", status]);
		});
	}
	it("does not log fetch errors containing a secret URL", async () => {
		fetchMock.mock.mockImplementation(async () => { throw new Error(`failed to fetch ${webhook}`); });
		await notifyDiscordNewMail({ DISCORD_WEBHOOK_URL: webhook }, "inbox@example.com");
		assert.deepEqual(warn.mock.calls[0].arguments, ["Discord notification failed; incoming email remains stored"]);
	});
	it("aborts slow requests after five seconds", async () => {
		mock.timers.enable({ apis: ["setTimeout"] });
		fetchMock.mock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
			init.signal.addEventListener("abort", () => reject(new Error("aborted")));
		}));
		const result = notifyDiscordNewMail({ DISCORD_WEBHOOK_URL: webhook }, "inbox@example.com");
		mock.timers.tick(5_000);
		await result;
		assert.equal(fetchMock.mock.calls[0].arguments[1].signal.aborted, true);
	});
});

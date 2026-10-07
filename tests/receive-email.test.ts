import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { receiveEmail } from "../workers/index.ts";
import type { Env } from "../workers/types.ts";

const webhook = "https://discord.com/api/webhooks/123456789/test-token";
function mailEvent() {
	const raw = new TextEncoder().encode([
		"From: Private Sender <sender@example.org>",
		"To: inbox@example.com, other@example.org", "Cc: cc@example.org", "Bcc: bcc@example.org",
		"Subject: A confidential subject", "Message-ID: <message@example.org>",
		"Content-Type: text/plain; charset=utf-8", "", "A confidential body", "",
	].join("\r\n"));
	return { raw: new Blob([raw]).stream(), rawSize: raw.length };
}
function setup(overrides: Record<string, unknown> = {}) {
	const mailbox = { findThreadBySubject: mock.fn(async () => null), createEmail: mock.fn(async () => {}) };
	const agent = { fetch: mock.fn(async () => new Response("{}")) };
	const env = {
		BUCKET: { head: mock.fn(async () => ({})), put: mock.fn() },
		MAILBOX: { idFromName: mock.fn((id) => id), get: mock.fn(() => mailbox) },
		EMAIL_AGENT: { idFromName: mock.fn((id) => id), get: mock.fn(() => agent) },
		EMAIL_ADDRESSES: [], DISCORD_WEBHOOK_URL: webhook, ...overrides,
	};
	const tasks: Promise<unknown>[] = [];
	const ctx = { waitUntil: mock.fn((task) => tasks.push(task)) };
	return { env, ctx, tasks, mailbox, agent,
		receive: () => receiveEmail(mailEvent(), env as unknown as Env, ctx as unknown as ExecutionContext),
	};
}
describe("incoming mail behavior", () => {
	let fetchMock;
	beforeEach(() => {
		fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
		for (const method of ["warn", "log", "error"] as const) mock.method(console, method, () => {});
	});
	afterEach(() => mock.restoreAll());
	for (const flag of [undefined, false, "false"]) {
		it(`stores mail without contacting AI when flag is ${JSON.stringify(flag)}`, async () => {
			const s = setup({ AUTO_DRAFT_ENABLED: flag });
			await s.receive(); await Promise.all(s.tasks);
			assert.equal(s.mailbox.createEmail.mock.callCount(), 1);
			assert.equal(s.env.EMAIL_AGENT.get.mock.callCount(), 0);
			assert.deepEqual(JSON.parse(fetchMock.mock.calls[0].arguments[1].body), {
				content: "New mail: inbox@example.com", allowed_mentions: { parse: [] }, flags: 4,
			});
		});
	}
	it("preserves explicitly enabled AI drafting independently of Discord", async () => {
		const s = setup({ AUTO_DRAFT_ENABLED: true });
		await s.receive(); await Promise.all(s.tasks);
		assert.equal(s.agent.fetch.mock.callCount(), 1);
		assert.equal(fetchMock.mock.callCount(), 1);
	});
	it("only notifies after storage succeeds", async () => {
		const s = setup();
		let save;
		const saving = new Promise<void>((resolve) => {
			s.mailbox.createEmail.mock.mockImplementation(() => {
				resolve(); return new Promise<void>((done) => { save = done; });
			});
		});
		const received = s.receive(); await saving;
		assert.equal(fetchMock.mock.callCount(), 0);
		save(); await received; await Promise.all(s.tasks);
		assert.equal(fetchMock.mock.callCount(), 1);
	});
	it("does not notify for a failed save and keeps the delivery error", async () => {
		const s = setup();
		s.mailbox.createEmail.mock.mockImplementation(async () => { throw new Error("storage failed"); });
		await assert.rejects(s.receive(), /storage failed/);
		assert.equal(fetchMock.mock.callCount(), 0); assert.equal(s.tasks.length, 0);
	});
	for (const reason of ["missing mailbox", "disallowed recipient"]) {
		it(`does not notify for ${reason}`, async () => {
			const s = setup(reason === "disallowed recipient" ? { EMAIL_ADDRESSES: ["someone-else@example.com"] } : {});
			if (reason === "missing mailbox") s.env.BUCKET.head.mock.mockImplementation(async () => null);
			await s.receive();
			assert.equal(s.mailbox.createEmail.mock.callCount(), 0); assert.equal(fetchMock.mock.callCount(), 0);
		});
	}
	it("does not await Discord or fail mail delivery when Discord fails", async () => {
		const s = setup(); let fail;
		fetchMock.mock.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
		await s.receive();
		assert.equal(s.mailbox.createEmail.mock.callCount(), 1);
		fail(new Error("Discord unavailable"));
		assert.deepEqual(await Promise.all(s.tasks), [undefined]);
	});
	it("does not send a notification when the secret is absent", async () => {
		const s = setup({ DISCORD_WEBHOOK_URL: undefined });
		await s.receive(); await Promise.all(s.tasks);
		assert.equal(s.mailbox.createEmail.mock.callCount(), 1); assert.equal(fetchMock.mock.callCount(), 0);
	});
	it("notifies only the allowed selected mailbox, not other recipients", async () => {
		const s = setup({ EMAIL_ADDRESSES: ["other@example.org"] });
		await s.receive(); await Promise.all(s.tasks);
		assert.equal(JSON.parse(fetchMock.mock.calls[0].arguments[1].body).content, "New mail: other@example.org");
	});
	it("isolates synchronous AI binding failures from storage and Discord", async () => {
		const s = setup({ AUTO_DRAFT_ENABLED: true });
		s.env.EMAIL_AGENT.get.mock.mockImplementation(() => { throw new Error("agent unavailable"); });
		await s.receive(); await Promise.all(s.tasks);
		assert.equal(s.mailbox.createEmail.mock.callCount(), 1); assert.equal(fetchMock.mock.callCount(), 1);
	});
});

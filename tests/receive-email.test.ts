import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { receiveEmail } from "../workers/index.ts";
import type { Env } from "../workers/types.ts";

const webhook = "https://discord.com/api/webhooks/123456789/test-token";
function mailEvent(to = "inbox@example.com", includeTo = true) {
	const raw = new TextEncoder().encode([
		"From: Private Sender <sender@example.org>",
		...(includeTo ? ["To: inbox@example.com, other@example.org"] : []), "Cc: cc@example.org", "Bcc: bcc@example.org",
		"Subject: A confidential subject", "Message-ID: <message@example.org>",
		"Content-Type: text/plain; charset=utf-8", "", "A confidential body", "",
	].join("\r\n"));
	return { to, raw: new Blob([raw]).stream(), rawSize: raw.length };
}
function setup(overrides: Record<string, unknown> = {}) {
	const mailbox = { findThreadByMessageIds: mock.fn(async () => null), findThreadBySubject: mock.fn(async () => null), createEmail: mock.fn(async () => {}) };
	const agent = { fetch: mock.fn(async () => new Response("{}")) };
	const env = {
		BUCKET: { get: mock.fn(async () => null), head: mock.fn(async () => ({})), put: mock.fn() },
		MAILBOX: { idFromName: mock.fn((id) => id), get: mock.fn(() => mailbox) },
		EMAIL_AGENT: { idFromName: mock.fn((id) => id), get: mock.fn(() => agent) },
		EMAIL_ADDRESSES: [], DISCORD_WEBHOOK_URL: webhook, ...overrides,
	};
	const tasks: Promise<unknown>[] = [];
	const ctx = { waitUntil: mock.fn((task) => tasks.push(task)) };
	return { env, ctx, tasks, mailbox, agent,
		receive: (to = "inbox@example.com") => receiveEmail(mailEvent(to), env as unknown as Env, ctx as unknown as ExecutionContext),
	};
}
describe("incoming mail behavior", () => {
	let fetchMock;
	beforeEach(() => {
		fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
		for (const method of ["warn", "log", "error"] as const) mock.method(console, method, () => {});
	});
	afterEach(() => mock.restoreAll());
	it("reuses the stored conversation when an external reply references a provider Message-ID", async () => {
		const s = setup();
		s.mailbox.findThreadByMessageIds.mock.mockImplementation(async ids => ids.includes("sent@provider.test") ? "existing-conversation" : null);
		const raw = new TextEncoder().encode("From: sender@example.org\r\nTo: inbox@example.com\r\nSubject: Re: Test\r\nIn-Reply-To: <sent@provider.test>\r\nReferences: <original@example.org> <sent@provider.test>\r\n\r\nReply");
		await receiveEmail({ to: "inbox@example.com", raw: new Blob([raw]).stream(), rawSize: raw.length } as any, s.env as any, s.ctx as any);
		await Promise.all(s.tasks);
		assert.equal(s.mailbox.createEmail.mock.calls[0].arguments[1].thread_id, "existing-conversation");
	});
	it("excluded subjects still save mail while suppressing only Discord", async () => {
		const s = setup();
		s.env.BUCKET.get.mock.mockImplementation(async () => ({ json: async () => ({discordSubjectExclusions:["confidential"]}) }));
		await s.receive(); await Promise.all(s.tasks);
		assert.equal(s.mailbox.createEmail.mock.callCount(), 1);
		assert.equal(fetchMock.mock.callCount(), 0);
	});
	for (const flag of [undefined, false, "false"]) {
		it(`stores mail without contacting AI when flag is ${JSON.stringify(flag)}`, async () => {
			const s = setup({ AUTO_DRAFT_ENABLED: flag });
			await s.receive(); await Promise.all(s.tasks);
			assert.equal(s.mailbox.createEmail.mock.callCount(), 1);
			assert.equal(s.env.EMAIL_AGENT.get.mock.callCount(), 0);
			const payload = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
			assert.equal(payload.embeds[0].title, "A confidential subject");
			assert.equal(payload.embeds[0].description, "A confidential body");
			assert.equal(payload.embeds[0].fields[0].value, "inbox@example.com");
			assert.deepEqual(payload.allowed_mentions, { parse: [] });
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
			if (reason === "missing mailbox") await assert.rejects(s.receive(), /not provisioned/);
			else await s.receive();
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
		await s.receive("other@example.org"); await Promise.all(s.tasks);
		assert.equal(JSON.parse(fetchMock.mock.calls[0].arguments[1].body).embeds[0].fields[0].value, "other@example.org");
	});
	for (const recipient of ["bcc@example.org", "alias@example.org", "inbox+tag@example.com"]) {
		it(`routes envelope ${recipient} independently of MIME To`, async () => {
			const s = setup();
			await s.receive(recipient); await Promise.all(s.tasks);
			assert.equal(s.env.MAILBOX.idFromName.mock.calls[0].arguments[0], recipient);
		});
	}

	it("accepts BCC-only mail with no MIME To", async () => {
		const s = setup();
		await receiveEmail(mailEvent("inbox@example.com", false), s.env as unknown as Env, s.ctx as unknown as ExecutionContext);
		await Promise.all(s.tasks);
		assert.equal(s.mailbox.createEmail.mock.callCount(), 1);
	});

	it("isolates synchronous AI binding failures from storage and Discord", async () => {
		const s = setup({ AUTO_DRAFT_ENABLED: true });
		s.env.EMAIL_AGENT.get.mock.mockImplementation(() => { throw new Error("agent unavailable"); });
		await s.receive(); await Promise.all(s.tasks);
		assert.equal(s.mailbox.createEmail.mock.callCount(), 1); assert.equal(fetchMock.mock.callCount(), 1);
	});
	for (const withTo of [true, false]) {
		it(`stores unregistered envelope recipients in etc (MIME To: ${withTo})`, async () => {
			const s = setup({ DOMAINS: "clovair.dev", CATCH_ALL_MAILBOX: "etc@clovair.dev", EMAIL_ADDRESSES: ["ggm@clovair.dev", "etc@clovair.dev"] });
			s.env.BUCKET.head.mock.mockImplementation(async (key) => key === "mailboxes/etc@clovair.dev.json" ? {} : null);
			await receiveEmail(mailEvent("asdas@clovair.dev", withTo), s.env as unknown as Env, s.ctx as unknown as ExecutionContext);
			await Promise.all(s.tasks);
			assert.equal(s.env.MAILBOX.idFromName.mock.calls[0].arguments[0], "etc@clovair.dev");
			assert.equal(s.mailbox.createEmail.mock.calls[0].arguments[1].envelope_recipient, "asdas@clovair.dev");
			assert.equal(JSON.parse(fetchMock.mock.calls[0].arguments[1].body).embeds[0].fields[0].value, "etc@clovair.dev");
		});
	}
	it("keeps a provisioned alias in its own mailbox", async () => {
		const s = setup({ DOMAINS: "clovair.dev", CATCH_ALL_MAILBOX: "etc@clovair.dev", EMAIL_ADDRESSES: ["ggm@clovair.dev"] });
		await s.receive("alias@clovair.dev"); await Promise.all(s.tasks);
		assert.equal(s.env.MAILBOX.idFromName.mock.calls[0].arguments[0], "alias@clovair.dev");
	});
	it("does not catch mail for another domain", async () => {
		const s = setup({ DOMAINS: "clovair.dev", CATCH_ALL_MAILBOX: "etc@clovair.dev", EMAIL_ADDRESSES: ["ggm@clovair.dev"] });
		await s.receive("unknown@example.org");
		assert.equal(s.mailbox.createEmail.mock.callCount(), 0);
	});
	it("fails if a configured mailbox is missing instead of misfiling into etc", async () => {
		const s = setup({ DOMAINS: "clovair.dev", CATCH_ALL_MAILBOX: "etc@clovair.dev", EMAIL_ADDRESSES: ["ggm@clovair.dev"] });
		s.env.BUCKET.head.mock.mockImplementation(async () => null);
		await assert.rejects(s.receive("ggm@clovair.dev"), /not provisioned/);
		assert.equal(s.mailbox.createEmail.mock.callCount(), 0);
	});
	it("fails if etc has not been provisioned", async () => {
		const s = setup({ DOMAINS: "clovair.dev", CATCH_ALL_MAILBOX: "etc@clovair.dev", EMAIL_ADDRESSES: ["ggm@clovair.dev"] });
		s.env.BUCKET.head.mock.mockImplementation(async () => null);
		await assert.rejects(s.receive("asdas@clovair.dev"), /not provisioned/);
		assert.equal(fetchMock.mock.callCount(), 0);
	});

});

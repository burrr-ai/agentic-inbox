import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { excludesDiscordSubject, parseSubjectExclusions, MailboxSettingsSchema } from "../shared/discord-filters.ts";
import { notifyDiscordForMailbox } from "../workers/lib/discord.ts";

test("literal subject exclusions normalize case, ignore blanks, and support clearing", () => {
	assert.deepEqual(parseSubjectExclusions(" 자금일보 \n\n자금일보\r\nReport"), ["자금일보", "Report"]);
	assert.equal(excludesDiscordSubject("[클로베어] 자금일보 10월 9일", ["자금일보"]), true);
	assert.equal(excludesDiscordSubject("Monthly REPORT", ["report"]), true);
	assert.equal(excludesDiscordSubject("anything", ["", "  ", ".*"]), false);
	assert.equal(excludesDiscordSubject("자금일보", []), false);
	assert.equal(MailboxSettingsSchema.safeParse({ discordSubjectExclusions: "bad" }).success, false);
	assert.equal(MailboxSettingsSchema.safeParse({ discordSubjectExclusions: ["a".repeat(201)] }).success, false);
});

test("admin exclusion does not suppress the same subject for other mailboxes or body matches", async () => {
	const fetch = mock.method(globalThis, "fetch", async () => new Response(null, {status:204}));
	const env = { DISCORD_WEBHOOK_URL:"https://discord.com/api/webhooks/123456789/test-token", BUCKET:{get:async key=>({json:async()=>({discordSubjectExclusions:key === 'mailboxes/admin@clovair.dev.json' ? ['자금일보'] : []})})} };
	try {
		await notifyDiscordForMailbox(env as any,'admin@clovair.dev',{subject:'오늘 자금일보',text:'body'});
		assert.equal(fetch.mock.callCount(),0);
		for (const address of ['tech@clovair.dev','etc@clovair.dev','new@clovair.dev']) await notifyDiscordForMailbox(env as any,address,{subject:'오늘 자금일보',text:'body'});
		await notifyDiscordForMailbox(env as any,'admin@clovair.dev',{subject:'다른 제목',text:'자금일보'});
		assert.equal(fetch.mock.callCount(),4);
	} finally { mock.restoreAll(); }
});

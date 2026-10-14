import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

test("thread counts do not multiply when reply subjects change", async () => {
	const bundle = await build({ stdin: { contents: `
		import { MailboxDO } from './workers/durableObject/index.ts';
		export { MailboxDO };
		export default { async fetch(request, env) {
			const mailbox = env.MAILBOX.get(env.MAILBOX.idFromName('test'));
			await mailbox.importRecipientBatch(await request.json());
			return Response.json({inbox: await mailbox.getThreadedEmails({folder:'inbox'}), sent: await mailbox.getThreadedEmails({folder:'sent'})});
		} };
	`, resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false, format: "esm", platform: "neutral", conditions: ["workerd", "module", "browser"], external: ["cloudflare:workers"], logLevel: "silent" });
	const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-11-28", durableObjects: { MAILBOX: { className: "MailboxDO", useSQLite: true } }, r2Buckets: ["BUCKET"] });
	try {
		const emails = Array.from({length:10}, (_, i) => ({id:`message-${i}`,folder_id:i<8?'inbox':'sent',sender:'sender@example.org',recipient:'test@example.org',subject:['견적','Re:견적','Re:Re: 견적','변경된 견적'][i%4],body:'body',date:`2026-10-14T00:${String(i).padStart(2,'0')}:00Z`,read:i%2,starred:0,thread_id:'conversation',message_id:`message-${i}@example.org`}));
		const response = await mf.dispatchFetch('http://localhost/', {method:'POST',body:JSON.stringify({folders:[{id:'inbox',name:'inbox',is_deletable:0},{id:'sent',name:'sent',is_deletable:0}],emails,attachments:[]})});
		const result = await response.json() as any;
		assert.equal(result.inbox.length,1);
		assert.equal(result.inbox[0].thread_count,10);
		assert.equal(result.inbox[0].thread_unread_count,5);
		assert.equal(result.inbox[0].id,'message-7');
		assert.equal(result.sent.length,1);
		assert.equal(result.sent[0].thread_count,10);
		assert.equal(result.sent[0].thread_unread_count,5);
	} finally { await mf.dispose(); }
});

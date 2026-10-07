import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

test("real Durable Objects move envelope matches without losing metadata or attachments", async () => {
	const bundle = await build({ stdin: { contents: `
		import { MailboxDO } from './workers/durableObject/index.ts';
		export { MailboxDO };
		export default { async fetch(request, env) {
			const input = await request.json();
			const source = env.MAILBOX.get(env.MAILBOX.idFromName('etc@clovair.dev'));
			const target = env.MAILBOX.get(env.MAILBOX.idFromName('temp@clovair.dev'));
			if (input.action === 'seed') { await source.importRecipientBatch(input.batch); await env.BUCKET.put('attachments/keep', 'unchanged'); }
			if (input.action === 'move') { await env.BUCKET.put('mailboxes/temp@clovair.dev.json', '{}'); await source.queueRecipientMove('temp@clovair.dev'); }
			if (input.action === 'duplicate') { await target.importRecipientBatch(input.batch); await target.importRecipientBatch(input.batch); }
			return Response.json({ source: await source.exportSnapshot(), target: await target.exportSnapshot(), attachment: await (await env.BUCKET.get('attachments/keep'))?.text() });
		} };
	`, resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false, format: "esm", platform: "neutral", conditions: ["workerd", "module", "browser"], external: ["cloudflare:workers"], logLevel: "silent" });
	const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-11-28", durableObjects: { MAILBOX: { className: "MailboxDO", useSQLite: true } }, r2Buckets: ["BUCKET"], bindings: { CATCH_ALL_MAILBOX: "etc@clovair.dev" } });
	const row = (id: string, recipient: string) => ({ id, folder_id: "inbox", sender: "sender@example.org", recipient: "visible@example.org", envelope_recipient: recipient, subject: "preserve", body: "body", date: "2026-10-08T00:00:00Z", read: 1, starred: 1, thread_id: id, cc: null, bcc: null, in_reply_to: null, email_references: null, message_id: id, raw_headers: "[]" });
	const batch = { folders: [{ id:"inbox", name:"Inbox", is_deletable:0 }], emails: [row("move", "temp@clovair.dev"),row("stay", "other@clovair.dev")], attachments: [{ id:"attachment",email_id:"move",filename:"test.txt",mimetype:"text/plain",size:9,content_id:null,disposition:"attachment" }] };
	const invoke = async (action: string, data = {}) => (await mf.dispatchFetch("http://localhost/",{method:"POST",body:JSON.stringify({action,...data})})).json() as Promise<any>;
	try {
		await invoke("seed", { batch });
		await invoke("move");
		let result;
		for(let i=0;i<40;i++){ result=await invoke("read"); if(result.target.emails.length === 1 && result.source.emails.length === 1) break; await new Promise(resolve=>setTimeout(resolve,100)); }
		assert.deepEqual(result.source.emails.map(e=>e.id), ["stay"]);
		assert.equal(result.target.emails[0].envelope_recipient,"temp@clovair.dev");
		assert.equal(result.target.emails[0].starred,1);
		assert.equal(result.target.attachments[0].filename,"test.txt");
		assert.equal(result.attachment,"unchanged");
		result=await invoke("duplicate",{batch:{...batch,emails:[row("move","temp@clovair.dev")]}});
		assert.equal(result.target.emails.length,1);
		assert.equal(result.target.attachments.length,1);
	} finally { await mf.dispose(); }
});

import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { app } from "../workers/index.ts";

test("creates arbitrary mailboxes in configured domain without modifying Gmail forwarding", async () => {
	const objects = new Map();
	const forwarding = { "ggm@clovair.dev": "gjwnsan9420@gmail.com" };
	const env = { DOMAINS: "clovair.dev", EMAIL_ADDRESSES: ["ggm@clovair.dev"], INBOUND_FORWARDING: forwarding,
		BUCKET: { head: async key => objects.get(key), put: async (key, value) => objects.set(key, value) },
		MAILBOX: { idFromName: id => id, get: () => ({ getFolders: async () => [] }) } };
	const create = email => app.request('/api/v1/mailboxes', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email,name:'sales'}) }, env);
	assert.equal((await create('sales@clovair.dev')).status, 201);
	assert.equal((await create('sales@clovair.dev')).status, 409);
	assert.equal((await create('sales@other.dev')).status, 403);
	assert.deepEqual(forwarding, { "ggm@clovair.dev": "gjwnsan9420@gmail.com" });
});

test("failed outbound delivery is reported and is not stored as sent", async () => {
	const createEmail = mock.fn();
	const stub = { checkSendRateLimit: async () => null, createEmail };
	const env = { BUCKET: { head: async () => ({}) }, MAILBOX: { idFromName: id => id, get: () => stub }, EMAIL: { send: async () => { throw new Error('provider unavailable'); } } };
	const response = await app.request('/api/v1/mailboxes/ggm@clovair.dev/emails', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({to:'gjwnsan9420@gmail.com',from:'ggm@clovair.dev',subject:'Test',text:'Test'}) }, env);
	assert.equal(response.status, 502);
	assert.equal(createEmail.mock.callCount(), 0);
});

import assert from "node:assert/strict";
import { afterEach, it, mock } from "node:test";
import { deliverInboundEmail } from "../workers/lib/inbound-delivery.ts";
import type { Env } from "../workers/types.ts";

afterEach(() => mock.restoreAll());
for (const storageFails of [false, true]) {
	for (const forwardingFails of [false, true]) {
		it(`attempts both deliveries: storage failure=${storageFails}, forwarding failure=${forwardingFails}`, async () => {
			mock.method(console, "error", () => {});
			const store = mock.fn(async () => { if (storageFails) throw new Error("private storage detail"); });
			const forward = mock.fn(async () => { if (forwardingFails) throw new Error("private forwarding detail"); });
			const event = { to: "GGM@clovair.dev", forward } as unknown as ForwardableEmailMessage;
			const env = { INBOUND_FORWARDING: { "ggm@clovair.dev": "destination@example.org" } } as unknown as Env;
			const delivery = deliverInboundEmail(event, env, {} as ExecutionContext, store);
			if (storageFails || forwardingFails) await assert.rejects(delivery, /Inbound delivery incomplete/);
			else await delivery;
			assert.equal(store.mock.callCount(), 1);
			assert.equal(forward.mock.callCount(), 1);
			assert.deepEqual(forward.mock.calls[0].arguments, ["destination@example.org"]);
		});
	}
}
for (const recipient of ["unknown@clovair.dev", "ggm+tag@clovair.dev"]) {
it(`does not forward unlisted recipient ${recipient}`, async () => {
	const forward = mock.fn();
	await deliverInboundEmail({ to: recipient, forward } as unknown as ForwardableEmailMessage,
		{ INBOUND_FORWARDING: { "ggm@clovair.dev": "destination@example.org" } } as unknown as Env,
		{} as ExecutionContext, async () => {});
	assert.equal(forward.mock.callCount(), 0);
});

}

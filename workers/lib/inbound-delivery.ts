import type { Env } from "../types";

/** Attempt both deliveries; never let an app storage failure suppress Gmail. */
export async function deliverInboundEmail(
	event: ForwardableEmailMessage,
	env: Env,
	ctx: ExecutionContext,
	store: (event: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) => Promise<void>,
) {
	let failed = false;
	try {
		await store(event, env, ctx);
	} catch {
		failed = true;
		console.error("Inbound mailbox storage failed");
	}
	const recipient = event.to.trim().toLowerCase();
	const destination = (env.INBOUND_FORWARDING as Record<string, string> | undefined)?.[recipient];
	if (destination) {
		try {
			await event.forward(destination);
		} catch {
			failed = true;
			console.error("Inbound forwarding failed");
		}
	}
	// Surface partial failures to Email Routing; upstream redelivery can duplicate
	// a successful copy. This is not an atomic transaction across app and Gmail.
	if (failed) throw new Error("Inbound delivery incomplete");
}

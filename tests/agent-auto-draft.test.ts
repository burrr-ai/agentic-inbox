import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const createWorkersAI = mock.fn(() => { throw new Error("AI must not be invoked"); });
mock.module("@cloudflare/ai-chat", { namedExports: { AIChatAgent: class {} } });
mock.module("workers-ai-provider", { namedExports: { createWorkersAI } });
const { EmailAgent } = await import("../workers/agent/index.ts");

describe("agent incoming-email guard", () => {
	const email = {
		mailboxId: "inbox@example.com", emailId: "test-email",
		sender: "sender@example.org", subject: "private subject", threadId: "test-thread",
	};
	for (const flag of [undefined, false, "false"]) {
		it(`blocks direct auto-draft for ${JSON.stringify(flag)} without email reads or AI`, async () => {
			const context = { env: { AUTO_DRAFT_ENABLED: flag } };
			const result = await EmailAgent.prototype.handleNewEmail.call(context, email);
			assert.deepEqual(result, { status: "auto_draft_disabled" });
			assert.equal(createWorkersAI.mock.callCount(), 0);
		});
	}
	it("also blocks the HTTP incoming-email endpoint", async () => {
		const context = { env: {}, handleNewEmail: EmailAgent.prototype.handleNewEmail };
		const response = await EmailAgent.prototype.onRequest.call(context, new Request("https://agents/onNewEmail", {
			method: "POST", body: JSON.stringify(email),
		}));
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { status: "auto_draft_disabled" });
		assert.equal(createWorkersAI.mock.callCount(), 0);
	});
});

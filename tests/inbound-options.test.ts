import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAutoDraftEnabled } from "../workers/lib/inbound-options.ts";

describe("automatic drafts are opt-in", () => {
	for (const value of [undefined, false, "false", "", "TRUE", "1", 1, null, {}]) {
		it(`stays off for ${JSON.stringify(value)}`, () => {
			assert.equal(isAutoDraftEnabled({ AUTO_DRAFT_ENABLED: value }), false);
		});
	}
	for (const value of [true, "true"]) {
		it(`accepts explicit ${JSON.stringify(value)}`, () => {
			assert.equal(isAutoDraftEnabled({ AUTO_DRAFT_ENABLED: value }), true);
		});
	}
});

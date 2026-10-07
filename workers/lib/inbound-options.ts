// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/** Automatic AI processing is opt-in. Missing or unrecognized values stay off. */
export function isAutoDraftEnabled(env: { AUTO_DRAFT_ENABLED?: unknown }): boolean {
	return env.AUTO_DRAFT_ENABLED === true || env.AUTO_DRAFT_ENABLED === "true";
}

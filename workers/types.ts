// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface Env extends Omit<Cloudflare.Env, "BETTER_AUTH_URL"> {
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	/** Optional Worker secret. Never expose this URL to the client. */
	DISCORD_WEBHOOK_URL?: string;
}

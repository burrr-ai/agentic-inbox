import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin } from "better-auth/plugins";
import type { Env } from "../types";

type AuthOptions = BetterAuthOptions & { plugins: [ReturnType<typeof admin<{}>>] };

export function authOptions(env: { BETTER_AUTH_SECRET?: string; BETTER_AUTH_URL?: string }): AuthOptions {
	if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32 || !env.BETTER_AUTH_URL) {
		throw new Error("Login is not configured");
	}
	const origin = new URL(env.BETTER_AUTH_URL).origin;
	return {
		appName: "Clovair Mail",
		baseURL: origin,
		secret: env.BETTER_AUTH_SECRET,
		trustedOrigins: [origin],
		emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
		plugins: [admin()],
		session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
		rateLimit: { enabled: true, storage: "database", window: 60, max: 60,
			customRules: { "/sign-in/email": { window: 60, max: 5 } } },
		advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
		// Authentication errors must never log request bodies or credentials.
		logger: { disabled: true },
	} satisfies BetterAuthOptions;
}

export function createAuth(env: Env): ReturnType<typeof betterAuth<AuthOptions>> {
	if (!env.AUTH_DB) throw new Error("Login database is not configured");
	return betterAuth<AuthOptions>({ ...authOptions(env), database: env.AUTH_DB });
}

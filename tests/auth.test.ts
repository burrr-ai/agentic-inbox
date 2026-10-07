import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { it } from "node:test";
import { betterAuth } from "better-auth";
import { Hono } from "hono";
import { authOptions } from "../workers/lib/auth.ts";
import { authGate } from "../workers/lib/auth-gate.ts";
import type { Env } from "../workers/types.ts";

const origin = "https://mail.example.test";
function setup() {
	const database = new DatabaseSync(":memory:");
	database.exec(readFileSync(new URL("../migrations/auth/0001_better_auth.sql", import.meta.url), "utf8"));
	const env = { BETTER_AUTH_SECRET: "test-only-secret-with-more-than-thirty-two-characters", BETTER_AUTH_URL: origin } as Env;
	const auth = betterAuth({ ...authOptions(env), database });
	const app = new Hono<{ Bindings: Env }>();
	app.use("*", authGate(() => auth as ReturnType<typeof import("../workers/lib/auth.ts").createAuth>));
	app.all("*", c => c.text("protected"));
	function request(path: string, body?: unknown, cookie?: string, extra: Record<string, string> = {}) {
		return app.fetch(new Request(origin + path, { method: body ? "POST" : "GET",
			headers: { origin, "content-type": "application/json", "cf-connecting-ip": "192.0.2.1", ...(cookie ? { cookie } : {}), ...extra },
			...(body ? { body: JSON.stringify(body) } : {}),
		}), env);
	}
	return { database, auth, request };
}
function cookies(response: Response) { return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "); }

it("protects mail APIs, attachments, agents and MCP; fails closed without auth configuration", async () => {
	const s = setup();
	for (const path of ["/api/v1/mailboxes", "/api/v1/mailboxes/x/emails/y/attachments/z", "/agents/mail/test", "/mcp"]) {
		assert.equal((await s.request(path)).status, 401);
	}
	assert.equal((await s.request("/")).headers.get("location"), "/login");
	assert.equal((await s.request("/login")).status, 200);
	assert.equal((await s.request("/agents/mail/test", undefined, undefined, { upgrade: "websocket", origin: "https://evil.test" })).status, 403);
	const app = new Hono<{ Bindings: Env }>(); app.use("*", authGate()); app.get("*", c => c.text("unsafe"));
	assert.equal((await app.request(origin + "/", {}, {} as Env)).status, 503);
	s.database.close();
});

it("supports admin login, private user creation, password changes and logout", async () => {
	const s = setup();
	const firstPassword = "test-admin-password";
	await s.auth.api.createUser({ body: { name: "Admin", email: "admin@example.test", password: firstPassword, role: "admin" } });
	assert.equal((await s.request("/api/auth/sign-up/email", { name: "Stranger", email: "stranger@example.test", password: firstPassword })).status, 400);
	assert.equal((await s.request("/api/auth/admin/create-user", { name: "Stranger", email: "stranger@example.test", password: firstPassword })).status, 401);
	const login = await s.request("/api/auth/sign-in/email", { email: "admin@example.test", password: firstPassword, rememberMe: true });
	assert.equal(login.status, 200); const adminCookie = cookies(login);
	assert.match(adminCookie, /session_token/);
	assert.equal((await s.request("/api/v1/mailboxes", undefined, adminCookie)).status, 200);
	assert.equal((await s.request("/api/v1/mailboxes", { email: "x@example.test" }, adminCookie, { origin: "https://evil.test" })).status, 403);
	const create = await s.request("/api/auth/admin/create-user", { name: "Teammate", email: "teammate@example.test", password: "test-member-password", role: "user" }, adminCookie);
	assert.equal(create.status, 200);
	const memberLogin = await s.request("/api/auth/sign-in/email", { email: "teammate@example.test", password: "test-member-password" });
	const memberCookie = cookies(memberLogin);
	assert.equal(memberLogin.status, 200);
	assert.equal((await s.request("/api/auth/admin/create-user", { name: "Forbidden", email: "no@example.test", password: firstPassword }, memberCookie)).status, 403);
	assert.equal((await s.request("/api/auth/change-password", { currentPassword: firstPassword, newPassword: "changed-admin-password", revokeOtherSessions: true }, adminCookie)).status, 200);
	assert.equal((await s.request("/api/auth/sign-in/email", { email: "admin@example.test", password: firstPassword })).status, 401);
	const freshLogin = await s.request("/api/auth/sign-in/email", { email: "admin@example.test", password: "changed-admin-password" });
	assert.equal(freshLogin.status, 200);
	const freshCookie = cookies(freshLogin);
	assert.equal((await s.request("/api/auth/sign-out", {}, freshCookie)).status, 200);
	assert.equal((await s.request("/api/v1/mailboxes", undefined, freshCookie)).status, 401);
	s.database.close();
});

it("rate limits repeated login attempts in the shared database", async () => {
	const s = setup();
	for (let i = 0; i < 5; i++) await s.request("/api/auth/sign-in/email", { email: "missing@example.test", password: "incorrect-password" });
	assert.equal((await s.request("/api/auth/sign-in/email", { email: "missing@example.test", password: "incorrect-password" })).status, 429);
	s.database.close();
});

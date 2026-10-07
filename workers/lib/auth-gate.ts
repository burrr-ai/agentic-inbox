import { createMiddleware } from "hono/factory";
import { createAuth } from "./auth";
import type { Env } from "../types";

// Narrow dependency injection keeps the production gate testable with a real
// Better Auth instance and SQLite, without booting the email/AI runtimes.
export function authGate(makeAuth = createAuth) {
	return createMiddleware<{ Bindings: Env }>(async (c, next) => {
		c.header("Cache-Control", "no-store");
		let auth: ReturnType<typeof createAuth>;
		try { auth = makeAuth(c.env); }
		catch { return c.json({ error: "Login is not configured" }, 503); }
		const path = c.req.path;
		if (path.startsWith("/api/auth/")) return auth.handler(c.req.raw);
		if (path === "/login" && c.req.method === "GET") return next();
		// Cookie sessions require CSRF protection on the existing mail APIs too.
		if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) || c.req.header("upgrade")?.toLowerCase() === "websocket") {
			if (c.req.header("origin") !== new URL(c.env.BETTER_AUTH_URL).origin) {
				return c.json({ error: "Invalid request origin" }, 403);
			}
		}
		try {
			const session = await auth.api.getSession({ headers: c.req.raw.headers });
			if (!session) {
				if (c.req.method === "GET" && !path.startsWith("/api/") && !path.startsWith("/agents/") && !path.startsWith("/mcp") && !c.req.header("upgrade")) {
					return c.redirect("/login");
				}
				return c.json({ error: "Login required" }, 401);
			}
		} catch { return c.json({ error: "Unable to verify login" }, 503); }
		return next();
	});
}

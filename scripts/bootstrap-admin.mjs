// Passwords are read privately, hashed locally, and never written as plaintext.
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

const remote = process.argv.includes("--remote");
let password;
if (process.argv.includes("--stdin")) {
	let input = "";
	for await (const chunk of process.stdin) input += chunk;
	password = input.trimEnd();
} else {
	let muted = false;
	const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk, encoding); callback(); } });
	const prompt = createInterface({ input: process.stdin, output, terminal: true });
	process.stdout.write("Initial admin password (hidden): ");
	muted = true; password = await prompt.question(""); muted = false;
	prompt.close(); process.stdout.write("\n");
}
if (!password || password.length < 8 || password.length > 128) throw new Error("Password must be 8–128 characters");
const hash = await hashPassword(password); password = undefined;
const id = randomUUID(); const accountId = randomUUID(); const now = new Date().toISOString();
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const sql = `INSERT OR IGNORE INTO user (id,name,email,emailVerified,createdAt,updatedAt,role,banned) VALUES (${quote(id)},'Clovair Admin','admin@clovair.dev',1,${quote(now)},${quote(now)},'admin',0);
INSERT INTO account (id,accountId,providerId,userId,password,createdAt,updatedAt) SELECT ${quote(accountId)},${quote(id)},'credential',${quote(id)},${quote(hash)},${quote(now)},${quote(now)} WHERE EXISTS (SELECT 1 FROM user WHERE id=${quote(id)});
SELECT email,role FROM user WHERE email='admin@clovair.dev';`;
mkdirSync(".wrangler", { recursive: true });
const directory = mkdtempSync(resolve(".wrangler/bootstrap-"));
const filename = resolve(directory, "bootstrap.sql");
try {
	writeFileSync(filename, sql, { mode: 0o600 });
	const result = spawnSync(process.execPath, ["scripts/wrangler.mjs", "d1", "execute", "AUTH_DB", remote ? "--remote" : "--local", "--file", filename], { stdio: ["ignore", "pipe", "pipe"] });
	if (result.status !== 0) throw new Error("Admin initialization failed; inspect database configuration and credentials. Password and query output suppressed.");
	console.log(`Admin account initialized (${remote ? "remote" : "local"}). Existing accounts were not changed.`);
} finally { rmSync(directory, { recursive: true, force: true }); }

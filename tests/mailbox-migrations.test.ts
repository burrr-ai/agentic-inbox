import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applyMigrations, mailboxMigrations } from "../workers/durableObject/migrations.ts";

test("envelope migration preserves existing messages and is safe to repeat", () => {
	const db = new DatabaseSync(":memory:");
	const sql = { exec(query: string, ...bindings: unknown[]) {
		if (/^\s*SELECT/i.test(query)) return db.prepare(query).all(...bindings as any[]);
		db.exec(query); return [];
	} };
	const storage = { transactionSync<T>(run: () => T): T {
		db.exec("BEGIN");
		try { const result = run(); db.exec("COMMIT"); return result; }
		catch (error) { db.exec("ROLLBACK"); throw error; }
	} };
	try {
		applyMigrations(sql as unknown as SqlStorage, mailboxMigrations.slice(0, 8), storage);
		db.exec("INSERT INTO emails (id, folder_id, recipient, body) VALUES ('existing', 'inbox', 'ggm@clovair.dev', 'preserved')");
		applyMigrations(sql as unknown as SqlStorage, mailboxMigrations, storage);
		applyMigrations(sql as unknown as SqlStorage, mailboxMigrations, storage);
		const row = db.prepare("SELECT body, envelope_recipient FROM emails WHERE id = 'existing'").get();
		assert.equal(row?.body, "preserved");
		assert.equal(row?.envelope_recipient, null);
		db.exec("INSERT INTO emails (id, folder_id, envelope_recipient) VALUES ('catchall', 'inbox', 'asdas@clovair.dev')");
		assert.equal(db.prepare("SELECT envelope_recipient FROM emails WHERE id = 'catchall'").get()?.envelope_recipient, "asdas@clovair.dev");
	} finally { db.close(); }
});

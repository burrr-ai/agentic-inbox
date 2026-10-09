import { z } from "zod";

export const DiscordSubjectExclusions = z.array(z.string().trim().min(1).max(200)).max(100);
export const MailboxSettingsSchema = z.object({
	discordSubjectExclusions: DiscordSubjectExclusions.optional(),
}).passthrough();

export function parseSubjectExclusions(value: string): string[] {
	return [...new Set(value.split(/\r?\n/).map(word => word.trim()).filter(Boolean))];
}

/** Literal substring matching; no regex, body inspection, or cross-mailbox rules. */
export function excludesDiscordSubject(subject: string, keywords: string[]): boolean {
	const normalized = subject.normalize("NFC").toLowerCase();
	return keywords.some(word => word.trim() && normalized.includes(word.trim().normalize("NFC").toLowerCase()));
}

// Node 24 strips TypeScript types; resolve the extensionless imports used by Vite.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

registerHooks({
	resolve(specifier, context, nextResolve) {
		try {
			return nextResolve(specifier, context);
		} catch (error) {
			if (specifier.startsWith(".") && context.parentURL?.startsWith("file:") &&
				["ERR_MODULE_NOT_FOUND", "ERR_UNSUPPORTED_DIR_IMPORT"].includes(error.code)) {
				for (const suffix of [".ts", "/index.ts"]) {
					const candidate = new URL(specifier + suffix, context.parentURL);
					if (existsSync(candidate)) return nextResolve(candidate.href, context);
				}
			}
			throw error;
		}
	},
});

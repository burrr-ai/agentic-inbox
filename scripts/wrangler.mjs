// Project-only authentication: never inherit another project's global token or proxy.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const env = { ...process.env };
for (const key of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_BASE_URL", "CLOUDFLARE_API_KEY", "CLOUDFLARE_EMAIL", "CF_API_TOKEN", "CF_ACCOUNT_ID", "CF_API_KEY", "CF_EMAIL"]) delete env[key];
env.CLOUDFLARE_ACCOUNT_ID = "5d286664ee0a1f7d2ed43aeb5de4d36a";
env.XDG_CONFIG_HOME = resolve(root, ".wrangler/auth");
const result = spawnSync(process.execPath, [resolve(root, "node_modules/wrangler/bin/wrangler.js"), ...process.argv.slice(2)], { cwd: root, env, stdio: "inherit" });
process.exit(result.status ?? 1);

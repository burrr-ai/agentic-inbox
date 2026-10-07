import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
type ClientOptions = { plugins: [ReturnType<typeof adminClient<{}>>] };
export const authClient: ReturnType<typeof createAuthClient<ClientOptions>> = createAuthClient({ plugins: [adminClient()] });

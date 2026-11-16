import { createAuthClient } from 'better-auth/react';
import { adminClient } from 'better-auth/client/plugins';

import { ac, roles } from '@/lib/auth/permissions';

// Same origin as the app, so no baseURL is needed in the browser. The admin client
// types `role` and `banned` on the session user; its endpoints are locked over HTTP.
export const authClient = createAuthClient({ plugins: [adminClient({ ac, roles })] });

export const { useSession, signIn, signUp, signOut } = authClient;

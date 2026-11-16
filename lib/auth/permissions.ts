import { createAccessControl } from 'better-auth/plugins/access';

// Roles for the Better Auth admin plugin (spec 0001, Security model, Roles).
// No role gets create, delete, set-password, update, or impersonate. The plugin's
// HTTP endpoints are locked anyway (lib/auth.ts hook); these permissions only gate
// the server side auth.api calls our server actions make after their own policy check.
export const statements = {
    user: ['list', 'set-role', 'ban'],
    session: ['list', 'revoke'],
} as const;

export const ac = createAccessControl(statements);

export const roles = {
    user: ac.newRole({ user: [], session: [] }),
    admin: ac.newRole({ user: ['list', 'ban'] }),
    superadmin: ac.newRole({ user: ['list', 'set-role', 'ban'], session: ['list', 'revoke'] }),
};

export type Role = keyof typeof roles;

import { Suspense } from 'react';
import { Search, Users } from 'lucide-react';

import BanDialog from '@/components/admin/BanDialog';
import ModerationButton from '@/components/admin/ModerationButton';
import Pager from '@/components/dashboard/Pager';
import { requireRole } from '@/lib/auth/guards';
import { canBan } from '@/lib/auth/policy';
import { param, type SearchParams } from '@/lib/auth/search-params';
import { listUsers, type AdminUserRow } from '@/lib/admin/queries';

const fmt = (iso: string) => new Date(iso).toUTCString().replace(' GMT', ' UTC');

// Users (spec 0001, AC-17, AC-18): search by email or name, newest first, 20 per page,
// with role, ban status computed now, and event count. Ban controls show only where allowed.
async function UsersTable({ searchParams }: { searchParams: SearchParams }) {
    const session = await requireRole('admin', '/admin/users');
    const params = await searchParams;
    const q = param(params, 'q');
    const { items, page, totalPages, total } = await listUsers(q, param(params, 'page'));

    const target = (u: AdminUserRow) => ({ id: u.id, email: u.email, emailVerified: u.emailVerified, role: u.role, banned: u.banStatus === 'banned' });

    return (
        <>
            <form className="admin-search" role="search" action="/admin/users">
                <label htmlFor="q" className="sr-only">Search users by email or name</label>
                <Search aria-hidden="true" />
                <input id="q" name="q" type="search" defaultValue={q ?? ''} placeholder="Search by email or name" />
                <button type="submit">Search</button>
            </form>

            <p className="admin-count">{q ? `${total} result${total === 1 ? '' : 's'} for “${q}”` : `${total} user${total === 1 ? '' : 's'}, newest first`}</p>

            {items.length === 0 ? (
                <div className="empty">
                    <Users aria-hidden="true" />
                    <h2>No users found</h2>
                    <p>{q ? 'Try part of an email address or a name.' : 'Nobody has signed up yet.'}</p>
                </div>
            ) : (
                <div className="table-wrap">
                    <table className="admin-table">
                        <caption className="sr-only">Users</caption>
                        <thead>
                            <tr>
                                <th scope="col">User</th>
                                <th scope="col">Role</th>
                                <th scope="col">Status</th>
                                <th scope="col">Events</th>
                                <th scope="col"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((u) => {
                                const allowed = canBan(session.user, target(u)).ok;
                                return (
                                    <tr key={u.id}>
                                        <td>
                                            <p className="name">{u.name}</p>
                                            <p className="sub">{u.email}{u.emailVerified ? '' : ' · unverified'}</p>
                                        </td>
                                        <td><span className={`role-pill ${u.role}`}>{u.role}</span></td>
                                        <td>
                                            {u.banStatus === 'banned' ? (
                                                <div className="ban-status">
                                                    <span className="status banned">Banned</span>
                                                    <p className="sub">{u.banExpires ? `until ${fmt(u.banExpires)}` : 'permanently'}</p>
                                                    {u.banReason && <p className="sub reason">“{u.banReason}”</p>}
                                                </div>
                                            ) : (
                                                <span className="status active">Active</span>
                                            )}
                                        </td>
                                        <td className="num">{u.eventCount}</td>
                                        <td>
                                            {allowed && (
                                                <div className="row-mod">
                                                    <BanDialog user={{ id: u.id, email: u.email, banned: u.banStatus === 'banned', banReason: u.banReason }} />
                                                    {u.banStatus === 'banned' && <ModerationButton kind="unban" userId={u.id} />}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            <Pager page={page} totalPages={totalPages} basePath="/admin/users" query={{ q }} label="User pages" />
        </>
    );
}

const AdminUsersPage = ({ searchParams }: { searchParams: SearchParams }) => (
    <Suspense>
        <UsersTable searchParams={searchParams} />
    </Suspense>
);

export default AdminUsersPage;

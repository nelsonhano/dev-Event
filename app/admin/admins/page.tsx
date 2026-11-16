import { Suspense } from 'react';
import { Search, ShieldCheck } from 'lucide-react';

import ModerationButton from '@/components/admin/ModerationButton';
import { requireRole } from '@/lib/auth/guards';
import { param, type SearchParams } from '@/lib/auth/search-params';
import { listAdmins, searchPromotable } from '@/lib/admin/queries';

// Admins (spec 0001, AC-16): the super admin promotes verified, unbanned users and
// demotes admins. Nobody can grant superadmin, and the super admin's own role is fixed.
async function Admins({ searchParams }: { searchParams: SearchParams }) {
    await requireRole('superadmin', '/admin/admins');
    const q = param(await searchParams, 'q');
    const [admins, candidates] = await Promise.all([listAdmins(), searchPromotable(q)]);

    return (
        <div className="admin-columns">
            <section aria-labelledby="current-admins">
                <h2 id="current-admins">Current admins</h2>
                {admins.length === 0 ? (
                    <div className="empty small">
                        <ShieldCheck aria-hidden="true" />
                        <p>No admins yet. Find someone on the right to promote.</p>
                    </div>
                ) : (
                    <ul className="people">
                        {admins.map((a) => (
                            <li key={a.id}>
                                <div>
                                    <p className="name">{a.name}</p>
                                    <p className="sub">{a.email}</p>
                                </div>
                                <ModerationButton kind="role" userId={a.id} makeAdmin={false} />
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section aria-labelledby="promote">
                <h2 id="promote">Promote a user</h2>
                <form className="admin-search" role="search" action="/admin/admins">
                    <label htmlFor="q" className="sr-only">Search verified users by email or name</label>
                    <Search aria-hidden="true" />
                    <input id="q" name="q" type="search" defaultValue={q ?? ''} placeholder="Search verified users" />
                    <button type="submit">Search</button>
                </form>
                <p className="admin-count">Only verified, unbanned organisers can be promoted. They get an email naming you.</p>
                {q && candidates.length === 0 && <p className="admin-count">Nobody matching “{q}” can be promoted.</p>}
                {candidates.length > 0 && (
                    <ul className="people">
                        {candidates.map((u) => (
                            <li key={u.id}>
                                <div>
                                    <p className="name">{u.name}</p>
                                    <p className="sub">{u.email}</p>
                                </div>
                                <ModerationButton kind="role" userId={u.id} makeAdmin />
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

const AdminAdminsPage = ({ searchParams }: { searchParams: SearchParams }) => (
    <Suspense>
        <Admins searchParams={searchParams} />
    </Suspense>
);

export default AdminAdminsPage;

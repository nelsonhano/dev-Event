import { Suspense } from 'react';
import { ScrollText } from 'lucide-react';

import Pager from '@/components/dashboard/Pager';
import { requireRole } from '@/lib/auth/guards';
import { param, type SearchParams } from '@/lib/auth/search-params';
import { listAudit, type AuditRow } from '@/lib/admin/queries';

const ACTION_LABELS: Record<string, string> = {
    'role.grant': 'Made admin',
    'role.revoke': 'Removed admin',
    'user.ban': 'Banned',
    'user.unban': 'Unbanned',
    'event.update': 'Edited event',
    'event.delete': 'Deleted event',
};

function details(row: AuditRow): string {
    const m = row.meta ?? {};
    if (row.action === 'user.ban') {
        const until = m.expiresAt ? `until ${new Date(String(m.expiresAt)).toUTCString().replace(' GMT', ' UTC')}` : 'permanently';
        return `${until}. Reason: ${String(m.reason ?? '')}`;
    }
    if (row.action === 'event.update' && Array.isArray(m.fields)) return `Changed ${m.fields.join(', ') || 'nothing'}`;
    if (row.action === 'event.delete' && typeof m.bookings === 'number') return `${m.bookings} booking${m.bookings === 1 ? '' : 's'} cancelled`;
    return '';
}

// Audit log (spec 0001, AC-20): super admin only, newest first, 50 per page.
async function Audit({ searchParams }: { searchParams: SearchParams }) {
    await requireRole('superadmin', '/admin/audit');
    const { items, page, totalPages, total } = await listAudit(param(await searchParams, 'page'));

    if (total === 0) {
        return (
            <div className="empty">
                <ScrollText aria-hidden="true" />
                <h2>Nothing logged yet</h2>
                <p>Role changes, bans, and edits or deletes of other people&apos;s events show up here.</p>
            </div>
        );
    }

    return (
        <>
            <div className="table-wrap">
                <table className="admin-table">
                    <caption className="sr-only">Audit log, newest first</caption>
                    <thead>
                        <tr>
                            <th scope="col">When (UTC)</th>
                            <th scope="col">Who</th>
                            <th scope="col">What</th>
                            <th scope="col">Target</th>
                            <th scope="col">Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((row) => (
                            <tr key={row.id}>
                                <td><time dateTime={row.createdAt}>{row.createdAt.replace('T', ' ').slice(0, 19)}</time></td>
                                <td className="sub-cell">{row.actorEmail}</td>
                                <td><span className={`action-pill ${row.action.split('.')[1]}`}>{ACTION_LABELS[row.action] ?? row.action}</span></td>
                                <td>{row.targetLabel}</td>
                                <td className="sub-cell">{details(row)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Pager page={page} totalPages={totalPages} basePath="/admin/audit" label="Audit log pages" />
        </>
    );
}

const AdminAuditPage = ({ searchParams }: { searchParams: SearchParams }) => (
    <Suspense>
        <Audit searchParams={searchParams} />
    </Suspense>
);

export default AdminAuditPage;

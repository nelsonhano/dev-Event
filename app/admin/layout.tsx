import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';

import AdminTabs from '@/components/admin/AdminTabs';
import FormSkeleton from '@/components/auth/FormSkeleton';
import { requireRole } from '@/lib/auth/guards';
import { isSuperAdmin } from '@/lib/auth/policy';

export const metadata: Metadata = {
    title: 'Admin | DevEvent',
    robots: { index: false, follow: false },
};

// The admin console shell (spec 0001, AC-23): admins and the super admin only; everyone
// else signed in gets a 404. Each page checks again, since a layout can be skipped on
// client navigation and is not a security boundary on its own.
async function AdminShell({ children }: { children: ReactNode }) {
    const session = await requireRole('admin', '/admin/users');
    const superAdmin = isSuperAdmin(session.user);
    return (
        <>
            <div className="admin-head">
                <div>
                    <p className="eyebrow"><ShieldCheck aria-hidden="true" /> {superAdmin ? 'Super admin' : 'Admin'}</p>
                    <h1>Moderation</h1>
                </div>
                <AdminTabs superAdmin={superAdmin} />
            </div>
            {children}
        </>
    );
}

const AdminLayout = ({ children }: { children: ReactNode }) => (
    <section id="admin">
        <Suspense fallback={<FormSkeleton />}>
            <AdminShell>{children}</AdminShell>
        </Suspense>
    </section>
);

export default AdminLayout;

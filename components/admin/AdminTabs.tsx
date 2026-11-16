'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Admin console tabs; Admins and Audit log show only for the super admin. */
const AdminTabs = ({ superAdmin }: { superAdmin: boolean }) => {
    const pathname = usePathname();
    const tabs = [
        { href: '/admin/users', label: 'Users' },
        ...(superAdmin ? [{ href: '/admin/admins', label: 'Admins' }, { href: '/admin/audit', label: 'Audit log' }] : []),
    ];
    return (
        <nav className="admin-tabs" aria-label="Admin sections">
            {tabs.map((t) => (
                <Link key={t.href} href={t.href} aria-current={pathname.startsWith(t.href) ? 'page' : undefined}>
                    {t.label}
                </Link>
            ))}
        </nav>
    );
};

export default AdminTabs;

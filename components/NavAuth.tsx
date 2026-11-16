'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

import { signOut, useSession } from '@/lib/auth-client';

// The signed in part of the navbar (spec 0001, AC-22). A client component reading
// the session, so the root layout stays static.

const CREATE_PATH = '/events/create';

function UserMenu({ name, email, showAdmin }: { name: string; email: string; showAdmin: boolean }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const menuId = useId();
    const rootRef = useRef<HTMLLIElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointer = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
                buttonRef.current?.focus();
            }
        };
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const handleSignOut = async () => {
        setOpen(false);
        await signOut();
        router.push('/');
        router.refresh();
    };

    return (
        <li id="user-menu" className="nav-auth" ref={rootRef}>
            <button
                ref={buttonRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={menuId}
                onClick={() => setOpen((v) => !v)}
            >
                <span className="avatar" aria-hidden="true">{name.trim().charAt(0) || '?'}</span>
                <span className="max-sm:sr-only">Account</span>
                <ChevronDown aria-hidden="true" className="size-4" />
            </button>

            {open && (
                <ul id={menuId} role="menu" aria-label="Account">
                    <li role="none" className="who">
                        <p>{name}</p>
                        <span>{email}</span>
                    </li>
                    <li role="none">
                        <Link role="menuitem" href="/dashboard" onClick={() => setOpen(false)}>Dashboard</Link>
                    </li>
                    {showAdmin && (
                        <li role="none">
                            <Link role="menuitem" href="/admin" onClick={() => setOpen(false)}>Admin</Link>
                        </li>
                    )}
                    <li role="none">
                        <button role="menuitem" type="button" onClick={handleSignOut}>Sign out</button>
                    </li>
                </ul>
            )}
        </li>
    );
}

const NavAuth = () => {
    const { data: session, isPending } = useSession();
    const createHref = session ? CREATE_PATH : `/sign-in?callbackURL=${encodeURIComponent(CREATE_PATH)}`;

    return (
        <>
            <li><Link href={createHref}>Create Event</Link></li>
            {isPending ? (
                // Keeps the navbar from shifting while the session loads.
                <li aria-hidden="true" className="nav-auth bg-dark-100 h-9 w-24 animate-pulse rounded-full" />
            ) : session ? (
                // The stored role is synced at sign in; the admin pages recheck the real rule.
                <UserMenu
                    name={session.user.name}
                    email={session.user.email}
                    showAdmin={session.user.role === 'admin' || session.user.role === 'superadmin'}
                />
            ) : (
                <li className="nav-auth"><Link href="/sign-in" className="nav-signin">Sign in</Link></li>
            )}
        </>
    );
};

export default NavAuth;

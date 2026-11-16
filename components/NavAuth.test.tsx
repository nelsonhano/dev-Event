// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Better Auth's client talks to the server over HTTP; tests choose the session instead.
vi.mock('@/lib/auth-client', () => ({ useSession: vi.fn(), signOut: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { signOut, useSession } from '@/lib/auth-client';
import Navbar from './Navbar';

type SessionState = { data: unknown; isPending: boolean };
const signedOut: SessionState = { data: null, isPending: false };
const signedIn: SessionState = {
    data: { user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' }, session: { id: 's1' } },
    isPending: false,
};
const withSession = (state: SessionState) => vi.mocked(useSession).mockReturnValue(state as never);

const hrefOf = (name: string) => screen.getByRole('link', { name }).getAttribute('href')!;

beforeEach(() => {
    vi.mocked(useSession).mockReset();
    vi.mocked(signOut).mockReset().mockResolvedValue(undefined as never);
    router.push.mockClear();
    router.refresh.mockClear();
});

describe('Navbar (spec 0001, AC-22)', () => {
    it('always links to Home and Events', () => {
        withSession(signedOut);
        render(<Navbar />);

        expect(hrefOf('Home')).toBe('/');
        expect(hrefOf('Events')).toBe('/#events');
    });

    describe('signed out', () => {
        it('shows "Sign in" and no account menu', () => {
            withSession(signedOut);
            render(<Navbar />);

            expect(hrefOf('Sign in')).toBe('/sign-in');
            expect(screen.queryByRole('button', { name: /account/i })).not.toBeInTheDocument();
        });

        it('sends "Create Event" to sign in, coming back to /events/create afterwards (covers: AC-22)', () => {
            withSession(signedOut);
            render(<Navbar />);

            const url = new URL(hrefOf('Create Event'), 'http://localhost');
            expect(url.pathname).toBe('/sign-in');
            expect(url.searchParams.get('callbackURL')).toBe('/events/create');
        });
    });

    describe('while the session loads', () => {
        it('shows neither "Sign in" nor the account menu, so the bar does not flash the wrong state', () => {
            withSession({ data: null, isPending: true });
            render(<Navbar />);

            expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /account/i })).not.toBeInTheDocument();
        });
    });

    describe('signed in', () => {
        it('links "Create Event" straight to the create page and hides "Sign in"', () => {
            withSession(signedIn);
            render(<Navbar />);

            expect(hrefOf('Create Event')).toBe('/events/create');
            expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
        });

        it('opens an account menu with the user, Dashboard and Sign out (covers: AC-22)', async () => {
            const user = userEvent.setup();
            withSession(signedIn);
            render(<Navbar />);
            const trigger = screen.getByRole('button', { name: /account/i });
            expect(trigger).toHaveAttribute('aria-expanded', 'false');

            await user.click(trigger);

            expect(trigger).toHaveAttribute('aria-expanded', 'true');
            const menu = screen.getByRole('menu', { name: 'Account' });
            expect(menu).toHaveTextContent('Ada Lovelace');
            expect(menu).toHaveTextContent('ada@example.com');
            expect(screen.getByRole('menuitem', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
            expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
        });

        it('closes the menu on Escape and puts focus back on the trigger', async () => {
            const user = userEvent.setup();
            withSession(signedIn);
            render(<Navbar />);
            await user.click(screen.getByRole('button', { name: /account/i }));

            await user.keyboard('{Escape}');

            expect(screen.queryByRole('menu')).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: /account/i })).toHaveFocus();
        });

        it('closes the menu when the user clicks elsewhere on the page', async () => {
            const user = userEvent.setup();
            withSession(signedIn);
            render(<Navbar />);
            await user.click(screen.getByRole('button', { name: /account/i }));

            await user.click(screen.getByRole('link', { name: 'Home' }));

            expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        });

        it('signs out and returns to the home page (covers: AC-22)', async () => {
            const user = userEvent.setup();
            withSession(signedIn);
            render(<Navbar />);
            await user.click(screen.getByRole('button', { name: /account/i }));

            await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));

            expect(signOut).toHaveBeenCalledTimes(1);
            expect(router.push).toHaveBeenCalledWith('/');
            expect(router.refresh).toHaveBeenCalled();
        });
    });
});

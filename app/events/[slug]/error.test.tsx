// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import EventError from './error';

describe('event page error boundary', () => {
    it('explains the problem without showing the internal error', () => {
        render(<EventError error={new Error('MongoServerError: connection reset')} reset={vi.fn()} />);

        expect(screen.getByRole('heading', { name: "We couldn't load this event" })).toBeInTheDocument();
        expect(screen.queryByText(/MongoServerError/)).not.toBeInTheDocument();
    });

    it('retries when the user presses "Try again"', async () => {
        const user = userEvent.setup();
        const reset = vi.fn();
        render(<EventError error={new Error('boom')} reset={reset} />);

        await user.click(screen.getByRole('button', { name: 'Try again' }));

        expect(reset).toHaveBeenCalledTimes(1);
    });
});

import Link from 'next/link';
import { Lock } from 'lucide-react';

/** Shown instead of owner tools to someone who isn't allowed (spec 0001, AC-11, AC-14). */
const AccessDenied = ({ message }: { message: string }) => (
    <div className="empty" role="alert">
        <Lock aria-hidden="true" />
        <h2>You don&apos;t have access to this</h2>
        <p>{message}</p>
        <Link href="/dashboard" className="create-btn">Back to your dashboard</Link>
    </div>
);

export default AccessDenied;

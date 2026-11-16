import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
    page: number;
    totalPages: number;
    basePath: string;
    label: string;
    /** Other search params to keep, like a search term. */
    query?: Record<string, string | null | undefined>;
};

/** Previous and Next links (spec 0001, AC-10 and AC-14). Hidden when everything fits on one page. */
const Pager = ({ page, totalPages, basePath, label, query = {} }: Props) => {
    if (totalPages <= 1) return null;
    const href = (p: number) => {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
        if (p > 1) params.set('page', String(p));
        const qs = params.toString();
        return qs ? `${basePath}?${qs}` : basePath;
    };

    return (
        <nav className="pager" aria-label={label}>
            {page > 1 ? (
                <Link href={href(page - 1)} rel="prev"><ChevronLeft aria-hidden="true" /> Previous</Link>
            ) : (
                <span aria-disabled="true"><ChevronLeft aria-hidden="true" /> Previous</span>
            )}
            <span className="where">Page {page} of {totalPages}</span>
            {page < totalPages ? (
                <Link href={href(page + 1)} rel="next">Next <ChevronRight aria-hidden="true" /></Link>
            ) : (
                <span aria-disabled="true">Next <ChevronRight aria-hidden="true" /></span>
            )}
        </nav>
    );
};

export default Pager;

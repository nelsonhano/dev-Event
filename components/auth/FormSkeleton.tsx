/** Placeholder while the dynamic part of an auth card streams in. */
const FormSkeleton = () => (
    <div className="flex flex-col gap-5" aria-hidden="true">
        <div className="bg-dark-200 h-7 w-1/2 animate-pulse rounded-[6px]" />
        <div className="bg-dark-200 h-4 w-3/4 animate-pulse rounded-[6px]" />
        <div className="bg-dark-200 h-11 w-full animate-pulse rounded-[6px]" />
        <div className="bg-dark-200 h-11 w-full animate-pulse rounded-[6px]" />
        <div className="bg-primary/30 h-12 w-full animate-pulse rounded-[6px]" />
    </div>
);

export default FormSkeleton;

import { Skeleton } from "./ui/skeleton";

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="skeleton-stats">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} style={{ height: 112, borderRadius: "var(--r-md)" }} />
        ))}
      </div>
      <div className="skeleton-panel-grid">
        <Skeleton style={{ height: 320, borderRadius: "var(--r-lg)" }} />
        <Skeleton style={{ height: 320, borderRadius: "var(--r-lg)" }} />
      </div>
    </div>
  );
}

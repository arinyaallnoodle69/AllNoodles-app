export default function ReportsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10 animate-pulse">
      {/* Header Skeleton */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded bg-slate-200/80"></div>
          <div className="h-4 w-40 rounded bg-slate-200/60"></div>
        </div>
        <div className="h-10 w-32 rounded-xl bg-slate-200/60"></div>
      </div>

      {/* Filter Bar Skeleton */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="h-11 rounded-xl bg-slate-200/60"></div>
          <div className="h-11 rounded-xl bg-slate-200/60"></div>
          <div className="h-11 rounded-xl bg-slate-200/60"></div>
        </div>
      </div>

      {/* Table / List Skeleton */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="h-12 border-b border-slate-100 bg-slate-50"></div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4 flex-1">
                <div className="h-8 w-8 rounded-lg bg-slate-200/60 shrink-0"></div>
                <div className="space-y-1.5 flex-1">
                  <div className="h-5 w-40 rounded bg-slate-200/80"></div>
                  <div className="h-3.5 w-24 rounded bg-slate-200/60"></div>
                </div>
              </div>
              <div className="h-6 w-24 rounded bg-slate-200/70"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


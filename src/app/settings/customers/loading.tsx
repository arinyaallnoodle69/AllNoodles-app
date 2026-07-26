export default function CustomersLoading() {
  return (
    <div className="w-full space-y-6 p-4 animate-pulse">
      {/* Title and search bar skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded bg-slate-200/80"></div>
        <div className="h-10 w-28 rounded-full bg-slate-200/80"></div>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-100 pb-3">
        <div className="h-8 w-24 rounded bg-slate-200/60"></div>
        <div className="h-8 w-28 rounded bg-slate-200/60"></div>
      </div>

      {/* Grid of customer card skeletons (Desktop and Mobile) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-slate-100 bg-white p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-200/60 shrink-0"></div>
              <div className="space-y-1.5 flex-1">
                <div className="h-5 w-2/3 rounded bg-slate-200/80"></div>
                <div className="h-4 w-1/3 rounded bg-slate-200/60"></div>
              </div>
            </div>
            <div className="border-t border-slate-50 pt-3 space-y-2">
              <div className="h-4 w-full rounded bg-slate-200/60"></div>
              <div className="h-4 w-4/5 rounded bg-slate-200/60"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

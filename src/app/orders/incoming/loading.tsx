export default function IncomingOrdersLoading() {
  return (
    <div className="w-full space-y-6 p-4 animate-pulse">
      {/* Date & Filters bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="h-10 w-48 rounded-xl bg-slate-200/80"></div>
        <div className="flex gap-2">
          <div className="h-10 w-28 rounded-xl bg-slate-200/60"></div>
          <div className="h-10 w-28 rounded-xl bg-slate-200/60"></div>
        </div>
      </div>

      {/* Orders list skeleton */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-slate-100 bg-white p-5 space-y-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <div className="h-5 w-32 rounded bg-slate-200/80"></div>
                <div className="h-4 w-24 rounded bg-slate-200/60"></div>
              </div>
              <div className="h-8 w-24 rounded-full bg-slate-200/80"></div>
            </div>
            <div className="border-t border-slate-50 pt-3 flex items-center justify-between">
              <div className="space-y-1">
                <div className="h-4 w-20 rounded bg-slate-200/60"></div>
                <div className="h-5 w-28 rounded bg-slate-200/80"></div>
              </div>
              <div className="h-10 w-10 rounded-full bg-slate-200/60"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

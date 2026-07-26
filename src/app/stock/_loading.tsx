export default function StockLoading() {
  return (
    <div className="w-full space-y-6 p-4 animate-pulse">
      {/* Warehouse and date bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="h-10 w-48 rounded-xl bg-slate-200/80"></div>
        <div className="h-10 w-36 rounded-xl bg-slate-200/80"></div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-100 pb-3">
        <div className="h-8 w-24 rounded bg-slate-200/60"></div>
        <div className="h-8 w-28 rounded bg-slate-200/60"></div>
        <div className="h-8 w-28 rounded bg-slate-200/60"></div>
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="bg-slate-50 h-12 w-full border-b border-slate-100"></div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 space-x-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="h-12 w-12 rounded-xl bg-slate-200/60 shrink-0"></div>
                <div className="space-y-1.5 flex-1">
                  <div className="h-5 w-1/3 rounded bg-slate-200/80"></div>
                  <div className="h-4 w-1/5 rounded bg-slate-200/60"></div>
                </div>
              </div>
              <div className="h-5 w-16 rounded bg-slate-200/60"></div>
              <div className="h-5 w-20 rounded bg-slate-200/80"></div>
              <div className="h-5 w-16 rounded bg-slate-200/60"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

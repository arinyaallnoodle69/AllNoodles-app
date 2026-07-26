export default function SettingsLoading() {
  return (
    <div className="w-full space-y-6 p-4 animate-pulse">
      {/* Title skeleton */}
      <div className="h-8 w-48 rounded bg-slate-200/80 mb-6"></div>
      
      {/* Grid of settings options skeletons */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-slate-100 bg-white p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-4 sm:flex-col sm:items-start sm:gap-5">
              <div className="h-12 w-12 rounded-2xl bg-slate-200/60 shrink-0"></div>
              <div className="h-6 w-32 rounded bg-slate-200/80"></div>
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-slate-200/60"></div>
              <div className="h-4 w-4/5 rounded bg-slate-200/60"></div>
            </div>
            <div className="h-4 w-20 rounded bg-slate-200/80 pt-2"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

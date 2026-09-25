export default function BillingLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10 animate-pulse">
      {/* Header Skeleton */}
      <div className="mb-8 flex items-center gap-4">
        <div className="h-14 w-14 bg-slate-200/80 rounded-lg shrink-0"></div>
        <div className="space-y-2">
          <div className="h-8 w-48 rounded bg-slate-200/80"></div>
          <div className="h-4 w-64 rounded bg-slate-200/60"></div>
        </div>
      </div>

      {/* Tabs Skeleton */}
      <div className="mb-8 flex border-b border-slate-200">
        <div className="h-12 flex-1 border-b-4 border-[#4A148C]/40 bg-slate-100/50"></div>
        <div className="h-12 flex-1 border-b-4 border-transparent bg-slate-50/30"></div>
      </div>

      {/* Form / Filters Skeleton */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="h-12 rounded-xl bg-slate-200/60"></div>
          <div className="h-12 rounded-xl bg-slate-200/60"></div>
        </div>
        <div className="h-32 rounded-xl bg-slate-100"></div>
      </div>
    </div>
  );
}


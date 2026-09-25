export default function DashboardLoading() {
  return (
    <div className="mx-auto mt-1 max-w-7xl space-y-6 px-5 py-4 animate-pulse">
      {/* Header bar skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-44 rounded-xl bg-slate-200/80"></div>
          <div className="h-4 w-32 rounded bg-slate-200/60"></div>
        </div>
        <div className="hidden h-10 w-36 rounded-2xl bg-slate-200/60 md:block"></div>
      </div>

      {/* Action buttons & Overview card skeleton */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="order-1 grid grid-cols-2 gap-4 xl:order-2 xl:col-span-4 xl:grid-cols-1">
          <div className="h-[4.25rem] rounded-[1rem] bg-slate-200/80"></div>
          <div className="h-[4.25rem] rounded-[1rem] bg-slate-200/60"></div>
        </div>

        <div className="order-2 flex flex-col gap-4 xl:order-1 xl:col-span-8">
          <div className="flex h-28 items-center gap-5 rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="h-14 w-14 rounded-3xl bg-slate-200/70 shrink-0"></div>
            <div className="flex-1 space-y-2">
              <div className="h-5 w-48 rounded bg-slate-200/70"></div>
              <div className="h-8 w-24 rounded bg-slate-200/80"></div>
            </div>
          </div>

          {/* 3 Metric Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <div className="h-28 rounded-[1.25rem] border border-slate-200 bg-white p-4"></div>
            <div className="h-28 rounded-[1.25rem] border border-slate-200 bg-white p-4"></div>
            <div className="h-28 rounded-[1.25rem] border border-slate-200 bg-white p-4"></div>
          </div>
        </div>
      </div>
    </div>
  );
}


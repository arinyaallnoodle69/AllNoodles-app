export default function OrdersLoading() {
  return (
    <div className="w-full space-y-6 p-4 animate-pulse">
      <div className="h-8 w-48 rounded bg-slate-200/80 mb-6"></div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-slate-100 bg-white p-5 space-y-4 shadow-sm">
            <div className="h-5 w-1/3 rounded bg-slate-200/80"></div>
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-slate-200/60"></div>
              <div className="h-4 w-4/5 rounded bg-slate-200/60"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

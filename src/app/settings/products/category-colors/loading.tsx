"use client";

import { Palette } from "lucide-react";

export default function CategoryColorsLoading() {
  return (
    <div className="min-h-screen bg-white text-slate-950 lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="border-r border-slate-200 bg-white lg:min-h-screen">
        {/* Desktop sidebar header skeleton */}
        <div className="hidden border-b border-slate-200 px-5 py-6 lg:block">
          <div className="mb-4 h-5 w-36 animate-pulse rounded bg-slate-100" />
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E1BEE7] bg-white text-[#4A148C]">
              <Palette className="h-6 w-6" strokeWidth={2.1} />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-slate-950">สีหมวดหมู่ในใบออเดอร์</h1>
              <p className="text-sm font-semibold text-slate-500">กำหนดสีสำหรับแยกหมวดหมู่ในใบออเดอร์</p>
            </div>
          </div>
        </div>

        {/* Mobile header skeleton */}
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-4 lg:hidden">
          <div className="flex items-center justify-center">
            <h1 className="text-lg font-black text-[#4A148C]">สีหมวดหมู่ในใบออเดอร์</h1>
          </div>
        </div>

        {/* Category list skeleton */}
        <div className="space-y-1 px-4 py-4 lg:px-5 lg:py-5">
          <div className="mb-3 h-11 w-full animate-pulse rounded-md border border-slate-200 bg-slate-50" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3.5">
              <div
                className="ml-2 h-11 w-11 animate-pulse rounded-md bg-slate-100"
                style={{ animationDelay: `${i * 80}ms` }}
              />
              <div className="flex-1 space-y-2">
                <div
                  className="h-4 w-24 animate-pulse rounded bg-slate-100"
                  style={{ animationDelay: `${i * 80 + 40}ms` }}
                />
                <div
                  className="h-3 w-16 animate-pulse rounded bg-slate-50"
                  style={{ animationDelay: `${i * 80 + 60}ms` }}
                />
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Desktop editor skeleton */}
      <main className="hidden min-w-0 lg:block">
        <div className="border-b border-slate-200 bg-slate-50/60 px-8 py-6">
          <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-24 w-full animate-pulse rounded-md border border-slate-200 bg-white" />
        </div>
        <div className="max-w-[580px] space-y-6 px-8 py-8">
          <div className="h-6 w-32 animate-pulse rounded bg-slate-100" />
          <div className="flex items-center gap-6">
            <div className="h-[88px] w-[88px] animate-pulse rounded-md bg-slate-100" />
            <div className="space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
              <div className="h-12 w-48 animate-pulse rounded-md border border-slate-200 bg-slate-50" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-4 w-56 animate-pulse rounded bg-slate-100" />
            <div className="grid grid-cols-6 gap-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-md bg-slate-100"
                  style={{ animationDelay: `${i * 50}ms` }}
                />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

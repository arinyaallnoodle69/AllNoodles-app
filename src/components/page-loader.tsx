"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

function getNextProgress(current: number) {
  if (current < 42) return current + 7;
  if (current < 72) return current + 4;
  if (current < 90) return current + 2;
  if (current < 99) return current + 1;
  return 99;
}

function getDelay(current: number) {
  if (current < 42) return 90;
  if (current < 72) return 150;
  if (current < 90) return 260;
  return 520;
}

export function PageLoader() {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    let progress = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      progress = Math.min(99, getNextProgress(progress));
      setPercent(progress);

      if (progress < 99) {
        timeoutId = setTimeout(tick, getDelay(progress));
      }
    };

    timeoutId = setTimeout(tick, 120);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-transparent p-6 font-sans">
      <section className="relative flex w-full max-w-[24rem] flex-col items-center px-8 py-10">
        <div className="relative flex h-60 w-60 items-center justify-center">
          <Image
            src="/brand/logo1.png"
            alt="All Noodles"
            width={220}
            height={220}
            priority
            className="relative z-10 h-[220px] w-[220px] object-contain drop-shadow-[0_18px_44px_rgba(142,36,170,0.22)] animate-pulse"
          />
        </div>

        <div className="mt-6 flex w-full flex-col items-center">
          <div className="flex w-full items-center justify-between text-xs font-black uppercase tracking-[0.24em] text-[#64748B]">
            <span></span>
            <span className="font-mono text-[#4A148C]">{percent}%</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full border border-[#EA80FC] bg-[#F3E5F5]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#4A148C] to-[#4A148C] transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>

        </div>
      </section>
    </div>
  );
}

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
      <section className="relative flex w-full max-w-[22rem] flex-col items-center px-8 py-10">
        <div className="relative flex h-44 w-44 items-center justify-center">
          <Image
            src="/brand/logo1.png"
            alt="All Noodles"
            width={152}
            height={152}
            priority
            className="relative z-10 h-[152px] w-[152px] object-contain drop-shadow-[0_10px_24px_rgba(0,29,63,0.12)]"
          />
        </div>

        <div className="mt-6 flex w-full flex-col items-center">
          <div className="flex w-full items-center justify-between text-xs font-black uppercase tracking-[0.24em] text-[#64748B]">
            <span>กำลังโหลด</span>
            <span className="font-mono text-[#082A63]">{percent}%</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full border border-[#F2E3AE] bg-[#FAF7F2]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#082A63] to-[#103B82] transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>

        </div>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function ReserveStockDialog({ title, onClose, children, busy = false, ledger = false }: { title: string; onClose: () => void; children: React.ReactNode; busy?: boolean; ledger?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    const y = window.scrollY;
    const old = { position: document.body.style.position, top: document.body.style.top, width: document.body.style.width, overflow: document.body.style.overflow };
    Object.assign(document.body.style, { position: "fixed", top: `-${y}px`, width: "100%", overflow: "hidden" });
    ref.current?.focus();
    return () => { Object.assign(document.body.style, old); window.scrollTo(0, y); active?.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<div className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/40 sm:p-6 ${ledger ? "p-0" : "p-3"}`} onClick={event => { if (!busy && event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`flex w-full max-w-3xl flex-col overflow-hidden bg-white text-[#15154F] outline-none ${ledger ? "h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl" : "max-h-[90dvh] rounded-2xl"}`} onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); if (!busy) onClose(); }
      if (event.key === "Tab") {
        const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary,[tabindex="0"]')].filter(node => node.getClientRects().length > 0);
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header className="flex shrink-0 items-center justify-between gap-3 bg-[#4A148C] px-4 py-2 text-white"><h2 className="text-xl font-bold text-white">{title}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="ปิดหน้าต่าง" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-50"><X className="h-6 w-6" /></button></header>
      <div className={`min-h-0 overflow-y-auto overscroll-contain ${ledger ? "p-0" : "p-4 sm:p-6"}`}>{children}</div>
    </div>
  </div>, document.body);
}

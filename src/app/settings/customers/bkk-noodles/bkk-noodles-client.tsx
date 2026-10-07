"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { saveBkkNoodleCustomersAction } from "./actions";

export type BkkNoodleStore = {
  id: string;
  code: string;
  name: string;
  selected: boolean;
};

export function BkkNoodlesClient({ stores }: { stores: BkkNoodleStore[] }) {
  const [saved, setSaved] = useState(
    () => new Set(stores.filter((s) => s.selected).map((s) => s.id)),
  );
  const [selected, setSelected] = useState(saved);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
    );
  }, [stores, query]);

  const dirty =
    selected.size !== saved.size || [...selected].some((id) => !saved.has(id));

  function toggle(id: string) {
    setMessage(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const result = await saveBkkNoodleCustomersAction([...selected]);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setSaved(new Set(selected));
      setMessage({ type: "ok", text: "บันทึกแล้ว" });
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-28">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">ค้นหาร้านค้า</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อหรือรหัสร้าน"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-base text-slate-900 outline-none transition focus:border-[#4A148C] focus:ring-4 focus:ring-[#4A148C]/10"
          />
        </label>
        <p className="text-sm font-semibold text-slate-500 sm:text-right">
          รถกรุงเทพ {stores.length} ร้าน
        </p>
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-200 bg-white">
        {visible.map((store) => {
          const checked = selected.has(store.id);
          return (
            <li key={store.id}>
              <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 transition active:bg-slate-50 sm:px-5 lg:hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(store.id)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 border-slate-300 text-white transition peer-checked:border-[#4A148C] peer-checked:bg-[#4A148C] peer-focus-visible:ring-4 peer-focus-visible:ring-[#4A148C]/20"
                >
                  <Check className={`h-4 w-4 ${checked ? "opacity-100" : "opacity-0"}`} strokeWidth={3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold text-slate-900">{store.name}</span>
                  <span className="block text-xs font-semibold text-slate-400">{store.code}</span>
                </span>
                {checked ? (
                  <span className="shrink-0 rounded-full bg-[#4A148C]/10 px-2.5 py-1 text-xs font-bold text-[#4A148C]">
                    ใบที่ 2
                  </span>
                ) : null}
              </label>
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li className="px-5 py-10 text-center text-sm font-semibold text-slate-400">ไม่พบร้านค้า</li>
        ) : null}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">
              ใบที่ 2 (บะหมี่): {selected.size} ร้าน
            </p>
            <p
              role="status"
              className={`truncate text-xs font-semibold ${
                message?.type === "error" ? "text-red-600" : "text-slate-400"
              }`}
            >
              {message?.text ?? (dirty ? "มีการเปลี่ยนแปลงที่ยังไม่บันทึก" : "ลำดับร้านเรียงตามหน้าจัดการร้านค้า")}
            </p>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="inline-flex h-12 min-w-28 items-center justify-center gap-2 rounded-2xl bg-[#4A148C] px-6 text-base font-bold text-white transition enabled:active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

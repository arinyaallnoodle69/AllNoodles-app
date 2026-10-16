"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Scope = { customerId: string; date: string };
type EntryState = {
  counts: Record<string, number>;
  locks: { customerId: string; displayName: string; expiresAt: string; owned: boolean }[];
  granted: boolean;
  orderedCount: number;
  topic: string;
};

export function useOrderEntry(open: boolean, date: string) {
  const token = useRef("");
  const active = useRef<Scope | null>(null);
  const selecting = useRef(false);
  const saving = useRef(false);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [locks, setLocks] = useState<EntryState["locks"]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (action: string, scope: Scope, keepalive = false) => {
    token.current ||= crypto.randomUUID();
    const input = { ...scope, token: token.current, action };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = action === "state"
        ? await fetch(`/api/orders/entry?${new URLSearchParams(input)}`, { cache: "no-store", signal: controller.signal })
        : await fetch("/api/orders/entry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), keepalive, signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "ตรวจสอบสิทธิ์กรอกออเดอร์ไม่สำเร็จ");
      return data as EntryState;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("เชื่อมต่อใช้เวลานาน กรุณาลองใหม่ ข้อมูลที่กรอกยังอยู่");
      throw error;
    } finally { clearTimeout(timeout); }
  }, []);

  const release = useCallback(() => {
    const previous = active.current;
    active.current = null;
    setReady(false);
    setError(null);
    if (previous) void request("release", previous, true).catch(() => {});
  }, [request]);

  const releaseIfNotSaving = useCallback(() => {
    if (!saving.current) release();
  }, [release]);

  const select = useCallback(async (customerId: string, orderDate: string) => {
    if (selecting.current || saving.current) return false;
    selecting.current = true;
    setBusy(true);
    setError(null);
    const scope = { customerId, date: orderDate };
    try {
      const data = await request("acquire", scope);
      setCounts(data.counts);
      setLocks(data.locks);
      if (!data.granted) {
        const holder = data.locks.find(lock => lock.customerId === customerId);
        setError(`${holder?.displayName || "ผู้ใช้อื่น"} กำลังกรอกออเดอร์ร้านนี้ กรุณารอให้บันทึกเสร็จ`);
        return false;
      }
      if (data.orderedCount > 0 && !window.confirm("ร้านนี้มีออเดอร์ในวันที่เลือกแล้ว ต้องการเพิ่มรายการเข้าออเดอร์เดิมใช่ไหม?")) {
        await request("release", scope);
        if (active.current?.customerId === customerId && active.current.date === orderDate) {
          active.current = null;
          setReady(false);
        }
        return false;
      }
      const previous = active.current;
      active.current = scope;
      setReady(true);
      if (previous && (previous.customerId !== customerId || previous.date !== orderDate)) void request("release", previous).catch(() => {});
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
      return false;
    } finally {
      selecting.current = false;
      setBusy(false);
    }
  }, [request]);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let refreshing = false;
    let refreshQueued = false;
    const admin = createClient();
    let channel: ReturnType<typeof admin.channel> | undefined;
    async function refresh(renew = false) {
      if (disposed || document.visibilityState === "hidden") return;
      if (refreshing) { refreshQueued = true; return; }
      refreshing = true;
      const scope = active.current;
      try {
        const data = await request(renew && scope && !saving.current ? "renew" : "state", scope ?? { customerId: "", date });
        if (disposed) return;
        if (!channel) {
          channel = admin.channel(data.topic).on("broadcast", { event: "changed" }, () => { void refresh(); }).subscribe(status => {
            if (status === "SUBSCRIBED") void refresh();
          });
        }
        if (scope?.date === date || !scope) {
          setCounts(data.counts);
          setLocks(data.locks);
        }
        if (scope && active.current === scope && !saving.current && !selecting.current) {
          const owned = data.locks.some(lock => lock.customerId === scope.customerId && lock.owned);
          setReady(owned);
          setError(owned ? null : "สิทธิ์กรอกออเดอร์หมดอายุ กรุณาเลือกร้านค้าใหม่ ข้อมูลที่กรอกยังอยู่");
        }
      } catch {
        if (!disposed && active.current && !saving.current) {
          setReady(false);
          setError("ขาดการเชื่อมต่อ กำลังตรวจสอบสิทธิ์ก่อนบันทึก ข้อมูลที่กรอกยังอยู่");
        }
      } finally {
        refreshing = false;
        if (refreshQueued && !disposed) { refreshQueued = false; void refresh(); }
      }
    }
    void refresh(true);
    const timer = setInterval(() => { void refresh(true); }, 20000);
    const recovery = () => { void refresh(true); };
    const offline = () => { setReady(false); setError("ออฟไลน์ กรุณาเชื่อมต่อก่อนบันทึก ข้อมูลที่กรอกยังอยู่"); };
    const pagehide = releaseIfNotSaving;
    window.addEventListener("online", recovery);
    window.addEventListener("focus", recovery);
    window.addEventListener("offline", offline);
    window.addEventListener("pagehide", pagehide);
    document.addEventListener("visibilitychange", recovery);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("online", recovery);
      window.removeEventListener("focus", recovery);
      window.removeEventListener("offline", offline);
      window.removeEventListener("pagehide", pagehide);
      document.removeEventListener("visibilitychange", recovery);
      if (channel) void admin.removeChannel(channel);
    };
  }, [open, date, request, releaseIfNotSaving]);

  useEffect(() => {
    if (!open) release();
    return releaseIfNotSaving;
  }, [open, release, releaseIfNotSaving]);

  return { token, counts, locks, ready, busy, error, select, release, saving };
}

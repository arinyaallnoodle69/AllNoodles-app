"use client";

import { useSyncExternalStore } from "react";

export function getClientRole(): "admin" | "member" | "warehouse" | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^|;)\s*allnoodles_session\s*=\s*([^;]+)/);
  if (!match) return null;
  const value = decodeURIComponent(match[2]);
  const parts = value.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[0].replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = atob(base64);
    const payload = JSON.parse(jsonStr);
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function useClientRole() {
  return useSyncExternalStore(
    () => () => {},
    getClientRole,
    () => null,
  );
}

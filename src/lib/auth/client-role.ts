"use client";

import { useSyncExternalStore } from "react";

type ClientRole = "admin" | "member" | "warehouse";

function parseRole(value: string | undefined): ClientRole | null {
  return value === "admin" || value === "member" || value === "warehouse" ? value : null;
}

function getCookieValue(name: string) {
  if (typeof document === "undefined") return null;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getClientRole(): "admin" | "member" | "warehouse" | null {
  const roleCookie = parseRole(getCookieValue("allnoodles_role") ?? undefined);
  if (roleCookie) return roleCookie;

  const value = getCookieValue("allnoodles_session");
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[0].replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = atob(base64);
    const payload = JSON.parse(jsonStr);
    return parseRole(payload.role);
  } catch {
    return null;
  }
}

export function useClientRole() {
  return useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("allnoodles-role-change", onStoreChange);
      return () => window.removeEventListener("allnoodles-role-change", onStoreChange);
    },
    getClientRole,
    () => null,
  );
}

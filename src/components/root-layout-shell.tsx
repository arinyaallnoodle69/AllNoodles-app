"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { AppSidebarLayout } from "@/components/app-sidebar";

const APP_SHELL_PATHS = [
  "/billing",
  "/dashboard",
  "/orders/fresh-reserve",
  "/orders/incoming",
  "/reports",
  "/settings",
  "/stock",
];

export function RootAppLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const usesAppShell =
    pathname !== "/billing/print" &&
    APP_SHELL_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  return usesAppShell ? <AppSidebarLayout>{children}</AppSidebarLayout> : <>{children}</>;
}

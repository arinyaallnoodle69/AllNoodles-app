"use client";

import { useEffect, useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface PullToRefreshProps {
  children: React.ReactNode;
}

export function PullToRefresh({ children }: PullToRefreshProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshState, setRefreshState] = useState<"idle" | "pulling" | "refreshing">("idle");
  const [isRoutePullRefreshDisabled, setIsRoutePullRefreshDisabled] = useState(false);

  const startY = useRef(0);
  const isPulling = useRef(false);
  const PULL_THRESHOLD = 75; // Distance to trigger refresh (px)
  const MAX_PULL = 110;       // Max distance allowed (px)

  function isPathPullRefreshDisabled(pathname: string) {
    return (
      pathname === "/login" ||
      pathname.startsWith("/login/") ||
      pathname.includes("/print") ||
      pathname.includes("/preview")
    );
  }

  const isPullRefreshDisabled = isRoutePullRefreshDisabled;

  function isInsideRefreshBlockedSurface(target: EventTarget | null) {
    let element = target instanceof HTMLElement ? target : null;

    while (element && element !== document.body) {
      if (
        element.matches(
          '[aria-modal="true"], [data-drawer="true"], [data-popup="true"], [data-disable-pull-refresh="true"]',
        )
      ) {
        return true;
      }

      const classes = typeof element.className === "string" ? element.className : "";
      if (classes.includes("fixed") && classes.includes("inset-0")) {
        return true;
      }

      element = element.parentElement;
    }

    return false;
  }

  useEffect(() => {
    setIsRoutePullRefreshDisabled(isPathPullRefreshDisabled(window.location.pathname));
  }, []);

  useEffect(() => {
    if (isPullRefreshDisabled) {
      isPulling.current = false;
      setRefreshState("idle");
      setPullDistance(0);
      return;
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (isPathPullRefreshDisabled(window.location.pathname)) return;
      if (isInsideRefreshBlockedSurface(e.target)) return;

      // Only start pull if main page is at absolute top
      if (window.scrollY > 0) return;

      // Check if touch target is inside a scrollable container that is already scrolled down
      let target = e.target as HTMLElement | null;
      while (target && target !== document.body) {
        if (target.scrollTop > 0) {
          return; // Don't trigger if inside scrollable content
        }
        target = target.parentElement;
      }

      if (refreshState === "idle" && !isPending) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current) return;

      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;

      if (diff > 0) {
        // Prevent default browser elastic bounce/reload when pulling down
        if (e.cancelable) {
          e.preventDefault();
        }

        const dampedDiff = Math.min(MAX_PULL, diff * 0.4);
        setPullDistance(dampedDiff);

        if (dampedDiff >= PULL_THRESHOLD) {
          setRefreshState("pulling");
        } else {
          setRefreshState("idle");
        }
      }
    };

    const handleTouchEnd = () => {
      if (!isPulling.current) return;
      isPulling.current = false;

      if (pullDistance >= PULL_THRESHOLD) {
        setRefreshState("refreshing");
        setPullDistance(50); // Keep spinner visible at 50px offset

        startTransition(async () => {
          try {
            // Trigger Next.js route data refresh
            router.refresh();

            // Artificial delay for smooth UX transition
            await new Promise((resolve) => setTimeout(resolve, 800));
          } catch (err) {
            console.error("[PullToRefresh] Failed to refresh route data", err);
          } finally {
            setRefreshState("idle");
            setPullDistance(0);
          }
        });
      } else {
        setRefreshState("idle");
        setPullDistance(0);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [pullDistance, refreshState, isPending, isPullRefreshDisabled, router]);

  // Keep showing spinner while transition is pending
  const showSpinner = refreshState === "refreshing" || isPending;
  const activeDistance = showSpinner ? 50 : pullDistance;

  return (
    <div className="relative w-full">
      {/* ─── Premium Modern Indicator ─── */}
      {!isPullRefreshDisabled && (activeDistance > 0 || showSpinner) && (
        <div
          style={{
            height: `${activeDistance}px`,
            opacity: activeDistance > 0 ? 1 : 0,
            transition: isPulling.current ? "none" : "all 300ms cubic-bezier(0.2, 0.8, 0.2, 1)"
          }}
          className="absolute top-0 left-0 right-0 z-[100] flex items-center justify-center overflow-hidden pointer-events-none"
        >
          <div
            style={{
              transform: `scale(${Math.min(1, activeDistance / PULL_THRESHOLD)})`,
              transition: isPulling.current ? "none" : "all 200ms ease-out"
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-800 shadow-xl border border-slate-100/50"
          >
            <Loader2
              style={{
                transform: showSpinner
                  ? "none"
                  : `rotate(${activeDistance * 4.5}deg)`
              }}
              className={`h-5 w-5 text-[#4A148C] ${showSpinner ? "animate-spin" : ""}`}
            />
          </div>
        </div>
      )}

      {/* ─── Content Wrapper with smooth sliding transition ─── */}
      <div
        style={{
          transform: activeDistance > 0 ? `translateY(${activeDistance}px)` : undefined,
          transition: isPulling.current ? "none" : "all 300ms cubic-bezier(0.2, 0.8, 0.2, 1)"
        }}
      >
        {children}
      </div>
    </div>
  );
}

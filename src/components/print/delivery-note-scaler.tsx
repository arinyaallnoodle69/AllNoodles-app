"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

export function DeliveryNoteScaler({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function updateScale() {
      // Create a temporary element to measure 210mm in pixels at device DPI
      const dummy = document.createElement("div");
      dummy.style.width = `${A4_WIDTH_MM}mm`;
      dummy.style.position = "absolute";
      dummy.style.visibility = "hidden";
      document.body.appendChild(dummy);
      const sheetWidth = dummy.offsetWidth;
      document.body.removeChild(dummy);

      // Available window or parent width minus padding for mobile
      const viewportWidth = Math.min(window.innerWidth, document.documentElement.clientWidth);
      const parentWidth = containerRef.current?.parentElement?.clientWidth ?? viewportWidth;
      const availableWidth = Math.min(parentWidth - 12, viewportWidth - 16);

      if (availableWidth > 0 && sheetWidth > availableWidth) {
        setScale(availableWidth / sheetWidth);
      } else {
        setScale(1);
      }
    }

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  return (
    <div
      ref={containerRef}
      className="dn-scaler-outer"
      style={
        scale < 1
          ? {
              width: `${A4_WIDTH_MM * scale}mm`,
              height: `${A4_HEIGHT_MM * scale}mm`,
              maxWidth: "100%",
              overflow: "hidden",
              margin: "0 auto 16px auto",
              display: "block",
              boxShadow: "0 4px 24px rgba(15, 23, 42, 0.14)",
              borderRadius: "2px",
            }
          : {
              width: "auto",
              display: "flex",
              justifyContent: "center",
              marginBottom: "24px",
            }
      }
    >
      <div
        className="dn-scaler-inner"
        style={
          scale < 1
            ? {
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                width: `${A4_WIDTH_MM}mm`,
                flexShrink: 0,
              }
            : {
                width: `${A4_WIDTH_MM}mm`,
                flexShrink: 0,
              }
        }
      >
        {children}
      </div>
    </div>
  );
}

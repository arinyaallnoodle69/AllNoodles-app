"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type ProductImagePreviewProps = {
  alt: string;
  src: string;
  thumbnailSizes: string;
};

export function ProductImagePreview({ alt, src, thumbnailSizes }: ProductImagePreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPreviewLoaded, setIsPreviewLoaded] = useState(false);
  const warmedRef = useRef(false);
  const isLocalAsset = src.startsWith("/");

  const warmImage = useCallback(() => {
    if (warmedRef.current || typeof window === "undefined") return;
    warmedRef.current = true;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const estimate = Math.round(Math.min(window.innerWidth * dpr, 1280));
    const steps = [640, 750, 828, 1080, 1200, 1440, 1920];
    const highResWidth = steps.find((step) => step >= estimate) ?? 1920;

    const prewarmUrl = isLocalAsset
      ? src
      : `/_next/image?url=${encodeURIComponent(src)}&w=${highResWidth}&q=75`;

    const img = new window.Image();
    img.decoding = "async";
    img.src = prewarmUrl;
  }, [isLocalAsset, src]);

  const openPreview = useCallback(() => {
    setIsPreviewLoaded(false);
    warmImage();
    setIsOpen(true);
  }, [warmImage]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={openPreview}
        onPointerEnter={warmImage}
        onPointerDown={warmImage}
        onTouchStart={warmImage}
        onFocus={warmImage}
        className="group h-full w-full cursor-zoom-in"
        aria-label={`Preview image: ${alt}`}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes={thumbnailSizes}
          className="object-contain bg-white p-1 transition-transform duration-200 group-hover:scale-[1.02]"
        />
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-md"
          onClick={() => setIsOpen(false)}
        >
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-lg transition hover:bg-white"
            aria-label="Close image preview"
          >
            <X className="h-5 w-5" strokeWidth={2.4} />
          </button>

          <div
            className="relative h-[min(78vh,760px)] w-[min(92vw,980px)]"
            onClick={(event) => event.stopPropagation()}
          >
            {!isPreviewLoaded ? (
              <div className="absolute inset-0 animate-pulse rounded-md bg-white/12" />
            ) : null}
            <Image
              src={src}
              alt={alt}
              fill
              sizes="(max-width: 768px) 92vw, 980px"
              quality={75}
              loading="eager"
              fetchPriority="high"
              className={`object-contain transition-opacity duration-200 ${isPreviewLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setIsPreviewLoaded(true)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

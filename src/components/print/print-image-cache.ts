"use client";

export type RestorableImage = {
  image: HTMLImageElement;
  src: string;
  srcSet: string | null;
  sizes: string | null;
  crossOrigin: string | null;
  loading: string | null;
  decoding: string | null;
};

// In-memory cache for Base64 Data URLs so images are fetched and converted only ONCE per session.
const imageBase64Cache = new Map<string, Promise<string>>();

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("อ่านไฟล์รูปไม่สำเร็จ"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Fetch an image URL and convert to Base64 data URL, caching the result.
 * If the fetch fails, returns null instead of throwing so document export can continue.
 */
export async function getCachedImageDataUrl(src: string): Promise<string | null> {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) {
    return src || null;
  }

  const cached = imageBase64Cache.get(src);
  if (cached) {
    try {
      return await cached;
    } catch {
      imageBase64Cache.delete(src);
    }
  }

  const fetchPromise = (async () => {
    const response = await fetch(src, { cache: "force-cache", mode: "cors" });
    if (!response.ok) {
      throw new Error(`โหลดรูปไม่สำเร็จ (${response.status})`);
    }
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  })();

  imageBase64Cache.set(src, fetchPromise);

  try {
    return await fetchPromise;
  } catch (error) {
    console.warn(`[print-image-cache] Failed to inline image: ${src}`, error);
    imageBase64Cache.delete(src);
    return null;
  }
}

/**
 * Inlines all <img> tags inside target elements into Base64 Data URLs.
 * Ensures images are eager, sync-decoded, and pre-rendered before capture/print.
 */
export async function inlineCaptureImages(targets: HTMLElement[]): Promise<RestorableImage[]> {
  const images = Array.from(
    new Set(targets.flatMap((target) => Array.from(target.querySelectorAll<HTMLImageElement>("img")))),
  );
  const restorable: RestorableImage[] = [];

  // Group unique src URLs to fetch in parallel without duplicate network requests
  const uniqueSrcs = Array.from(
    new Set(
      images
        .map((img) => img.currentSrc || img.src)
        .filter((src) => Boolean(src && !src.startsWith("data:") && !src.startsWith("blob:"))),
    ),
  );

  // Pre-fetch all unique images concurrently
  await Promise.all(uniqueSrcs.map((src) => getCachedImageDataUrl(src)));

  // Apply inlined data URLs to DOM elements
  await Promise.all(
    images.map(async (image) => {
      const src = image.currentSrc || image.src;
      if (!src) return;

      if (src.startsWith("data:") || src.startsWith("blob:")) {
        try {
          await image.decode();
        } catch {
          // Ignore decode error for already inlined images
        }
        return;
      }

      const dataUrl = await getCachedImageDataUrl(src);
      if (!dataUrl) return;

      restorable.push({
        image,
        src: image.src,
        srcSet: image.getAttribute("srcset"),
        sizes: image.getAttribute("sizes"),
        crossOrigin: image.getAttribute("crossorigin"),
        loading: image.getAttribute("loading"),
        decoding: image.getAttribute("decoding"),
      });

      image.removeAttribute("crossorigin");
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      image.setAttribute("loading", "eager");
      image.setAttribute("decoding", "sync");
      image.src = dataUrl;

      try {
        await image.decode();
      } catch {
        // Silently continue if decode fails
      }
    }),
  );

  return restorable;
}

/**
 * Restores <img> tags back to their original attributes.
 */
export function restoreCaptureImages(images: RestorableImage[]): void {
  images.forEach(({ image, src, srcSet, sizes, crossOrigin, loading, decoding }) => {
    image.src = src;
    if (srcSet === null) image.removeAttribute("srcset");
    else image.setAttribute("srcset", srcSet);
    if (sizes === null) image.removeAttribute("sizes");
    else image.setAttribute("sizes", sizes);
    if (crossOrigin === null) image.removeAttribute("crossorigin");
    else image.setAttribute("crossorigin", crossOrigin);
    if (loading === null) image.removeAttribute("loading");
    else image.setAttribute("loading", loading);
    if (decoding === null) image.removeAttribute("decoding");
    else image.setAttribute("decoding", decoding);
  });
}

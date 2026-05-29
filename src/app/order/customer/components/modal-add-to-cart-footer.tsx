"use client";

import { memo, useCallback, useState, type MutableRefObject } from "react";
import { Check, Loader2, Lock, Minus, Plus, ShoppingCart } from "lucide-react";
import { useLiff } from "@/components/liff-provider";

const ModalQuantityStepper = memo(function ModalQuantityStepper({
  quantity,
  unitLabel,
  onDecrease,
  onIncrease,
}: {
  quantity: number;
  unitLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="flex items-center rounded-2xl border border-slate-300/90 bg-slate-100 p-1.5 shadow-[0_8px_16px_rgba(15,23,42,0.04)] touch-manipulation">
      <button
        onClick={onDecrease}
        className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all active:scale-95 ${
          quantity > 0
            ? "border border-slate-400 bg-slate-200 text-slate-900 shadow-sm active:bg-slate-300"
            : "pointer-events-none text-slate-400/60 bg-slate-200/30 border border-slate-200/30"
        }`}
        aria-label="decrease quantity"
      >
        <Minus className="h-5 w-5" strokeWidth={3} />
      </button>

      <div className="flex w-[68px] select-none flex-col items-center justify-center">
        <span className="text-[18px] font-black leading-none text-slate-900 [font-variant-numeric:tabular-nums]">
          {quantity}
        </span>
        <span className="mt-1 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-slate-500 truncate max-w-full px-1">
          {unitLabel}
        </span>
      </div>

      <button
        onClick={onIncrease}
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#00264d] text-white shadow-md shadow-blue-950/20 transition-all active:scale-95 touch-manipulation hover:bg-[#001c38]"
        aria-label="increase quantity"
      >
        <Plus className="h-5 w-5" strokeWidth={3} />
      </button>
    </div>
  );
});

export const ModalAddToCartFooter = memo(function ModalAddToCartFooter({
  isOrderOpen,
  modalCartBtnRef,
  modalStepperRef,
  onAddToCart,
  onCloseModal,
  productId,
  productName,
  minOrderQty,
  primaryImageUrl,
  stepOrderQty,
  unitLabel,
  closedLabel,
  openLabel,
}: {
  isOrderOpen: boolean;
  modalCartBtnRef: MutableRefObject<HTMLButtonElement | null>;
  modalStepperRef: MutableRefObject<HTMLDivElement | null>;
  onAddToCart: (productId: string, quantity: number) => void;
  onCloseModal: () => void;
  productId: string;
  productName: string;
  minOrderQty: number;
  primaryImageUrl: string;
  stepOrderQty: number | null;
  unitLabel: string;
  closedLabel: string;
  openLabel: string;
}) {
  const { sendMessages, isInClient } = useLiff();
  const [pendingQty, setPendingQty] = useState(0);
  const [isInquiring, setIsInquiring] = useState(false);
  const [inquirySuccess, setInquirySuccess] = useState(false);

  const handleInquirePrice = async () => {
    if (isInquiring) return;
    setIsInquiring(true);
    setInquirySuccess(false);
    try {
      const msgText = `สอบถามราคา: ${productName} ราคาเท่าไหร่?`;
      if (isInClient) {
        await sendMessages([{ type: "text", text: msgText }]);
        setInquirySuccess(true);
        setTimeout(() => setInquirySuccess(false), 3000);
      } else {
        const encodedText = encodeURIComponent(msgText);
        window.open(`https://line.me/R/share?text=${encodedText}`, "_blank");
        setInquirySuccess(true);
        setTimeout(() => setInquirySuccess(false), 3000);
      }
    } catch (err) {
      console.error("Failed to send LINE OA price inquiry:", err);
    } finally {
      setIsInquiring(false);
    }
  };

  const handleDecrease = useCallback(() => {
    const minQty = minOrderQty ?? 1;
    const stepQty = stepOrderQty ?? 1;
    setPendingQty((prev) => {
      if (prev <= minQty) return 0;
      return prev - stepQty;
    });
  }, [minOrderQty, stepOrderQty]);

  const handleIncrease = useCallback(() => {
    if (!isOrderOpen) return;
    const minQty = minOrderQty ?? 1;
    const stepQty = stepOrderQty ?? 1;
    setPendingQty((prev) => (prev === 0 ? minQty : prev + stepQty));
  }, [isOrderOpen, minOrderQty, stepOrderQty]);

  const handleAddToCart = useCallback(() => {
    if (!isOrderOpen || pendingQty === 0) return;
    onAddToCart(productId, pendingQty);
    setPendingQty(0);

    const closeWithSlide = () => {
      window.requestAnimationFrame(() => {
        onCloseModal();
      });
    };

    const stepperEl = modalStepperRef.current;
    const cartEl = modalCartBtnRef.current;
    if (!stepperEl || !cartEl) {
      closeWithSlide();
      return;
    }

    const stepperRect = stepperEl.getBoundingClientRect();
    const cartRect = cartEl.getBoundingClientRect();
    const size = 48;
    const startX = stepperRect.left + stepperRect.width / 2 - size / 2;
    const startY = stepperRect.top + stepperRect.height / 2 - size / 2;
    const endX = cartRect.left + cartRect.width / 2 - size / 2;
    const endY = cartRect.top + cartRect.height / 2 - size / 2;

    const flyEl = document.createElement("div");
    flyEl.style.cssText = [
      "position:fixed",
      `left:${startX}px`,
      `top:${startY}px`,
      `width:${size}px`,
      `height:${size}px`,
      "border-radius:14px",
      "overflow:hidden",
      "box-shadow:0 12px 32px rgba(0,0,0,0.25)",
      "pointer-events:none",
      "z-index:9999",
    ].join(";");

    const imageNode = document.createElement("img");
    imageNode.src = primaryImageUrl;
    imageNode.style.cssText = "width:100%;height:100%;object-fit:cover";
    flyEl.appendChild(imageNode);
    document.body.appendChild(flyEl);

    const dx = endX - startX;
    const dy = endY - startY;
    flyEl
      .animate(
        [
          { transform: "translate(0,0) scale(1)", opacity: "1", offset: 0 },
          {
            transform: `translate(${dx * 0.6}px,${dy * 0.4}px) scale(0.85)`,
            opacity: "1",
            offset: 0.4,
          },
          {
            transform: `translate(${dx}px,${dy}px) scale(0.2)`,
            opacity: "0",
            offset: 1,
          },
        ],
        { duration: 550, easing: "cubic-bezier(0.4,0,0.2,1)", fill: "forwards" },
      )
      .addEventListener("finish", () => {
        document.body.removeChild(flyEl);
      });
    closeWithSlide();
  }, [isOrderOpen, modalCartBtnRef, modalStepperRef, onAddToCart, onCloseModal, pendingQty, primaryImageUrl, productId]);

  return (
    <div className="z-30 border-t border-slate-200/95 bg-[#f8fafc] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur-md">
      <div className="mx-auto max-w-lg flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <div ref={modalStepperRef} className="shrink-0">
            <ModalQuantityStepper
              quantity={pendingQty}
              unitLabel={unitLabel}
              onDecrease={handleDecrease}
              onIncrease={handleIncrease}
            />
          </div>

          <button
            disabled={!isOrderOpen || pendingQty === 0}
            onClick={handleAddToCart}
            className={`flex-1 flex items-center justify-center gap-2 h-14 rounded-2xl font-black transition-all active:scale-[0.97] px-4 ${
              !isOrderOpen
                ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                : pendingQty > 0
                  ? "bg-[#00264d] text-white shadow-[0_8px_20px_rgba(0,38,77,0.22)] hover:bg-[#001c38]"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            <div className="flex items-center gap-1.5 justify-center w-full min-w-0">
              {!isOrderOpen ? (
                <Lock className="h-5 w-5 shrink-0" strokeWidth={2.5} />
              ) : (
                <ShoppingCart className="h-5 w-5 shrink-0" strokeWidth={2.5} />
              )}
              <span className="text-[14px] xs:text-[15px] tracking-wide font-black truncate">
                {!isOrderOpen ? closedLabel : openLabel}
              </span>
            </div>
          </button>
        </div>

        {/* LINE OA chat price inquiry button */}
        <button
          onClick={handleInquirePrice}
          disabled={isInquiring}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#06C755] text-[13.5px] font-black text-white shadow-md shadow-emerald-950/15 transition-all hover:bg-[#05b04b] active:scale-[0.98] disabled:opacity-80"
        >
          {isInquiring ? (
            <Loader2 className="h-4.5 w-4.5 animate-spin" strokeWidth={3} />
          ) : inquirySuccess ? (
            <>
              <Check className="h-4.5 w-4.5" strokeWidth={3} />
              <span>ส่งคำถามไป LINE สำเร็จ!</span>
            </>
          ) : (
            <>
              <span className="text-[15px] leading-none">💬</span>
              <span>สอบถามราคา {productName}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
});

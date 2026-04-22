"use client";

import { memo, useCallback, useState, type MutableRefObject } from "react";
import { Lock, Minus, Plus, ShoppingCart } from "lucide-react";

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
    <div className="flex items-center rounded-[1.35rem] border border-slate-200 bg-white p-1.5 shadow-[0_16px_30px_rgba(15,23,42,0.08)] touch-manipulation">
      <button
        onClick={onDecrease}
        className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all active:scale-95 ${
          quantity > 0
            ? "border border-slate-200/70 bg-slate-50 text-slate-900 shadow-sm"
            : "pointer-events-none text-slate-300"
        }`}
        aria-label="decrease quantity"
      >
        <Minus className="h-5 w-5" strokeWidth={2.5} />
      </button>

      <div className="flex w-[84px] select-none flex-col items-center justify-center">
        <span className="text-[18px] font-black leading-none text-slate-900 [font-variant-numeric:tabular-nums]">
          {quantity}
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          {unitLabel}
        </span>
      </div>

      <button
        onClick={onIncrease}
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#003366] text-white shadow-md shadow-blue-900/15 transition-all active:scale-95 touch-manipulation"
        aria-label="increase quantity"
      >
        <Plus className="h-5 w-5" strokeWidth={2.5} />
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
  minOrderQty: number;
  primaryImageUrl: string;
  stepOrderQty: number | null;
  unitLabel: string;
  closedLabel: string;
  openLabel: string;
}) {
  const [pendingQty, setPendingQty] = useState(0);

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
    <div className="z-30 border-t border-slate-100 bg-white px-5 pb-8 pt-4 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center gap-3">
          <div ref={modalStepperRef}>
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
            className={`flex-1 flex items-center justify-center gap-2 h-14 rounded-2xl font-bold transition-all active:scale-95 ${
              !isOrderOpen
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : pendingQty > 0
                  ? "bg-[#003366] text-white shadow-md shadow-blue-900/20"
                  : "bg-slate-100 text-slate-300 cursor-not-allowed"
            }`}
          >
            <div className="flex items-center gap-1.5">
              {!isOrderOpen ? (
                <Lock className="h-4 w-4" strokeWidth={2} />
              ) : (
                <ShoppingCart className="h-4.5 w-4.5" strokeWidth={2} />
              )}
              <span className="text-[14px] font-bold">
                {!isOrderOpen ? closedLabel : openLabel}
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
});

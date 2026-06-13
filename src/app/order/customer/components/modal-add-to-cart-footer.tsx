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
    <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-1 touch-manipulation">
      <button
        onClick={onDecrease}
        className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all active:scale-95 ${
          quantity > 0
            ? "bg-[#EF4444] text-white shadow-sm shadow-red-500/10"
            : "pointer-events-none text-white/20 bg-white/5 border border-white/5"
        }`}
        aria-label="decrease quantity"
      >
        <Minus className="h-4.5 w-4.5" strokeWidth={3} />
      </button>

      <div className="flex w-[60px] select-none flex-col items-center justify-center">
        <span className="text-[18px] font-black leading-none text-white [font-variant-numeric:tabular-nums]">
          {quantity}
        </span>
        <span className="mt-1 text-[9px] font-black uppercase tracking-[0.06em] text-white truncate max-w-full px-1">
          {unitLabel}
        </span>
      </div>

      <button
        onClick={onIncrease}
        className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#AA00FF] shadow-sm transition-all active:scale-95 touch-manipulation hover:bg-white/90"
        aria-label="increase quantity"
      >
        <Plus className="h-4.5 w-4.5" strokeWidth={3} />
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
  organizationId: string;
  productId: string;
  productName: string;
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
    if (!isOrderOpen) {
      alert("ร้านปิดรับออเดอร์อยู่");
      return;
    }
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

    const modalCartBtn = modalCartBtnRef.current;
    const modalStepper = modalStepperRef.current;
    if (!modalCartBtn || !modalStepper) {
      closeWithSlide();
      return;
    }

    const stepperRect = modalStepper.getBoundingClientRect();
    const cartRect = modalCartBtn.getBoundingClientRect();

    const startX = stepperRect.left + stepperRect.width / 2;
    const startY = stepperRect.top + stepperRect.height / 2;
    const endX = cartRect.left + cartRect.width / 2;
    const endY = cartRect.top + cartRect.height / 2;

    const flyEl = document.createElement("div");
    flyEl.className = "fixed z-[600] pointer-events-none rounded-full overflow-hidden border-2 border-[#AA00FF] shadow-lg bg-white";
    flyEl.style.width = "48px";
    flyEl.style.height = "48px";
    flyEl.style.left = `${startX - 24}px`;
    flyEl.style.top = `${startY - 24}px`;

    const imgEl = document.createElement("img");
    imgEl.src = primaryImageUrl;
    imgEl.className = "w-full h-full object-cover";
    flyEl.appendChild(imgEl);

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
    <div className="z-30 border-t border-white/10 bg-[#8E24AA] px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
      <div className="mx-auto max-w-lg flex flex-row items-center gap-3">
        {/* Quantity Stepper Line */}
        <div ref={modalStepperRef} className="flex-shrink-0">
          <ModalQuantityStepper
            quantity={pendingQty}
            unitLabel={unitLabel}
            onDecrease={handleDecrease}
            onIncrease={handleIncrease}
          />
        </div>

        {/* Add to Cart Button Line */}
        <button
          disabled={!isOrderOpen || pendingQty === 0}
          onClick={handleAddToCart}
          className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-xl font-black transition-all active:scale-[0.97] px-4 ${      
            !isOrderOpen
              ? "bg-white/10 text-white/30 cursor-not-allowed"
              : pendingQty > 0
                ? "bg-white text-[#AA00FF] shadow-[0_8px_20px_rgba(255,255,255,0.15)] hover:bg-white/95"
                : "bg-white/10 text-white/40 cursor-not-allowed"
          }`}
        >
          <div className="flex items-center gap-1.5 justify-center w-full min-w-0">
            {!isOrderOpen ? (
              <Lock className="h-4.5 w-4.5 shrink-0" strokeWidth={2.5} />
            ) : (
              <ShoppingCart className="h-4.5 w-4.5 shrink-0" strokeWidth={2.5} />
            )}
            <span className="text-[14px] xs:text-[15px] tracking-wide font-black truncate">
              {!isOrderOpen ? closedLabel : openLabel}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
});

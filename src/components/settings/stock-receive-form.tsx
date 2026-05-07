"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Loader2,
  Minus,
  Package2,
  Plus,
  Save,
  Search,
  X,
  FileText,
  AlertTriangle,
} from "lucide-react";
import {
  useActionState,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
import { receiveStockAction } from "@/app/settings/stock/actions";
import type { ReceiveStockActionState } from "@/app/settings/stock/actions";
import type { StockProductOption } from "@/lib/stock/admin";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { getTodayInBangkok } from "@/lib/utils/date-client";

type StockReceiveFormProps = {
  products: StockProductOption[];
  returnHref: string;
  defaultProductId?: string;
};

type ReceiveStep = "date" | "select" | "photo" | "review";

const initialReceiveStockState: ReceiveStockActionState = {
  fieldErrors: {},
  message: "",
  status: "idle",
};

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(value: number, unit: string) {
  return `${value.toLocaleString("th-TH", { maximumFractionDigits: 3 })} ${unit}`;
}

export function StockReceiveForm({ products, returnHref, defaultProductId = "" }: StockReceiveFormProps) {
  const router = useRouter();
  const [actionState, formAction, isPending] = useActionState(receiveStockAction, initialReceiveStockState);
  
  const [currentStep, setCurrentStep] = useState<ReceiveStep>("date");
  const [receivedDate, setReceivedDate] = useState(() => getTodayInBangkok());
  
  // Multi-product selection state
  // key: productId, value: record of unitId -> quantity
  const [selections, setSelections] = useState<Record<string, Record<string, string>>>(() => {
    if (defaultProductId) {
      return { [defaultProductId]: {} };
    }
    return {};
  });

  const [receiptImage, setReceiptImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredQuery = useDeferredValue(searchQuery);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredProducts = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 40);
    return products.filter(p => 
      p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    ).slice(0, 40);
  }, [deferredQuery, products]);

  const selectedProductList = useMemo(() => {
    return products.filter(p => selections[p.id]);
  }, [products, selections]);

  const calculateProductTotals = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return { totalBaseQty: 0, totalCost: 0 };
    
    let totalBaseQty = 0;
    let totalCost = 0;
    const qtys = selections[productId] || {};
    
    for (const unit of product.saleUnits) {
      const val = qtys[unit.id];
      const qty = val ? Number(val) : 0;
      if (qty <= 0 || !Number.isFinite(qty)) continue;
      totalBaseQty += qty * unit.baseUnitQuantity;
      totalCost += qty * unit.effectiveCostPrice;
    }
    return { totalBaseQty, totalCost };
  };

  const grandTotals = useMemo(() => {
    let totalBaseQty = 0;
    let totalCost = 0;
    let itemCount = 0;

    for (const productId in selections) {
      const { totalBaseQty: pQty, totalCost: pCost } = calculateProductTotals(productId);
      if (pQty > 0) {
        totalBaseQty += pQty;
        totalCost += pCost;
        itemCount++;
      }
    }
    return { totalBaseQty, totalCost, itemCount };
  }, [selections, products]);

  const handleSuccess = useEffectEvent(() => {
    startTransition(() => {
      router.replace(returnHref);
      router.refresh();
    });
  });

  useEffect(() => {
    if (actionState.status === "success") handleSuccess();
  }, [actionState.status]);

  const toggleProduct = (productId: string) => {
    setSelections(prev => {
      const next = { ...prev };
      if (next[productId]) {
        delete next[productId];
      } else {
        next[productId] = {};
      }
      return next;
    });
  };

  const updateQty = (productId: string, unitId: string, value: string) => {
    setSelections(prev => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {}),
        [unitId]: value
      }
    }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-0 md:p-4 backdrop-blur-[2px] animate-in fade-in duration-300">
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden bg-[#F8FAFC] shadow-[0_40px_120px_rgba(0,0,0,0.3)] md:h-[min(900px,94dvh)] md:rounded-[2.8rem] border border-white/40">
        
        {/* Modern Glass Header */}
        <div className="shrink-0 bg-white/80 backdrop-blur-md px-6 py-6 border-b border-slate-200/60 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#003366] flex items-center justify-center text-white shadow-lg shadow-[#003366]/20">
                <CirclePlus className="h-7 w-7" strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-2xl font-black tracking-tight text-slate-950">รับสินค้าเข้า</h3>
                <p className="text-[11px] font-black text-[#003366]/40 uppercase tracking-[0.2em]">{currentStep === 'review' ? 'ยืนยันรายการ' : 'ขั้นตอนที่ ' + (['date', 'select', 'photo', 'review'].indexOf(currentStep) + 1)}</p>
              </div>
            </div>
            <button onClick={() => router.replace(returnHref)} className="h-11 w-11 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-all">
              <X className="h-6 w-6" strokeWidth={3} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-0 py-8 md:px-6">
          {/* Step 1: Date */}
          {currentStep === "date" && (
            <div className="max-w-xl mx-auto space-y-10 py-10 px-6 animate-in fade-in zoom-in-95 duration-400">
              <div className="text-center space-y-3">
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-[2rem] bg-white shadow-xl text-[#003366] mb-4">
                  <CalendarDays className="h-10 w-10" strokeWidth={2.5} />
                </div>
                <h4 className="text-3xl font-black text-slate-900 tracking-tight">เลือกวันที่รับของ</h4>
                <p className="text-lg font-bold text-slate-400">คุณได้รับสินค้าชุดนี้เข้าคลังเมื่อวันที่เท่าไหร่?</p>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                <ThaiDatePicker
                  id="receive-date"
                  name="receivedDate"
                  defaultValue={receivedDate}
                  onChange={setReceivedDate}
                  placeholder="แตะเลือกวันที่"
                />
              </div>
            </div>
          )}

          {/* Step 2: Select & Qty */}
          {currentStep === "select" && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-400">
              <div className="flex gap-4 sticky top-0 z-20 bg-[#F8FAFC]/90 backdrop-blur-sm pb-4 px-4 md:px-0">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหาสินค้าที่ต้องการรับเข้า..."
                    className="w-full h-14 rounded-2xl bg-white border-2 border-slate-100 pl-12 pr-4 text-lg font-bold text-slate-900 shadow-sm focus:border-[#003366]/30 outline-none transition-all"
                  />
                </div>
                {grandTotals.itemCount > 0 && (
                  <div className="hidden sm:flex h-14 items-center px-6 rounded-2xl bg-[#003366] text-white font-black shadow-lg">
                    เลือกแล้ว {grandTotals.itemCount} รายการ
                  </div>
                )}
              </div>

              <div className="grid gap-0.5 sm:gap-4">
                {filteredProducts.map((p) => {
                  const isSelected = !!selections[p.id];
                  return (
                    <div
                      key={p.id}
                      className={`group relative flex flex-col border-y transition-all duration-300 sm:rounded-[2rem] sm:border-2 ${
                        isSelected 
                          ? "border-[#003366]/50 bg-white shadow-lg z-10" 
                          : "border-slate-100 bg-white hover:bg-slate-50"
                      } -mx-0 sm:mx-0`}
                    >
                      <button
                        onClick={() => toggleProduct(p.id)}
                        className="flex items-center gap-4 p-5 text-left w-full sm:p-6"
                      >
                        <div className={`h-5 w-5 shrink-0 flex items-center justify-center rounded-md border-2 transition-all ${
                          isSelected ? "bg-[#003366] border-[#003366] text-white" : "border-slate-200 text-transparent"
                        }`}>
                          <Check className="h-3 w-3" strokeWidth={6} />
                        </div>
                        <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 overflow-hidden rounded-2xl">
                          {p.imageUrl ? (
                            <Image src={p.imageUrl} alt={p.name} fill className="object-contain" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-slate-50/50">
                              <Package2 className="h-8 w-8 text-slate-200" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black text-[#003366]/30 uppercase tracking-[0.2em] leading-none mb-1.5">{p.sku}</p>
                          <p className="text-lg font-black text-slate-950 leading-tight line-clamp-2">{p.name}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400">สต็อก: {p.onHandQuantity} {p.unit}</span>
                            {isSelected && (
                              <span className="h-1.5 w-1.5 rounded-full bg-[#003366] animate-pulse" />
                            )}
                          </div>
                        </div>
                      </button>

                      {isSelected && (
                        <div className="px-5 pb-8 pt-2 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300 sm:px-8">
                          <div className="h-px bg-slate-100" />
                          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                            {p.saleUnits.map(unit => (
                              <div key={unit.id} className="bg-slate-50/80 rounded-3xl p-5 border border-slate-100 transition-all hover:bg-slate-50">
                                <div className="flex justify-between items-center mb-3">
                                  <label className="text-[14px] font-black text-slate-600 uppercase tracking-wider">{unit.label}</label>
                                  <span className="text-[11px] font-black text-[#003366]/40 bg-white px-2 py-0.5 rounded-lg border border-slate-100">฿{unit.effectiveCostPrice}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <button 
                                    onClick={() => updateQty(p.id, unit.id, String(Math.max(0, Number(selections[p.id]?.[unit.id] ?? 0) - 1)))}
                                    className="h-12 w-12 shrink-0 flex items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm border border-slate-200 active:scale-90 transition-all"
                                  >
                                    <Minus className="h-6 w-6" strokeWidth={3} />
                                  </button>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    value={selections[p.id]?.[unit.id] ?? ""}
                                    onChange={(e) => updateQty(p.id, unit.id, e.target.value)}
                                    className="w-full h-12 bg-transparent text-center text-2xl font-black text-slate-950 outline-none"
                                    placeholder="0"
                                  />
                                  <button 
                                    onClick={() => updateQty(p.id, unit.id, String(Number(selections[p.id]?.[unit.id] ?? 0) + 1))}
                                    className="h-12 w-12 shrink-0 flex items-center justify-center rounded-2xl bg-[#003366] text-white shadow-lg shadow-[#003366]/10 active:scale-90 transition-all"
                                  >
                                    <Plus className="h-6 w-6" strokeWidth={3} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Photo */}
          {currentStep === "photo" && (
            <div className="max-w-xl mx-auto space-y-10 py-10 px-6 animate-in fade-in zoom-in-95 duration-400">
              <div className="text-center space-y-3">
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-[2rem] bg-white shadow-xl text-[#003366] mb-4">
                  <Camera className="h-10 w-10" strokeWidth={2.5} />
                </div>
                <h4 className="text-3xl font-black text-slate-900 tracking-tight">ถ่ายรูปบิลหรือใบรับของ</h4>
                <p className="text-lg font-bold text-slate-400">อัปโหลดภาพเพื่อใช้เป็นหลักฐานอ้างอิง</p>
              </div>

              <div className="relative">
                <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageChange} />
                {!imagePreview ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center gap-6 rounded-[3.5rem] border-4 border-dashed border-slate-200 bg-white py-24 text-slate-400 transition-all hover:border-[#003366]/20 hover:bg-white/50 group"
                  >
                    <div className="h-24 w-24 flex items-center justify-center rounded-full bg-slate-50 text-[#003366] shadow-inner transition-transform group-hover:scale-110">
                      <Camera className="h-12 w-12" strokeWidth={2} />
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-black text-slate-700">แตะเพื่อถ่ายรูปบิล</p>
                      <p className="text-base font-bold text-slate-400 mt-2">หรือเลือกรูปภาพจากเครื่อง</p>
                    </div>
                  </button>
                ) : (
                  <div className="relative aspect-[3/4] w-full max-w-sm mx-auto overflow-hidden rounded-[3rem] border-[12px] border-white shadow-[0_40px_80px_rgba(0,0,0,0.2)]">
                    <Image src={imagePreview} alt="Preview" fill className="object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <button
                      onClick={() => { setReceiptImage(null); setImagePreview(null); }}
                      className="absolute right-6 top-6 h-14 w-14 flex items-center justify-center rounded-full bg-rose-600 text-white shadow-2xl active:scale-90 transition-all"
                    >
                      <X className="h-8 w-8" strokeWidth={3} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Summary Review */}
          {currentStep === "review" && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
              {/* Official Summary Card */}
              <div className="bg-white rounded-[2rem] border-2 border-slate-200 p-6 sm:p-8 shadow-sm">
                <div className="flex items-center justify-between border-b-2 border-slate-100 pb-4 mb-6">
                  <div>
                    <h4 className="text-xl font-black text-slate-900">สรุปการรับเข้าสินค้า</h4>
                    <p className="text-sm font-bold text-slate-500">ตรวจสอบความถูกต้องก่อนบันทึก</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">วันที่รับของ</p>
                    <p className="text-lg font-black text-[#003366]">{receivedDate}</p>
                  </div>
                </div>

                {/* Primary Stats - Clear & Big */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-xs font-bold text-slate-500 mb-1">จำนวนรวมทั้งหมด</p>
                    <p className="text-2xl font-black text-slate-900 tabular-nums">
                      {grandTotals.totalBaseQty.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-[#003366]/5 p-4 rounded-2xl border border-[#003366]/10 text-center">
                    <p className="text-xs font-bold text-[#003366]/60 mb-1">มูลค่ารวม (บาท)</p>
                    <p className="text-2xl font-black text-[#003366] tabular-nums">
                      ฿{formatMoney(grandTotals.totalCost)}
                    </p>
                  </div>
                </div>

                {/* Item List Table Style */}
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2">รายการสินค้า ({grandTotals.itemCount})</p>
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {selectedProductList.map(p => {
                      const { totalBaseQty } = calculateProductTotals(p.id);
                      if (totalBaseQty <= 0) return null;
                      return (
                        <div key={p.id} className="py-3 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-black text-slate-950 truncate leading-tight">{p.name}</p>
                            <p className="text-xs font-bold text-slate-400">{p.sku}</p>
                          </div>
                          <p className="text-base font-black text-slate-900 tabular-nums shrink-0">
                            {formatQty(totalBaseQty, p.unit)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Receipt Image - Professional Placement */}
              {imagePreview && (
                <div className="bg-white rounded-[2rem] border-2 border-slate-200 p-4 shadow-sm flex items-center gap-4">
                  <div className="relative h-20 w-20 rounded-xl overflow-hidden border border-slate-100 shrink-0">
                    <Image src={imagePreview} alt="Receipt" fill className="object-cover" />
                  </div>
                  <div className="flex-1">
                    <h5 className="text-sm font-black text-slate-900">มีรูปถ่ายบิลแนบไว้</h5>
                    <p className="text-xs font-bold text-emerald-600">รูปภาพถูกบันทึกเป็นหลักฐานแล้ว</p>
                  </div>
                  <button 
                    onClick={() => setCurrentStep("photo")}
                    className="h-10 px-4 rounded-xl bg-slate-50 text-xs font-black text-slate-600 border border-slate-200 active:scale-95 transition-all"
                  >
                    ดู/แก้ไข
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Bar - Optimized for Mobile & Fit */}
        <div className="shrink-0 bg-white border-t border-slate-200/60 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-3">
            {currentStep !== "date" && (
              <button
                type="button"
                onClick={() => {
                  const steps: ReceiveStep[] = ["date", "select", "photo", "review"];
                  setCurrentStep(steps[steps.indexOf(currentStep) - 1]);
                }}
                className="h-12 w-16 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-all active:scale-95"
              >
                <ChevronLeft className="h-6 w-6" strokeWidth={3} />
              </button>
            )}
            
            {currentStep !== "review" ? (
              <button
                type="button"
                disabled={currentStep === 'select' && grandTotals.itemCount === 0}
                onClick={() => {
                  const steps: ReceiveStep[] = ["date", "select", "photo", "review"];
                  setCurrentStep(steps[steps.indexOf(currentStep) + 1]);
                }}
                className="flex-1 h-12 flex items-center justify-center gap-2 rounded-xl bg-[#003366] text-base font-black text-white shadow-lg shadow-[#003366]/20 transition-all active:scale-[0.98] disabled:opacity-40"
              >
                ถัดไป
                <ChevronRight className="h-5 w-5" strokeWidth={3} />
              </button>
            ) : (
              <form action={formAction} className="flex-1 flex">
                {/* Bundle all items into a single JSON string for the action */}
                <input 
                  type="hidden" 
                  name="itemsJson" 
                  value={JSON.stringify(selectedProductList.map(p => {
                    const { totalBaseQty, totalCost } = calculateProductTotals(p.id);
                    return {
                      productId: p.id,
                      quantityReceived: totalBaseQty,
                      unit: p.unit,
                      unitCost: totalBaseQty > 0 ? totalCost / totalBaseQty : 0
                    };
                  }).filter(item => item.quantityReceived > 0))} 
                />
                
                <input type="hidden" name="receivedAt" value={receivedDate} />
                <input type="hidden" name="notes" value="" />
                {receiptImage && <input type="file" name="receiptImage" className="hidden" ref={(el) => { if (el) { const data = new DataTransfer(); data.items.add(receiptImage); el.files = data.files; } }} />}
                
                <button
                  type="submit"
                  disabled={isPending || grandTotals.itemCount === 0}
                  className="flex-1 h-12 flex items-center justify-center gap-2 rounded-xl bg-[#003366] text-base font-black text-white shadow-xl shadow-[#003366]/20 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Save className="h-5 w-5" strokeWidth={2.5} />
                  )}
                  {isPending ? "กำลังบันทึก..." : "ยืนยันและบันทึกข้อมูล"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

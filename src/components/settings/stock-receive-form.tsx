"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  Loader2,
  Package2,
  Plus,
  Minus,
  Save,
  Search,
  X,
  Factory,
  Calendar,
  ChevronRight,
  Camera,
  ImagePlus,
  Trash2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import {
  useActionState,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  startTransition,
  useRef,
} from "react";
import { receiveStockAction } from "@/app/settings/stock/actions";
import type { ReceiveStockActionState } from "@/app/settings/stock/actions";
import type { StockProductOption, StockSupplierOption } from "@/lib/stock/admin";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";

type StockReceiveFormProps = {
  products: StockProductOption[];
  suppliers: StockSupplierOption[];
  warehouses: StockWarehouseOption[];
  returnHref: string;
  defaultWarehouseId?: string;
  onClose?: () => void;
};

type StockWarehouseOption = {
  id: string;
  name: string;
  slug: string;
};

const initialReceiveStockState: ReceiveStockActionState = {
  fieldErrors: {},
  message: "",
  status: "idle",
};

export function StockReceiveForm({
  products,
  suppliers,
  warehouses,
  returnHref,
  defaultWarehouseId = "",
  onClose,
}: StockReceiveFormProps) {
  const router = useRouter();
  const [actionState, formAction, isPending] = useActionState(
    receiveStockAction,
    initialReceiveStockState,
  );

  // Flow: 1: Info (Supplier/Date/Warehouse), 2: Products (Search/Select), 3: Photo & Submit
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selections, setSelections] = useState<Record<string, Record<string, string>>>({});
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split("T")[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [receiptImage, setReceiptImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSupplierDrawerOpen, setIsSupplierDrawerOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(searchQuery);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => {
      if (p.categoryName) cats.add(p.categoryName);
    });
    return Array.from(cats).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products;

    // Category Filter
    if (selectedCategory !== "all") {
      result = result.filter(p => p.categoryName === selectedCategory);
    }

    // Search Query
    const q = deferredQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
      );
    }

    return result;
  }, [deferredQuery, products, selectedCategory]);

  const toggleProduct = (productId: string) => {
    setSelections(prev => {
      if (prev[productId]) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      const p = products.find(prod => prod.id === productId);
      const defaultUnitId = p?.saleUnits.find(u => u.isDefault)?.id || p?.saleUnits[0]?.id;
      return {
        ...prev,
        [productId]: defaultUnitId ? { [defaultUnitId]: "" } : {}
      };
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

  const selectedCount = Object.keys(selections).length;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const [isClosing, setIsClosing] = useState(false);

  const showAlert = (message: string) => {
    setValidationError(message);
    setTimeout(() => setValidationError(null), 3000);
  };
  const displayErrorMessage =
    validationError ?? (actionState.status === "error" ? actionState.message : null);

  const handleSuccess = useEffectEvent((message: string) => {
    setValidationError(null);
    setSuccessMessage(message);
    setIsClosing(true);

    setTimeout(() => {
      startTransition(() => {
        if (onClose) {
          onClose();
        } else {
          router.replace(returnHref);
        }
        router.refresh();
      });
    }, 700);
  });

  useEffect(() => {
    if (actionState.status === "success") {
      handleSuccess(actionState.message || "บันทึกรับสินค้าเรียบร้อยแล้ว");
    }
  }, [actionState.message, actionState.status]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      if (onClose) onClose();
      else router.replace(returnHref);
    }, 400);
  };

  const onSubmit = () => {
    setValidationError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append("supplierId", supplierId);
    formData.append("supplierName", supplierName);
    formData.append("warehouseId", warehouseId);
    formData.append("receivedAt", receiveDate);
    formData.append("notes", "");

    if (receiptImage) {
      formData.append("receiptImage", receiptImage);
    }

    const items = Object.entries(selections).flatMap(([pid, units]) => {
      const p = products.find(prod => prod.id === pid);
      return Object.entries(units).map(([uid, qty]) => {
        const unit = p?.saleUnits.find(u => u.id === uid);
        return {
          productId: pid,
          quantityReceived: Number(qty) || 0,
          unit: unit?.label || p?.unit || "หน่วย",
          unitCost: unit?.effectiveCostPrice || 0,
        };
      });
    }).filter(item => item.quantityReceived > 0);

    formData.append("itemsJson", JSON.stringify(items));

    startTransition(() => {
      formAction(formData);
    });
  };

  const nextStep = () => {
    if (step === 1) {
      if (!warehouseId) {
        showAlert("กรุณาเลือกคลังก่อนรับสินค้าเข้า");
        return;
      }

      if (!supplierId) {
        setIsSupplierDrawerOpen(true);
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (selectedCount === 0) {
        showAlert("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
        return;
      }

      const missingQty = Object.entries(selections).some(([, units]) => {
        return !Object.values(units).some(qty => Number(qty) > 0);
      });

      if (missingQty) {
        showAlert("กรุณาระบุจำนวนสินค้าให้ครบถ้วน");
        return;
      }

      setStep(3);
    }
  };

  const prevStep = () => {
    setStep((prev) => (prev - 1) as 1 | 2);
  };

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-3 sm:p-4 transition-all duration-300 ${
      isClosing ? "opacity-0" : "opacity-100"
    }`}>
      <div
        onClick={handleClose}
        className="absolute inset-0"
      />
      <div className={`relative flex h-full w-full max-w-[1180px] flex-col overflow-hidden bg-[#f6f8fb] shadow-[0_18px_44px_rgba(15,23,42,0.08)] rounded-[28px] border border-[#dbe4f0] transition-all duration-500 ${
        isClosing ? "scale-95 translate-y-4" : "scale-100 translate-y-0"
      } h-[92dvh] sm:h-[88dvh]`}>

        {/* Validation Alert Popup */}
        {displayErrorMessage && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[110] w-[calc(100%-2rem)] max-w-md animate-in slide-in-from-top-4 duration-300">
            <div className="bg-rose-600 text-white p-4 rounded-[20px] shadow-lg flex items-center gap-3 border border-white/10">
              <AlertCircle className="h-5 w-5 shrink-0" strokeWidth={2.5} />
              <p className="font-bold text-sm">{displayErrorMessage}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[110] w-[calc(100%-2rem)] max-w-md animate-in slide-in-from-top-4 duration-300">
            <div className="bg-[#16a34a] text-white p-4 rounded-[20px] shadow-lg flex items-center gap-3 border border-white/10">
              <Check className="h-5 w-5 shrink-0" strokeWidth={2.5} />
              <p className="font-bold text-sm">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Header - Technical Clean Style */}
        <div className="shrink-0 bg-white px-6 py-5 border-b border-[#dbe4f0] flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-[#4A148C] tracking-tight">
                รับสินค้าเข้าคลัง (Receive Inventory)
              </h2>
              <p className="text-[12px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">
                Field Operations Guide
              </p>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="h-10 w-10 flex items-center justify-center rounded-full border border-[#dbe4f0] bg-white text-slate-700 transition hover:bg-slate-50 active:scale-90"
            >
              <X className="h-5 w-5" strokeWidth={2.2} />
            </button>
          </div>

          {/* Sequential Process Map - Steps timeline */}
          <div className="flex items-center gap-3 overflow-x-auto py-1 no-scrollbar">
            {[
              { num: "01", label: "ข้อมูลพื้นฐาน" },
              { num: "02", label: "เลือกสินค้า" },
              { num: "03", label: "ยืนยันการรับเข้า" },
            ].map((s, idx) => {
              const currentNum = idx + 1;
              const isActive = step === currentNum;
              const isCompleted = step > currentNum;

              return (
                <div key={s.num} className="flex items-center gap-2 shrink-0">
                  <div className={`h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-black transition-all ${
                    isActive
                      ? "bg-[#4A148C] text-white"
                      : isCompleted
                      ? "bg-[#e9f8ef] text-[#16a34a] border border-[#16a34a]/10"
                      : "bg-slate-100 text-slate-400"
                  }`}>
                    {isCompleted ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span>{s.num}</span>}
                    <span>{s.label}</span>
                  </div>
                  {idx < 2 && (
                    <div className="h-0.5 w-6 bg-[#dbe4f0]" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content Container */}
        <div className="relative flex flex-1 flex-col overflow-y-auto p-5 sm:p-6">
          
          {/* Step 1: Info */}
          {step === 1 && (
            <div className="max-w-[720px] mx-auto w-full space-y-6 sm:py-4">
              <div className="bg-white border border-[#dbe4f0] rounded-[24px] p-6 sm:p-8 space-y-6 shadow-[0_18px_44px_rgba(15,23,42,0.04)]">
                
                {/* Date Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-[#4A148C]" /> วันที่รับสินค้า
                  </label>
                  <ThaiDatePicker
                    id="receive-date"
                    name="receivedAt"
                    value={receiveDate}
                    onChange={setReceiveDate}
                  />
                </div>

                {/* Warehouse Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Package2 className="h-4 w-4 text-[#4A148C]" /> คลังสินค้าปลายทาง
                  </label>
                  <select
                    value={warehouseId}
                    onChange={(event) => setWarehouseId(event.target.value)}
                    className="h-12 w-full rounded-full border border-[#dbe4f0] bg-white px-5 text-sm font-bold text-[#4A148C] outline-none transition focus:border-[#4A148C] focus:ring-1 focus:ring-[#4A148C]/20"
                  >
                    <option value="">เลือกคลังปลายทาง...</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Supplier Selection Button */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Factory className="h-4 w-4 text-[#4A148C]" /> ผู้จัดจำหน่าย
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsSupplierDrawerOpen(true)}
                    className={`w-full h-14 px-5 flex items-center justify-between bg-white border border-[#dbe4f0] transition-all rounded-full hover:bg-slate-50 ${
                      supplierId ? "border-[#4A148C]/30" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Factory className={`h-5 w-5 ${supplierId ? "text-[#4A148C]" : "text-slate-400"}`} />
                      <span className={`text-sm font-bold ${supplierId ? "text-[#4A148C]" : "text-slate-400"}`}>
                        {supplierName || "เลือกผู้จัดจำหน่าย..."}
                      </span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-400" strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              {/* Informative field manual banner */}
              <div className="bg-[#F3E5F5] border border-[#4A148C]/10 rounded-[20px] p-5 flex gap-4">
                <div className="h-10 w-10 shrink-0 rounded-full bg-white flex items-center justify-center text-[#4A148C] shadow-sm">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-[#4A148C]">กรอกข้อมูลให้ครบถ้วน</h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    ระบบจะบันทึกรายการรับเข้าสินค้าเข้าคลังที่ระบุ และคำนวณราคาทุนเฉลี่ยของสินค้าแต่ละหน่วยตามจริงโดยอ้างอิงจากข้อมูลผู้จัดจำหน่าย
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Product Search & Qty */}
          {step === 2 && (
            <div className="flex flex-col flex-1 gap-6 max-w-[840px] mx-auto w-full">
              
              {/* Filter Area */}
              <div className="bg-white border border-[#dbe4f0] rounded-[24px] p-5 shadow-sm space-y-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="พิมพ์ค้นหาสินค้าเพื่อรับเข้า..."
                    className="w-full h-11 pl-11 pr-4 bg-slate-50 border border-[#dbe4f0] rounded-full outline-none focus:border-[#4A148C] transition-all text-sm font-bold placeholder:text-slate-400"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Category tags */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => setSelectedCategory("all")}
                    className={`px-4 py-1.5 rounded-full text-xs font-black transition ${
                      selectedCategory === "all"
                        ? "bg-[#4A148C] text-white"
                        : "bg-slate-50 text-slate-500 border border-[#dbe4f0]/50 hover:bg-slate-100"
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-1.5 rounded-full text-xs font-black transition ${
                        selectedCategory === cat
                          ? "bg-[#4A148C] text-white"
                          : "bg-slate-50 text-slate-500 border border-[#dbe4f0]/50 hover:bg-slate-100"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product selection cards grid */}
              <div className="space-y-3">
                {filteredProducts.map((p) => {
                  const isSelected = !!selections[p.id];
                  return (
                    <div
                      key={p.id}
                      className={`bg-white border transition-all rounded-[20px] overflow-hidden ${
                        isSelected
                          ? "border-[#4A148C]/30 shadow-md shadow-[#4A148C]/20"
                          : "border-[#dbe4f0] hover:border-slate-300 shadow-sm"
                      }`}
                    >
                      <button
                        onClick={() => toggleProduct(p.id)}
                        className="flex w-full items-center gap-4 px-5 py-4 text-left"
                      >
                        <div className={`h-6 w-6 shrink-0 flex items-center justify-center rounded-md border transition-all ${
                          isSelected ? "bg-[#4A148C] border-[#4A148C] text-white" : "border-slate-300 text-transparent"
                        }`}>
                          <Check className="h-4 w-4" strokeWidth={3} />
                        </div>
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-white">
                          {p.imageUrl ? (
                            <Image src={p.imageUrl} alt={p.name} fill className="object-contain p-1" />
                          ) : (
                            <Package2 className="m-auto h-7 w-7 text-slate-200" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.sku}</p>
                          <h4 className="text-base font-black text-slate-900 leading-snug line-clamp-1">{p.name}</h4>
                          <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 font-bold">
                            <span>คงเหลือ: <strong className="text-slate-800">{p.onHandQuantity} {p.unit}</strong></span>
                            <span className="h-1 w-1 bg-slate-300 rounded-full" />
                            <span>ทุนเริ่มต้น: <strong className="text-slate-800">฿{p.costPrice.toLocaleString()}</strong></span>
                          </div>
                        </div>
                      </button>

                      {/* Selected units inputs */}
                      {isSelected && (
                        <div className="px-5 pb-5 pt-1 border-t border-dashed border-[#dbe4f0] bg-slate-50/50 grid gap-3 grid-cols-1 sm:grid-cols-2">
                          {p.saleUnits.map(unit => (
                            <div key={unit.id} className="bg-white rounded-2xl p-4 border border-[#dbe4f0] shadow-sm">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-black text-slate-500">{unit.label}</span>
                                <span className="text-[11px] font-bold text-[#4A148C] bg-[#F3E5F5] px-2 py-0.5 rounded-full">฿{unit.effectiveCostPrice}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => updateQty(p.id, unit.id, String(Math.max(0, Number(selections[p.id]?.[unit.id] ?? 0) - 1)))}
                                  className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
                                >
                                  <Minus className="h-5 w-5" strokeWidth={2.5} />
                                </button>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  value={selections[p.id]?.[unit.id] ?? ""}
                                  onChange={(e) => updateQty(p.id, unit.id, e.target.value)}
                                  className="w-full h-10 bg-transparent text-center text-lg font-bold text-slate-900 outline-none"
                                  placeholder="0"
                                />
                                <button
                                  onClick={() => updateQty(p.id, unit.id, String(Number(selections[p.id]?.[unit.id] ?? 0) + 1))}
                                  className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl bg-[#4A148C] text-white hover:bg-[#4A148C] transition"
                                >
                                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Photo & Confirmation */}
          {step === 3 && (
            <div className="max-w-[720px] mx-auto w-full space-y-6">
              
              {/* Photo Input Area */}
              <div className="bg-white border border-[#dbe4f0] rounded-[24px] p-6 shadow-sm space-y-4">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest block">อัปโหลดภาพถ่ายเอกสารบิลสินค้า</span>
                
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  ref={cameraInputRef}
                  onChange={handleImageChange}
                />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={galleryInputRef}
                  onChange={handleImageChange}
                />

                {imagePreview ? (
                  <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-slate-50 border border-[#dbe4f0] group">
                    <Image src={imagePreview} alt="Preview" fill className="object-contain" />
                    <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-4">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="h-12 w-12 rounded-full bg-white text-[#4A148C] flex items-center justify-center active:scale-90 transition hover:scale-105"
                      >
                        <Camera className="h-5 w-5" strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="h-12 w-12 rounded-full bg-white text-[#4A148C] flex items-center justify-center active:scale-90 transition hover:scale-105"
                      >
                        <ImagePlus className="h-5 w-5" strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReceiptImage(null);
                          setImagePreview(null);
                        }}
                        className="h-12 w-12 rounded-full bg-rose-600 text-white flex items-center justify-center active:scale-90 transition hover:scale-105"
                      >
                        <Trash2 className="h-5 w-5" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="w-full h-32 rounded-2xl border border-dashed border-[#dbe4f0] bg-slate-50 hover:bg-slate-100/50 transition flex flex-col items-center justify-center gap-2 group"
                    >
                      <Camera className="h-6 w-6 text-slate-400 group-hover:text-[#4A148C]" strokeWidth={2} />
                      <div className="text-center">
                        <p className="text-sm font-bold text-slate-800">ถ่ายภาพบิล</p>
                        <p className="text-[10px] text-slate-400">Open Camera</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="w-full h-32 rounded-2xl border border-dashed border-[#dbe4f0] bg-slate-50 hover:bg-slate-100/50 transition flex flex-col items-center justify-center gap-2 group"
                    >
                      <ImagePlus className="h-6 w-6 text-slate-400 group-hover:text-[#4A148C]" strokeWidth={2} />
                      <div className="text-center">
                        <p className="text-sm font-bold text-slate-800">เลือกรูปจากคลังภาพ</p>
                        <p className="text-[10px] text-slate-400">Browse Gallery</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              {/* Confirmation details list */}
              <div className="bg-white border border-[#dbe4f0] rounded-[24px] p-6 shadow-sm space-y-4">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest block">สรุปการตรวจสอบ (Audit Summary)</span>
                
                <div className="divide-y divide-[#dbe4f0]">
                  <div className="flex justify-between py-3">
                    <span className="text-sm text-slate-500 font-bold">วันที่รับเข้า</span>
                    <span className="text-sm font-bold text-[#4A148C]">
                      {receiveDate ? (
                        new Date(receiveDate).toLocaleDateString("th-TH", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })
                      ) : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between py-3">
                    <span className="text-sm text-slate-500 font-bold">ผู้จัดจำหน่าย</span>
                    <span className="text-sm font-bold text-[#4A148C]">{supplierName}</span>
                  </div>
                  <div className="flex justify-between py-3">
                    <span className="text-sm text-slate-500 font-bold">คลังปลายทาง</span>
                    <span className="text-sm font-bold text-[#4A148C]">
                      {warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? "-"}
                    </span>
                  </div>
                  <div className="flex justify-between py-3">
                    <span className="text-sm text-slate-500 font-bold">จำนวนสินค้าทั้งหมด</span>
                    <span className="text-sm font-black text-[#4A148C]">{selectedCount} รายการ</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Area */}
        <div className="shrink-0 bg-white border-t border-[#dbe4f0] p-4 flex items-center gap-3">
          {step > 1 && (
            <button
              onClick={prevStep}
              className="h-12 px-6 bg-transparent hover:bg-slate-50 text-[#4A148C] border border-[#dbe4f0] rounded-full font-bold text-sm flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
              <span>ย้อนกลับ</span>
            </button>
          )}

          {step < 3 ? (
            <button
              onClick={nextStep}
              className="flex-1 h-12 bg-[#4A148C] hover:bg-[#4A148C] text-white rounded-full font-bold text-sm flex items-center justify-center gap-1.5 shadow-md shadow-[#4A148C]/10 transition active:scale-95 ml-auto"
            >
              <span>ต่อไป</span>
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
          ) : (
            <button
              onClick={onSubmit}
              disabled={isPending}
              className="flex-1 h-12 bg-[#4A148C] hover:bg-[#4A148C] text-white rounded-full font-bold text-sm flex items-center justify-center gap-1.5 shadow-md shadow-[#4A148C]/10 disabled:opacity-50 transition active:scale-95 ml-auto"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4" strokeWidth={2.5} />
                  <span>บันทึกรับสินค้า</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Supplier Drawer (Bottom Sheet) */}
        {isSupplierDrawerOpen && (
          <div className="absolute inset-0 z-50 flex flex-col justify-end bg-slate-950/40 backdrop-blur-[4px] animate-in fade-in duration-300">
            <div
              onClick={() => setIsSupplierDrawerOpen(false)}
              className="absolute inset-0"
            />
            <div className="relative w-full max-h-[80%] bg-[#f6f8fb] rounded-t-[28px] shadow-lg flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-500">
              
              <div className="shrink-0 p-5 bg-white border-b border-[#dbe4f0] flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-[#4A148C]">เลือกผู้จัดจำหน่าย</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Supplier Directory</p>
                </div>
                <button
                  onClick={() => setIsSupplierDrawerOpen(false)}
                  className="h-8 w-8 rounded-full border border-[#dbe4f0] flex items-center justify-center text-slate-500 hover:bg-slate-50"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3 no-scrollbar">
                {suppliers.map(s => {
                  const isSelected = supplierId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSupplierId(s.id);
                        setSupplierName(s.name);
                        setIsSupplierDrawerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-5 rounded-[20px] border transition-all text-left bg-white ${
                        isSelected
                          ? "border-[#4A148C] shadow-sm shadow-[#4A148C]/5"
                          : "border-[#dbe4f0] hover:border-slate-300 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-11 w-11 rounded-xl flex items-center justify-center transition-colors ${
                          isSelected ? "bg-[#F3E5F5] text-[#4A148C]" : "bg-slate-50 text-slate-400"
                        }`}>
                          <Factory size={20} />
                        </div>
                        <div>
                          <p className="font-black text-base text-slate-900">{s.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Code: {s.code}</p>
                        </div>
                      </div>
                      <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected ? "bg-[#4A148C] border-[#4A148C]" : "border-slate-200"
                      }`}>
                        {isSelected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={4} />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="shrink-0 p-5 bg-white border-t border-[#dbe4f0]">
                <button
                  onClick={() => setIsSupplierDrawerOpen(false)}
                  className="w-full h-12 border border-[#dbe4f0] hover:bg-slate-50 text-slate-600 rounded-full font-bold text-sm transition"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

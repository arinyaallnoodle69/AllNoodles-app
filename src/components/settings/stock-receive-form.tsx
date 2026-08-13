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
  Calendar,
  ChevronRight,
  Camera,
  ImagePlus,
  Trash2,
  AlertCircle,
  ListFilter,
} from "lucide-react";
import {
  useActionState,
  useCallback,
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
import type { StockProductOption } from "@/lib/stock/admin";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { useClientRole } from "@/lib/auth/client-role";

type StockReceiveFormProps = {
  products: StockProductOption[];
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

function getWarehouseOnHandQuantity(product: StockProductOption, warehouseId: string) {
  return product.warehouseStocks.find((stock) => stock.warehouseId === warehouseId)?.onHandQuantity ?? 0;
}

export function StockReceiveForm({
  products,
  warehouses,
  returnHref,
  defaultWarehouseId = "",
  onClose,
}: StockReceiveFormProps) {
  const router = useRouter();
  const role = useClientRole();
  const [actionState, formAction, isPending] = useActionState(
    receiveStockAction,
    initialReceiveStockState,
  );

  // Flow: 1: Info (Date/Warehouse), 2: Products (Search/Select), 3: Photo & Submit
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selections, setSelections] = useState<Record<string, Record<string, string>>>({});
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split("T")[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFactory, setSelectedFactory] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [receiptImage, setReceiptImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(searchQuery);
  const selectedWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.id === warehouseId) ?? null,
    [warehouseId, warehouses],
  );
  const stockProducts = useMemo(
    () =>
      warehouseId
        ? products.filter(
            (product) =>
              (product.warehouseModes.find((mode) => mode.warehouseId === warehouseId)?.mode ?? "stock") === "stock",
          )
        : products,
    [products, warehouseId],
  );

  useEffect(() => {
    setWarehouseId(defaultWarehouseId);
  }, [defaultWarehouseId]);

  const getProductFactoryFilterName = useCallback((product: StockProductOption) => {
    return (
      product.warehouseModes.find((mode) => mode.warehouseId === warehouseId)?.supplierName?.trim() ||
      "ไม่ระบุโรงงาน"
    );
  }, [warehouseId]);

  const factories = useMemo(() => {
    const items = new Set<string>();
    stockProducts.forEach(p => {
      const factoryName = getProductFactoryFilterName(p).trim();
      if (factoryName) items.add(factoryName);
    });
    return Array.from(items).sort((a, b) => a.localeCompare(b, "th"));
  }, [getProductFactoryFilterName, stockProducts]);

  const brands = useMemo(() => {
    const filteredByFactory =
      selectedFactory === "all"
        ? stockProducts
        : stockProducts.filter((product) => getProductFactoryFilterName(product) === selectedFactory);
    const items = new Set<string>();
    filteredByFactory.forEach((product) => {
      const brandName = product.brandName?.trim();
      if (brandName) items.add(brandName);
    });
    return Array.from(items).sort((a, b) => a.localeCompare(b, "th"));
  }, [getProductFactoryFilterName, stockProducts, selectedFactory]);

  useEffect(() => {
    if (selectedBrand !== "all" && !brands.includes(selectedBrand)) {
      setSelectedBrand("all");
    }
  }, [brands, selectedBrand]);

  useEffect(() => {
    if (selectedFactory !== "all" && !factories.includes(selectedFactory)) {
      setSelectedFactory("all");
      setSelectedBrand("all");
    }
  }, [factories, selectedFactory]);

  const filteredProducts = useMemo(() => {
    let result = stockProducts;

    if (selectedFactory !== "all") {
      result = result.filter(p => getProductFactoryFilterName(p) === selectedFactory);
    }

    if (selectedBrand !== "all") {
      result = result.filter(p => p.brandName === selectedBrand);
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
  }, [deferredQuery, getProductFactoryFilterName, selectedBrand, selectedFactory, stockProducts]);

  const getProductFactoryName = (product: StockProductOption) => {
    return (
      product.warehouseModes.find((mode) => mode.warehouseId === warehouseId)?.supplierName?.trim() ||
      "ไม่ระบุโรงงาน"
    );
  };

  const toggleProduct = (productId: string) => {
    setSelections(prev => {
      if (prev[productId]) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      const p = stockProducts.find(prod => prod.id === productId);
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
    formData.append("supplierId", "");
    formData.append("supplierName", "ตามการตั้งค่าโรงงานของคลัง");
    formData.append("warehouseId", warehouseId);
    formData.append("receivedAt", receiveDate);
    formData.append("notes", "");

    if (receiptImage) {
      formData.append("receiptImage", receiptImage);
    }

    const items = Object.entries(selections).flatMap(([pid, units]) => {
      const p = stockProducts.find(prod => prod.id === pid);
      if (!p) return [];
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
    <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-0 sm:p-4 transition-all duration-300 ${
      isClosing ? "opacity-0" : "opacity-100"
    }`}>
      <div
        onClick={handleClose}
        className="absolute inset-0"
      />
      <div className={`relative flex h-full w-full max-w-[1180px] flex-col overflow-hidden bg-[#f6f8fb] shadow-[0_18px_44px_rgba(15,23,42,0.08)] rounded-none border border-[#dbe4f0] transition-all duration-500 dashboard-modal-content stock-receive-modal-content sm:rounded-[28px] ${
        isClosing ? "scale-95 translate-y-4" : "scale-100 translate-y-0"
      } h-[100dvh] sm:h-[88dvh]`}>

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

        {/* Header */}
        <div className="shrink-0 border-b border-[#dbe4f0] bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-black tracking-tight text-[#4A148C] sm:text-2xl">
                รับสินค้าเข้าคลัง
              </h2>
              <p className="mt-0.5 truncate text-sm font-black text-slate-600">
                {selectedWarehouse?.name ?? "ยังไม่ได้เลือกคลัง"}
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
        </div>

        {/* Content Container */}
        <div className="relative flex flex-1 flex-col overflow-y-auto p-3 sm:p-6">
          
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
                  <div className="flex min-h-12 w-full items-center justify-between gap-3 rounded-full border border-[#dbe4f0] bg-slate-50 px-5">
                    <span className="min-w-0 truncate text-sm font-black text-[#4A148C]">
                      {selectedWarehouse?.name ?? "ยังไม่ได้เลือกคลัง"}
                    </span>
                    <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                      {selectedWarehouse?.slug ?? "warehouse"}
                    </span>
                  </div>
                  <p className="px-1 text-xs font-bold text-slate-500">
                    รับเข้าคลังตามหน้าสต็อกที่กำลังเปิดอยู่ หากต้องการเปลี่ยนคลังให้กลับไปเลือกคลังด้านนอกก่อน
                  </p>
                </div>

                <div className="rounded-2xl border border-[#4A148C]/10 bg-[#F3E5F5] px-4 py-3">
                  <h4 className="text-sm font-black text-[#4A148C]">โรงงานใช้ตามที่ตั้งค่าไว้ในคลัง</h4>
                  <p className="mt-1 text-xs font-bold leading-relaxed text-slate-500">
                    หน้านี้แสดงเฉพาะสินค้าใช้สต็อกของคลังนี้ จึงไม่ต้องเลือกโรงงานซ้ำตอนรับเข้า
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Product Search & Qty */}
          {step === 2 && (
            <div className="flex flex-1 flex-col gap-3 w-full sm:mx-auto sm:max-w-[840px] sm:gap-6">
              
              {/* Filter Area */}
              <div className="space-y-3 border-b border-[#eadcf3] bg-white px-0 pb-3 sm:rounded-[24px] sm:border sm:border-[#dbe4f0] sm:p-5 sm:shadow-sm">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 sm:left-4" />
                  <input
                    type="text"
                    placeholder="พิมพ์ค้นหาสินค้าเพื่อรับเข้า..."
                    className="h-10 w-full rounded-xl border border-[#dbe4f0] bg-slate-50 pl-10 pr-3 text-sm font-bold outline-none transition-all placeholder:text-slate-400 focus:border-[#4A148C] sm:h-11 sm:rounded-full sm:pl-11 sm:pr-4"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="เปิดรายการโรงงานทั้งหมด"
                      className="flex h-10 shrink-0 items-center gap-1.5 text-sm font-black text-[#4A148C] sm:h-12"
                    >
                      โรงงาน
                      <ListFilter className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                    <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-5 overflow-x-auto">
                      <button
                        type="button"
                        onClick={() => setSelectedFactory("all")}
                        className={`relative h-10 shrink-0 px-0 text-sm font-black transition sm:h-12 ${
                          selectedFactory === "all"
                            ? "text-[#4A148C]"
                            : "text-slate-500 hover:text-slate-950"
                        }`}
                      >
                        ทุกโรงงาน
                        {selectedFactory === "all" && (
                          <span className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-[#4A148C]" />
                        )}
                      </button>
                      {factories.map(factory => (
                        <button
                          type="button"
                          key={factory}
                          onClick={() => setSelectedFactory(factory)}
                          className={`relative h-10 shrink-0 px-0 text-sm font-black transition sm:h-12 ${
                            selectedFactory === factory
                              ? "text-[#4A148C]"
                              : "text-slate-500 hover:text-slate-950"
                          }`}
                        >
                          {factory}
                          {selectedFactory === factory && (
                            <span className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-[#4A148C]" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="เปิดรายการแบรนด์ทั้งหมด"
                      className="flex h-10 shrink-0 items-center gap-1.5 text-sm font-black text-[#4A148C] sm:h-12"
                    >
                      แบรนด์
                      <ListFilter className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                    <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-5 overflow-x-auto">
                      <button
                        type="button"
                        onClick={() => setSelectedBrand("all")}
                        className={`relative h-10 shrink-0 px-0 text-sm font-black transition sm:h-12 ${
                          selectedBrand === "all"
                            ? "text-[#4A148C]"
                            : "text-slate-500 hover:text-slate-950"
                        }`}
                      >
                        ทั้งหมด
                        {selectedBrand === "all" && (
                          <span className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-[#4A148C]" />
                        )}
                      </button>
                      {brands.map(brand => (
                        <button
                          type="button"
                          key={brand}
                          onClick={() => setSelectedBrand(brand)}
                          className={`relative h-10 shrink-0 px-0 text-sm font-black transition sm:h-12 ${
                            selectedBrand === brand
                              ? "text-[#4A148C]"
                              : "text-slate-500 hover:text-slate-950"
                          }`}
                        >
                          {brand}
                          {selectedBrand === brand && (
                            <span className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-[#4A148C]" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

              </div>

              {/* Product selection cards grid */}
              <div className="space-y-2 sm:space-y-3">
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
                        className="flex w-full items-center gap-3 px-3 py-3 text-left sm:gap-4 sm:px-5 sm:py-4"
                      >
                        <div className={`h-6 w-6 shrink-0 flex items-center justify-center rounded-md border transition-all ${
                          isSelected ? "bg-[#4A148C] border-[#4A148C] text-white" : "border-slate-300 text-transparent"
                        }`}>
                          <Check className="h-4 w-4" strokeWidth={3} />
                        </div>
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-white sm:h-14 sm:w-14">
                          {p.imageUrl ? (
                            <Image src={p.imageUrl} alt={p.name} fill className="object-contain p-1" />
                          ) : (
                            <Package2 className="m-auto h-7 w-7 text-slate-200" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.sku}</p>
                          <h4 className="max-h-[2.9em] overflow-hidden text-sm font-black leading-snug text-slate-900 sm:text-base">{p.name}</h4>
                          <p className="mt-0.5 max-w-full overflow-x-auto whitespace-nowrap py-0.5 text-[11px] font-black leading-[1.45] text-[#4A148C] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            โรงงาน: {getProductFactoryName(p)}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-bold text-slate-500">
                            <span>คงเหลือ: <strong className="text-slate-800">{getWarehouseOnHandQuantity(p, warehouseId)} {p.unit}</strong></span>
                            {role !== "member" && (
                              <span className="hidden items-center gap-3 sm:flex">
                                <span className="h-1 w-1 bg-slate-300 rounded-full" />
                                <span>ทุนเริ่มต้น: <strong className="text-slate-800">฿{p.costPrice.toLocaleString()}</strong></span>
                              </span>
                            )}
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
                                {role !== "member" && (
                                  <span className="text-[11px] font-bold text-[#4A148C] bg-[#F3E5F5] px-2 py-0.5 rounded-full">฿{unit.effectiveCostPrice}</span>
                                )}
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
                  <div className="flex justify-between gap-4 py-3">
                    <span className="text-sm text-slate-500 font-bold">โรงงาน</span>
                    <span className="text-right text-sm font-bold text-[#4A148C]">ตามการตั้งค่าโรงงานของคลัง</span>
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

      </div>
    </div>
  );
}

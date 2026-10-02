import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const failures = [];

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function check(condition, message) {
  try {
    assert.ok(condition, message);
  } catch (error) {
    failures.push(error.message);
  }
}

const vercelPath = resolve(root, "vercel.json");
check(existsSync(vercelPath), "vercel.json must configure the function region");
if (existsSync(vercelPath)) {
  const vercel = JSON.parse(readFileSync(vercelPath, "utf8"));
  check(
    Array.isArray(vercel.regions) && vercel.regions.length === 1 && vercel.regions[0] === "sin1",
    "Vercel Functions must run in sin1",
  );
}

const proxy = read("src/proxy.ts");
check(proxy.includes("export const config ="), "proxy must export Next.js config");
check(!proxy.includes("proxyConfig"), "proxyConfig is not a recognized Next.js export");

const manifest = read("src/app/manifest.ts");
check(manifest.includes('start_url: "/dashboard"'), "PWA must start at /dashboard");
check(!manifest.includes('/api/brand/logo'), "PWA install icons must be static assets");
check(manifest.includes('sizes: "180x180"'), "PWA apple icon must declare its real size");

const serviceWorker = read("public/sw.js");
check(serviceWorker.includes('const CACHE_NAME = "All Noodles-v11"'), "service worker cache must be rotated");

const layout = read("src/app/layout.tsx");
check(!layout.includes('/api/brand/logo'), "global metadata must not invoke the dynamic logo route");

for (const path of [
  "src/components/app-sidebar.tsx",
  "src/components/settings/settings-mobile-bottom-nav.tsx",
  "src/app/settings/page.tsx",
]) {
  const source = read(path);
  check(!source.includes("prefetch={true}"), `${path} must not force full-route prefetch`);
}

const sidebar = read("src/components/app-sidebar.tsx");
check(!/\n\s*prefetch\s*\n/.test(sidebar), "sidebar must not force full-route prefetch");
check((sidebar.match(/prefetch=\{false\}/g) ?? []).length >= 5, "every shared sidebar link must disable prefetch");

for (const path of [
  "src/components/settings/settings-mobile-bottom-nav.tsx",
  "src/components/settings/product-category-color-settings.tsx",
  "src/components/settings/product-print-background-color-settings.tsx",
  "src/components/settings/product-settings-tabs.tsx",
]) {
  check(!read(path).includes("router.prefetch("), `${path} must not trigger eager route prefetch`);
}

const createOrderContext = read("src/components/orders/create-order-context.tsx");
check(
  /if \(isOpen && !data && !isPending\)/.test(createOrderContext),
  "create-order data must load only after the modal is opened",
);

const logoRoute = read("src/app/api/brand/logo/route.ts");
check(!logoRoute.includes("no-cache, no-store"), "brand logo must be cacheable");
check(logoRoute.includes('cacheTag("brand-logo")'), "brand logo database read must be tagged");

const settingsAdmin = read("src/lib/settings/admin.ts");
check(
  /export async function getSettingsProductsData[\s\S]*?"use cache";/.test(settingsAdmin),
  "settings product data must be cached",
);
check(settingsAdmin.includes("getSettingsVehiclesData"), "vehicle settings must use a narrow loader");
check(settingsAdmin.includes("getSettingsSuppliersData"), "supplier settings must use a narrow loader");
check(!settingsAdmin.includes("return { vehicles: [] };"), "vehicle query errors must not be cached as empty data");
check(
  !settingsAdmin.includes("return { nextSupplierCode: getNextSupplierCode([]), suppliers: [] };"),
  "supplier query errors must not be cached as empty data",
);
check(
  settingsAdmin.includes('throw new Error(firstError?.message ?? "ไม่สามารถโหลดข้อมูลสินค้าได้");'),
  "product query errors must not be cached as empty data",
);

const warehouses = read("src/lib/warehouses.ts");
check(warehouses.includes('cacheTag(`settings-${organizationId}`)'), "warehouse reads must share the settings cache tag");

const warehouseActions = read("src/app/settings/warehouses/actions.ts");
check(
  warehouseActions.includes('function revalidateWarehousePaths(organizationId: string)') &&
    warehouseActions.includes('updateTag(`settings-${organizationId}`)'),
  "every warehouse write must invalidate cached warehouse data",
);

const factorySheet = read("src/lib/orders/vehicle-product-summary.ts");
check(
  /export async function getFactoryOrderSheetData[\s\S]*?"use cache";/.test(factorySheet),
  "factory sheet reads must be cached",
);

const settingsActions = read("src/app/dashboard/settings/actions.ts");
check(!settingsActions.includes('revalidatePath("/", "layout")'), "settings writes must not invalidate the whole app");

const supplierActions = read("src/app/settings/suppliers/actions.ts");
check(supplierActions.includes('updateTag(`settings-${session.organizationId}`)'), "supplier writes must invalidate cached supplier data");
const supplierDeleteAction = read("src/components/settings/suppliers-delete-action.ts");
check(
  supplierDeleteAction.includes('updateTag(`settings-${session.organizationId}`)'),
  "supplier delete must invalidate cached supplier data",
);

const vehicleActions = read("src/app/settings/vehicles/actions.ts");
check(!vehicleActions.includes('updateTag(`orders-${organizationId}`)'), "vehicle writes must not invalidate the orders cache");

const buildManifestPath = resolve(root, ".next/server/functions-config-manifest.json");
if (existsSync(buildManifestPath)) {
  const buildManifest = JSON.parse(readFileSync(buildManifestPath, "utf8"));
  const matchers = buildManifest.functions?.["/_middleware"]?.matchers ?? [];
  check(
    !matchers.some((matcher) => matcher.originalSource === "/:path*"),
    "production build must not run proxy on every path",
  );
}

if (failures.length > 0) {
  throw new Error(`Performance regression checks failed:\n- ${failures.join("\n- ")}`);
}

console.log("Performance regression checks passed.");

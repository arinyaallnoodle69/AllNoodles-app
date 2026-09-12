# Design QA — ปรับยอดสั่งผลิต

**Source visual truth**

- `C:\Users\Riew\AppData\Local\Temp\codex-clipboard-299b4b99-89b0-4815-b248-0ede5cfa9388.png`
- Source pixels: 1536 × 1024.

**Rendered implementation**

- Desktop: `C:\Users\Riew\Desktop\Ya-Noodles\docs\design-qa\desktop-factory-adjustment.jpg` — 1440 × 900 CSS px, device scale factor 1.
- Mobile: `C:\Users\Riew\Desktop\Ya-Noodles\docs\design-qa\mobile-factory-adjustment.jpg` — 325 × 862 CSS px, device scale factor 1.
- Vehicle dropdown: `C:\Users\Riew\Desktop\Ya-Noodles\docs\design-qa\mobile-vehicle-dropdown-expanded.jpg` — 325 × 862 CSS px, device scale factor 1.
- Combined comparison: `C:\Users\Riew\Desktop\Ya-Noodles\docs\design-qa\comparison.jpg` — 1536 × 2000 px. The source is normalized to 1536 × 1024 above the desktop and mobile captures.
- State: modal open with ANP180, ANP181 and ANP182; values match the selected mockup. Vehicle selector is also captured expanded with all checkboxes selected.

**Findings**

- No actionable P0, P1 or P2 visual differences remain.
- Fonts and typography: Noto Sans Thai remains sharp, dark and readable; hierarchy and numeric weights match the target.
- Spacing and layout rhythm: desktop modal is 900 px wide with eight aligned tracks; mobile uses the target two-column cards and a fixed footer without clipping.
- Colors and visual tokens: white surfaces, dark text, purple result fields and pink adjustment trigger match the selected direction. The print trigger retains the original system purple.
- Image quality and assets: no raster assets are required inside this form; icons use the installed Lucide set used by the existing order page.
- Copy and content: product codes, labels, units, totals and actions match the requested workflow.
- The visible operator order intentionally follows the confirmed formula: `ยอดออเดอร์ − คงเหลือ + ของสำรอง = ยอดสั่ง`. This produces 575 − 70 + 55 = 560 and avoids the mathematically inconsistent operator order in the mockup.

**Focused comparison evidence**

- Inputs, purple calculated cells, totals and footer actions were opened at native size in both desktop and mobile captures; text and borders remain readable without overlap.
- The mobile vehicle dropdown was opened, all options remained inside the sheet, one vehicle was selected, and the collapsed summary updated to the selected vehicle.

**Comparison history**

- P1 found: the initial browser build used stale Tailwind output, leaving the new purple calculated cells transparent and collapsing the desktop grid.
- Fix: registered the new component with Tailwind `@source`, cleared only `.next`, and rebuilt the browser preview.
- Post-fix evidence: the desktop grid resolves to eight tracks inside a 900 px dialog; `560 กก.` resolves to `rgb(87, 32, 183)`; the revised captures above show both responsive layouts intact.

**Primary interactions tested**

- Open and close both sheets.
- Enter reserve 60 for ANP180 and confirm the automatic result changes from 560 to 565.
- Expand and collapse the vehicle dropdown, clear all vehicles, select รถกรุงเทพ, and confirm the selection summary updates.
- Browser showed no runtime error overlay. The local server log contained only expected unauthenticated performance-endpoint responses from the isolated QA route.

**Implementation Checklist**

- [x] Desktop layout matches the selected modal.
- [x] Mobile layout remains readable at 325 × 862.
- [x] Formula and totals update automatically.
- [x] Vehicle selector uses dropdown plus checkboxes.
- [x] Print button uses the original purple.

**Follow-up Polish**

- None required for handoff.

## Design QA — สำรองผลิตสดวันนี้

**Source visual truth**

- `C:\Users\Riew\AppData\Local\Temp\codex-clipboard-0a9adf10-bda3-411b-9b0f-01fed95fae0b.png`
- Selected desktop and mobile composition was treated as the exact layout reference.

**Rendered implementation**

- Desktop inspected at 1280 × 720 CSS px on `http://localhost:3001`.
- Mobile inspected at 390 × 844 CSS px on `http://localhost:3001`.
- Compared title, date control, total available quantity, last-updated time, adjustment action, three product rows, progress bars, availability status and recent activity.

**Findings**

- No actionable P0, P1 or P2 visual differences remain.
- Desktop keeps the flat four-column product rows and fixed recent-activity rail from the source.
- Mobile keeps each product on one compact row group, with the numeric availability aligned right and recent activity collapsed below.
- Text, quantities and status chips remain readable without horizontal overflow at 390 px.
- Colors, spacing, dark typography, purple progress bars and magenta adjustment action follow the selected mockup.

**Implementation Checklist**

- [x] Desktop layout matches the selected reserve dashboard.
- [x] Mobile layout matches the selected compact composition.
- [x] ANP180, ANP181 and ANP182 use live date-scoped order demand.
- [x] New same-day orders reduce the available reserve.
- [x] No reserve is carried into another date.
- [x] The adjustment dialog is available from the dashboard.

final result: passed

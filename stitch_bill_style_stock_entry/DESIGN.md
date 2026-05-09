---
name: Inventory Receipt UI
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#45464d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#0b1c30'
  on-tertiary-container: '#75859d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#d3e4fe'
  tertiary-fixed-dim: '#b7c8e1'
  on-tertiary-fixed: '#0b1c30'
  on-tertiary-fixed-variant: '#38485d'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.05em
  data-mono:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.5'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  container-max-width: 1200px
  sheet-padding: 40px
  gutter: 24px
  margin-mobile: 16px
---

## Brand & Style
The brand personality of this design system is authoritative, meticulous, and functional. It is designed for professionals who manage high-volume inventory and require a high-trust interface that mimics the reliability of physical documentation. 

The design style is a **Modern-Tactile** hybrid. It draws heavily from the "receipt" or "invoice" aesthetic—utilizing a "sheet" metaphor where the primary content resides on white surfaces that appear physically placed on a soft gray background. It avoids unnecessary decoration, favoring structural integrity, clear borders, and high-contrast legibility. The emotional response is one of organized control and archival accuracy, bridging the gap between traditional paper-based workflows and modern digital efficiency.

## Colors
This design system utilizes a high-contrast palette to ensure absolute clarity in data-dense environments. 

- **Primary & Text:** A deep, near-black blue (#0F172A) and pure black (#000000) are used for all critical information and headings, ensuring the "ink on paper" feel.
- **Accents:** A professional "Financial Blue" (#2563EB) is used sparingly for primary actions and status indicators, providing a modern digital affordance without distracting from the data.
- **Surface Grays:** A hierarchy of soft grays (#F8FAFC to #E2E8F0) defines the environment. The background is a soft neutral, while the "paper" surfaces are pure white to provide maximum contrast.
- **Semantic Colors:** Success, warning, and error states follow standard professional conventions but are slightly desaturated to maintain the "printed" aesthetic.

## Typography
The typography in this design system is functional and systematic, using **Inter** for its exceptional legibility in both English and Thai scripts. 

For the Thai language implementation, line heights are slightly increased (1.6x) to accommodate tone marks without crowding. The typographic hierarchy mimics a formal document:
- **Headlines:** Bold and impactful, used for document titles (e.g., "ใบกำกับสินค้า" / Invoice).
- **Labels:** Small, uppercase labels are used for form headers to replicate the "field label" look found on physical vouchers.
- **Data Tables:** Numerical data uses tabular numbers (tnum) to ensure columns of figures align perfectly, aiding in rapid scanning of stock counts and prices.

## Layout & Spacing
The layout philosophy is based on a **Fixed-Center Sheet** model. While the dashboard wrapper is fluid, the core inventory documents (invoices, stock sheets, reports) are contained within fixed-width "sheets" that mirror A4 or Receipt proportions.

- **Grid:** A 12-column grid is used for the internal layout of these sheets.
- **Margins:** Generous internal padding (40px) within "sheets" ensures a professional, breathable document look.
- **Rhythm:** An 8px linear scale governs all vertical spacing.
- **Mobile:** On smaller screens, the "sheet" metaphor persists but the margins compress to 16px. Elements within tables reflow into "card-style" line items while maintaining the bordered aesthetic.

## Elevation & Depth
Depth in this design system is achieved through **Tonal Layering** rather than dramatic shadows. 

1. **The Floor (Level 0):** The base background of the application (#F1F5F9), representing the desk surface.
2. **The Sheet (Level 1):** The primary content area. It uses a pure white surface with a very thin, 1px border (#E2E8F0) and a subtle, sharp shadow (Y: 2px, Blur: 4px, Opacity: 0.05) to create a "stacked paper" effect.
3. **Popovers/Modals (Level 2):** These represent documents placed on top of others. They feature a slightly more pronounced shadow to indicate higher elevation.

No blur effects or gradients are used, keeping the interface grounded and "flat" like a printed page.

## Shapes
This design system uses **Soft (0.25rem)** roundedness to maintain a professional, slightly traditional document feel. 

- **Sheets:** Should remain sharp (0px) or have a very minimal radius (2px) to mimic cut paper.
- **Buttons & Inputs:** Use the standard 0.25rem (4px) radius. This provides a modern touch without becoming too "playful" or consumer-oriented.
- **Data Badges:** Small status badges (e.g., "In Stock") use a slightly higher radius to differentiate them from functional inputs, but never exceed 4px.

## Components
Components are designed to look like elements of a physical form.

- **Tables (Line Items):** These are the core of the system. They feature thin horizontal dividers and no vertical lines. Headers are set in the `label-caps` style with a light gray background row.
- **Buttons:** Primary buttons are solid deep blue. Secondary buttons are "Ghost" style with a 1px border, mimicking a stamped or outlined area on a form.
- **Input Fields:** These do not use background fills. Instead, they use a bottom-border only or a very light 4-sided border, looking like blanks on a paper form.
- **Checkboxes:** Square and sharp, using the primary blue for the checked state. 
- **Inventory Chips:** Used for status (e.g., "สต็อกต่ำ" / Low Stock). They use low-saturation background colors with high-contrast text.
- **The "Voucher" Card:** A specific component for summary data (Total Value, Total SKUs) that uses a dashed border on the bottom to simulate a "tear-off" portion of a receipt.
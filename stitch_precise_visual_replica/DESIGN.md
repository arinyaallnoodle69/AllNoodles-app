---
name: Professional Financial Reporting System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#001a42'
  on-tertiary-container: '#3980f4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#004395'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: IBM Plex Sans
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: IBM Plex Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-lg-mobile:
    fontFamily: IBM Plex Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: IBM Plex Sans
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  data-mono:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 24px
  margin: 32px
---

## Brand & Style

This design system is engineered for high-density financial environments where precision and clarity are paramount. The aesthetic is **Modern Corporate**, prioritizing a "data-first" philosophy that minimizes visual noise to accelerate cognitive processing.

The brand personality is authoritative and reliable. It evokes a sense of institutional stability through a structured visual hierarchy and a restrained use of decorative elements. The interface utilizes generous white space not as a stylistic choice, but as a functional separator to prevent information fatigue in complex reporting modules.

## Colors

The palette is derived from the source image but recalibrated for formal data visualization. 
- **Primary (Navy):** Used for typography, navigation, and primary actions to establish a grounded, professional tone.
- **Secondary (Emerald):** Reserved specifically for positive financial indicators, growth metrics, and success states.
- **Tertiary (Blue):** Utilized for interactive elements like links and primary buttons to distinguish them from static data.
- **Neutrals:** A range of cool grays provides the structural framework, using `#F8FAFC` for subtle background partitioning and `#E2E8F0` for hairline borders that define reporting tables.

## Typography

**IBM Plex Sans** is the core typeface, chosen for its exceptional legibility in both English and Thai scripts and its technical, "engineered" appearance. 

Key typographic rules:
- **Numerical Precision:** All table data must use tabular lining figures (`tnum`) to ensure columns of numbers align vertically for easier comparison.
- **Hierarchy:** Labels use uppercase styling with increased letter-spacing to differentiate metadata from actual values.
- **Density:** Body sizes are kept conservative (14px-16px) to maximize the amount of information visible on screen without sacrificing readability.

## Elevation & Depth

To maintain a "serious" and "clean" aesthetic, this design system avoids heavy shadows and traditional skeuomorphism. Depth is communicated through:

- **Low-Contrast Outlines:** Containers are defined by 1px solid borders in `#E2E8F0`. This creates a flat, architectural feel.
- **Tonal Layering:** The primary background is white (`#FFFFFF`), while secondary layout areas (like sidebars or table headers) use a subtle `#F8FAFC` tint to create separation.
- **Active States:** Subtle 2px "focus rings" in Tertiary Blue indicate interactive elements, ensuring the interface remains accessible without adding visual bulk.

## Shapes

The system uses **Soft (Level 1)** roundedness. 
- **Standard Radius:** 4px (0.25rem) for input fields, buttons, and small containers.
- **Large Radius:** 8px (0.5rem) for primary dashboard cards and modals.

This subtle rounding softens the clinical nature of the data-heavy layout while maintaining the sharp, structured appearance expected in a corporate financial tool. Circular shapes are strictly reserved for status indicators (dot pips) and avatars.

## Components

### Data Tables
Tables are the heart of the system.
- **Headers:** Light gray background (`#F8FAFC`), semi-bold typography, and bottom-border only.
- **Rows:** Subtle hover state in `#F1F5F9`. No vertical borders between columns to reduce visual clutter; use horizontal borders only.
- **Alignment:** Text is left-aligned; currency and numerical data are right-aligned to the decimal point.

### KPI Cards
- **Structure:** Metric title (Label SM), Value (Headline LG), and Trend Indicator (Body SM).
- **Trend Indicators:** Use Secondary Green for positive and a standard system red for negative, accompanied by small directional icons.

### Buttons & Controls
- **Primary:** Solid Primary Navy for high-importance actions (e.g., "Generate Report").
- **Secondary:** Outlined Tertiary Blue for standard actions.
- **Inputs:** 1px border with 4px radius. Labels should always be visible above the input field to maintain clarity during data entry.

### Chips & Tags
- Used for status (e.g., "Pending", "Verified"). Use low-saturation background tints with high-saturation text of the same hue to keep the interface looking professional and not overly colorful.
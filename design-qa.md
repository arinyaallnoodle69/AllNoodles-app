**Source visual truth**

- `C:\Users\Riew\AppData\Local\Temp\codex-clipboard-680a3202-2df8-433d-9666-a1966e5b7375.png`
- Source pixels: 547 × 961. This is a mobile reference capture showing the vertically constrained product area.

**Implementation evidence**

- Route: `http://localhost:3000/order`
- Intended QA viewport: 390 × 844 CSS px, device scale factor 1.
- Implementation screenshot: unavailable because the isolated local QA browser is redirected to the LINE sign-in screen before the special-item modal can be opened.
- State requested: mobile special-item modal, cart closed and cart open.
- Console errors: modal state unavailable behind authentication.

**Full-view comparison evidence**

- The source capture was opened at original resolution and shows separate full-width vehicle and search rows plus stacked cart and save controls consuming excessive vertical space.
- Browser-rendered post-fix comparison is blocked by authentication.

**Focused region comparison evidence**

- Source focus regions: vehicle/search controls and cart/save footer.
- Post-fix focused captures are unavailable for the same authentication blocker.

**Findings**

- [P2] Browser-rendered visual verification remains incomplete.
  Location: mobile special-item modal.
  Evidence: responsive source tests, ESLint, and the production build pass, but the authenticated modal cannot be reached in the isolated QA session.
  Impact: exact visual fit and sticky-footer behavior cannot be compared pixel-for-pixel against the supplied screenshot.
  Fix: repeat visual QA from an authenticated browser session at 390 × 844 with the cart both closed and open.

**Implemented fixes pending visual confirmation**

- Vehicle selector and product search now share one compact row on mobile.
- Cart toggle and save action now share one fixed footer row.
- The cart expands above the action row and remains independently scrollable.
- Desktop vehicle and search controls remain unchanged.
- Product selection and save logic remain unchanged.

**Comparison history**

- Iteration 1: fixed full-screen modal, overlapping checkbox/image, clipped names, and unreadable one-line cart rows.
- Iteration 2: source image showed insufficient product-list height. Combined vehicle/search and cart/save controls into two compact rows. Post-fix browser evidence is blocked by authentication.

**Implementation checklist**

- [x] Compact mobile filter row.
- [x] Side-by-side cart and save controls.
- [x] Expandable grouped cart above persistent actions.
- [x] Responsive regression tests, ESLint, production build, and diff checks.
- [ ] Authenticated browser screenshot and combined visual comparison.

final result: blocked

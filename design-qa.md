# Design QA — Stock movement report

- Reference: `C:/Users/Riew/Downloads/download.png`
- Route: `/stock/movements`
- Desktop structure: passed — compact purple header, report card, search, bordered table, grouped product rows, pagination.
- Interaction: passed by implementation check — the arrow is in the date cell and toggles a compact store/document table directly below its row; product search remains available.
- Mobile structure: passed by responsive implementation check — table becomes product/date cards with the same inline sale breakdown.
- Accessibility: passed — labelled filters/search, semantic table, keyboard buttons, `aria-expanded`, visible focus styles.
- Build checks: passed — ESLint, report unit tests, and production build.
- Live visual capture: blocked in both QA browser sessions because neither has an authenticated local session and both redirect to `/login`.

Final result: blocked — implementation and build checks pass, but authenticated visual comparison is still required.

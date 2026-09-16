# Design QA — Stock Movement Report

- Source: approved All Noodles desktop/mobile mockup.
- Implementation: `src/components/settings/daily-stock-report-client.tsx`.
- Automated checks: lint, stock movement tests, production build.
- Visual comparison: blocked because the Codex in-app browser runtime failed to initialize (`failed to write kernel assets: path not found`).

## Implemented states

- Desktop product summary with inline Stock Card directly below its product row.
- Mobile product cards with inline statement-style Stock Card.
- Date, warehouse, and product filters remain available.
- Operator is not rendered; persistence is unchanged.

final result: blocked

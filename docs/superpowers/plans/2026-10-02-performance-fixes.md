# Production Performance Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the measured production latency multipliers without changing order-save or delivery-note synchronization behavior.

**Architecture:** Co-locate Vercel compute with Supabase, prevent eager route/data loading, make PWA branding cacheable, cache repeated read models, and invalidate only the cache tag that owns changed settings data.

**Tech Stack:** Next.js 16.1.5 App Router, React 19, Vercel Functions, Supabase/Postgres, PWA service worker.

**Spec:** User request in this task: implement findings 1, 2, 4, 5, 6, and 7; item 3 is explicitly forbidden.

## Global Constraints

- Do not modify `src/app/orders/incoming/actions.ts`.
- Do not modify `src/app/order/actions.ts`.
- Do not modify `src/lib/orders/sync-delivery-note.ts`.
- Do not add dependencies or database migrations.
- Keep existing authorization and custom-logo behavior.

## Tasks

- [ ] Configure all Vercel Functions for `sin1` and verify the production build emits the intended proxy matchers.
- [ ] Disable eager navigation/data prefetch and load the global create-order modal only on demand.
- [ ] start the installed PWA at the authenticated application entry point and use static install icons.
- [ ] Cache the custom-logo read path and remove `no-store` responses.
- [ ] Cache repeated settings, warehouse, and factory-sheet reads; use narrow settings loaders for vehicle and supplier pages.
- [ ] Replace whole-application settings invalidation with the owning settings cache tag.
- [ ] Run the regression check, lint, production build, and verify forbidden file hashes are unchanged.


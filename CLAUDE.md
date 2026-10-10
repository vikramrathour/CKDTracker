# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CKD Tracker: a mobile-first Next.js 15 (App Router, React 19) PWA for one kidney-transplant patient to track lab results (hemogram, kidney function, tacrolimus levels, electrolytes, lipids, urine) over time. Lab reports are mostly Metropolis Healthcare (India) PDFs. All data is personal medical data — never commit real reports (`reports/` is gitignored for this reason) and use redacted/synthetic data in fixtures. The roadmap (care-circle multi-tenant model, phone OTP, Gemini chat, visit tools, TWA) is being built in phases.

## Commands

```bash
npm run dev          # dev server on :3000
npm run build        # production build (also the full type-check)
npm run lint         # next lint
npx tsc --noEmit     # fast type-check without building
npm test             # vitest run (tests/*.test.ts, node env, synthetic data only)
npx vitest run tests/date.test.ts -t "DD/MM"   # single file / test
```

Requires Node 22+ (firebase-admin 14). Copy `.env.example` to `.env.local` and fill Firebase + `GEMINI_API_KEY`; without `NEXT_PUBLIC_FIREBASE_API_KEY` the Firebase layer silently skips init and `db`/`auth` are `undefined`.

## Architecture

**Routing.** `app/(auth)/login` is public. Everything under `app/(app)/` (dashboard, records, records/new, upload, trends, analysis, medications, settings) is wrapped by `components/layout/app-shell.tsx`, which does the auth gate *client-side* (redirects to `/login` when `useAuth()` has no user) and renders the bottom nav. There is no middleware or server-side session — all Firestore access happens from the browser with the signed-in user's credentials, so Firestore/Storage security rules are the real access control. They live in `firestore.rules` / `storage.rules` (owner-only on `users/{uid}/**` and `lab-pdfs/{uid}/**`; `sharedLinks` closed) — update them whenever you add a collection or storage path, and deploy with `npx firebase-tools deploy --only firestore:rules,storage`.

**Data layer (`lib/firebase/`).** Thin wrappers over the modular Firebase JS SDK (v13). Data model:
- `users/{uid}` — profile doc
- `users/{uid}/labRecords/{id}` — one doc per lab report; `values: LabValue[]` is embedded (not a subcollection). `recordDate`/`createdAt`/`updatedAt` are Firestore `Timestamp`s, converted to ISO strings on read — app code always sees strings.
- `users/{uid}/medications/{id}`
- `sharedLinks/{id}` — top-level, looked up by `token` field (currently by scanning the collection client-side)
- Storage: `lab-pdfs/{uid}/{timestamp}-{filename}`

Storage is lazy-loaded via dynamic import (`getStorageInstance()`). FCM (`messaging.ts` + `public/firebase-messaging-sw.js`) needs `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.

**Personal data.** The repo is public. Real patient data lives only in the gitignored `lib/personal/local.ts`, read **only** by Admin scripts (`scripts/seed-owner.ts`, `npx tsx scripts/seed-owner.ts <uid> [--dry-run]`, needs `FIREBASE_SERVICE_ACCOUNT_B64`). Client code must never import it or the `@personal-data` alias (a CLI deploy would bundle it for every user). Medications and doctor/hospital come from Firestore (`users/{uid}/medications`, profile via `useProfile()`). `lib/personal/sample.ts` is synthetic demo data (`SEED_RECORDS`).

**Demo data.** No auto-seeding. With `NEXT_PUBLIC_ENABLE_DEMO=1` the empty dashboard offers "Load demo data" (synthetic `SEED_RECORDS`). Profiles are created idempotently by `ensureUserProfile()` on every auth state change.

**Lab test vocabulary — keep in sync.** A test is identified by its exact `testName` string, which must match across:
1. `REFERENCE_RANGES` in `lib/constants/reference-ranges.ts` — min/max/unit/panel, `higherIsBetter`, and `weight` (1–10) used by scoring
2. `PANELS` in `lib/constants/test-panels.ts` — panel membership/display order; `CRITICAL_METRICS` = Creatinine, eGFR, Tacrolimus
3. `METROPOLIS_PATTERNS` in `lib/parsing/metropolis.ts` — regex extraction (panel/unit come from REFERENCE_RANGES)
4. Seed records in `lib/personal/sample.ts` (and your local `local.ts`) if it should appear in seed data

A name mismatch silently degrades: unknown tests score a neutral 50 and drop out of panels/trends.

**Server routes and auth.** `app/api/pdf/parse/route.ts` (nodejs runtime) requires `Authorization: Bearer <Firebase ID token>` — call it with `apiFetch()` from `lib/api/client.ts`, which attaches the token. Server helpers in `lib/server/` (`server-only`): `firebase-admin.ts` (Admin SDK; token verification needs only the project ID, Admin Firestore needs `FIREBASE_SERVICE_ACCOUNT_B64`), `auth.ts` (`requireUser`, `HttpError`, `errorResponse`), `gemini.ts` (`@google/genai`, model from `GEMINI_MODEL`, default gemini-2.5-flash; key must be on a paid/billing-enabled project).

**PDF parsing.** POST multipart `file` (PDF, ≤10 MB, `%PDF-` signature checked) → `pdf-parse` → `parseLabText()` in `lib/parsing/metropolis.ts` (patterns anchored to line start, value read from the same line only) and `extractReportDate()` in `lib/parsing/date.ts` (numeric dates are always DD/MM/YYYY; label priority Collection > Sample > Registration > Report). Fewer than 3 values → Gemini structured-output fallback, names validated against REFERENCE_RANGES.

**Calculations (`lib/calculations/`).** Pure functions, no Firebase:
- `health-score.ts` — per-value score 0–100 (100 in range, decays as (deviation/range width)^0.8), weighted by `REFERENCE_RANGES[*].weight`; record-specific `referenceMin/Max` override defaults; a panel with no values is `null` and excluded from the overall
- `trends.ts` — linear regression over a test's history
- `deltas.ts` — change vs previous record
- `higherIsBetter` in REFERENCE_RANGES is the single source of truth for direction (trends, deltas via `isDeltaPositive`, charts)
- `analysis.ts` — CKD stage from eGFR (`CKD_STAGES`), volatility (SD/CV), age-gap deficit, medication interactions

**Design system.** Ported from the owner's site (vikramrathour_website): tokens in `tailwind.config.js` backed by CSS variables in `app/globals.css` (light + `.dark`, applied from prefers-color-scheme by an inline script in `app/layout.tsx`). Colors `canvas vellum recess wash ink ink-2 ink-3 terra terra-dk terra-pale terra-lt sage sage-pale critical critical-pale hair hair-2 hair-hot`; fonts `font-serif` (Newsreader) / `font-sans` (Plus Jakarta Sans); `rounded-btn` 4px, `rounded-card` 6px, `shadow-soft/lift`, `ease-editorial`; classes `.label .eyebrow .num .tlink .glass .pulse-dot .field`. Lab status colors live in `components/ui/status.ts` (charts use `useThemeColors()` because SVG attributes can't read CSS vars). Don't use raw Tailwind palette colors (emerald/blue/gray…).

**Misc.** `@/*` maps to the repo root. `kidney-health-tracker.jsx` at the root is the original single-file prototype; it contains real data, is gitignored, and isn't imported anywhere. `serwist`/`@serwist/next` are installed but not wired into `next.config.js`.

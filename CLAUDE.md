# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CKD Tracker: a mobile-first Next.js 14 (App Router) PWA for one kidney-transplant patient to track lab results (hemogram, kidney function, tacrolimus levels, electrolytes, lipids, urine) over time. Lab reports are mostly Metropolis Healthcare (India) PDFs. All data is personal medical data — never commit real reports (`reports/` is gitignored for this reason) and use redacted/synthetic data in fixtures.

## Commands

```bash
npm run dev          # dev server on :3000
npm run build        # production build (also the full type-check)
npm run lint         # next lint
npx tsc --noEmit     # fast type-check without building
```

There is no test framework yet. Copy `.env.example` to `.env.local` and fill Firebase + `GEMINI_API_KEY`; without `NEXT_PUBLIC_FIREBASE_API_KEY` the Firebase layer silently skips init and `db`/`auth` are `undefined`.

## Architecture

**Routing.** `app/(auth)/login` is public. Everything under `app/(app)/` (dashboard, records, records/new, upload, trends, analysis, medications, settings) is wrapped by `components/layout/app-shell.tsx`, which does the auth gate *client-side* (redirects to `/login` when `useAuth()` has no user) and renders the bottom nav. There is no middleware or server-side session — all Firestore access happens from the browser with the signed-in user's credentials, so Firestore/Storage security rules are the real access control. They live in `firestore.rules` / `storage.rules` (owner-only on `users/{uid}/**` and `lab-pdfs/{uid}/**`; `sharedLinks` closed) — update them whenever you add a collection or storage path, and deploy with `npx firebase-tools deploy --only firestore:rules,storage`.

**Data layer (`lib/firebase/`).** Thin wrappers over the modular Firebase v10 SDK. Data model:
- `users/{uid}` — profile doc
- `users/{uid}/labRecords/{id}` — one doc per lab report; `values: LabValue[]` is embedded (not a subcollection). `recordDate`/`createdAt`/`updatedAt` are Firestore `Timestamp`s, converted to ISO strings on read — app code always sees strings.
- `users/{uid}/medications/{id}`
- `sharedLinks/{id}` — top-level, looked up by `token` field (currently by scanning the collection client-side)
- Storage: `lab-pdfs/{uid}/{timestamp}-{filename}`

Storage is lazy-loaded via dynamic import (`getStorageInstance()`). FCM (`messaging.ts` + `public/firebase-messaging-sw.js`) needs `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.

**Personal data.** The repo is public. Patient-specific data (seed lab history, prescription list, doctor/hospital) is imported via the `@personal-data` tsconfig alias, which resolves to the gitignored `lib/personal/local.ts` (real data) if present, else the committed `lib/personal/sample.ts` (synthetic). Both implement `PersonalData` in `lib/personal/types.ts`. Never put real values, names or prescriptions anywhere else in tracked files; read them through `lib/constants/seed-data.ts` / `lib/constants/medications.ts` (`DEFAULT_MEDICATIONS`, `DOCTOR_NAME`, `DOCTOR_HOSPITAL`). When changing `PersonalData`, update both files.

**First-login seeding.** `lib/hooks/use-lab-records.ts` writes `SEED_RECORDS` into Firestore when a user has zero records. Changing seed data affects only new users.

**Lab test vocabulary — keep in sync.** A test is identified by its exact `testName` string, which must match across:
1. `REFERENCE_RANGES` in `lib/constants/reference-ranges.ts` — min/max/unit/panel, `higherIsBetter`, and `weight` (1–10) used by scoring
2. `PANELS` in `lib/constants/test-panels.ts` — panel membership/display order; `CRITICAL_METRICS` = Creatinine, eGFR, Tacrolimus
3. `METROPOLIS_PATTERNS` in `app/api/pdf/parse/route.ts` — regex extraction
4. Seed records in `lib/personal/sample.ts` (and your local `local.ts`) if it should appear in seed data

A name mismatch silently degrades: unknown tests score a neutral 50 and drop out of panels/trends.

**PDF parsing (`app/api/pdf/parse/route.ts`).** The only server route. POST multipart `file` → `pdf-parse` (listed in `serverComponentsExternalPackages` in `next.config.js`) → regex extraction with `METROPOLIS_PATTERNS`. If fewer than 3 values match, falls back to Gemini (`gemini-1.5-flash`) with the raw text. Regexes are order/overlap sensitive (e.g. `MCH` vs `MCHC`, `HDL`/`LDL` vs `VLDL`). The route has no auth check.

**Calculations (`lib/calculations/`).** Pure functions, no Firebase:
- `health-score.ts` — per-value score 0–100 (100 in range, decays with deviation relative to range width), weighted by `REFERENCE_RANGES[*].weight`; record-specific `referenceMin/Max` override defaults
- `trends.ts` — linear regression over a test's history
- `deltas.ts` — change vs previous record
- `analysis.ts` — CKD stage from eGFR (`CKD_STAGES`), volatility (SD/CV), age-gap deficit, medication interactions

**Misc.** `@/*` maps to the repo root. `kidney-health-tracker.jsx` at the root is the original single-file prototype; it contains real data, is gitignored, and isn't imported anywhere. `serwist`/`@serwist/next` are installed but not wired into `next.config.js`.

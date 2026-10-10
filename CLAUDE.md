# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CKD Tracker: a mobile-first Next.js 15 (App Router, React 19) PWA for kidney-transplant patients and their care circle (family, caregivers, doctors) to track lab results (hemogram, kidney function, tacrolimus levels, electrolytes, lipids, urine) over time. Lab reports are mostly Metropolis Healthcare (India) PDFs. All data is personal medical data — never commit real reports (`reports/` is gitignored for this reason) and use redacted/synthetic data in fixtures. Data is multi-tenant: one `patients/{pid}` per tracked person, shared through a role-based care circle. The roadmap (invites, Gemini chat, visit tools, TWA) is being built in phases.

## Commands

```bash
npm run dev          # dev server on :3000
npm run build        # production build (also the full type-check)
npm run lint         # next lint
npx tsc --noEmit     # fast type-check without building
npm test             # vitest run (tests/*.test.ts, node env, synthetic data only)
npx vitest run tests/date.test.ts -t "DD/MM"   # single file / test
npm run test:rules   # emulator suites in tests/rules/ (rules + migration); needs Java
```

`npm test` excludes `tests/rules/**`. `test:rules` (`scripts/test-rules.mjs`) runs `firebase-tools emulators:exec --config firebase.test.json` on dedicated ports (Firestore 8181, Storage 9299) so it works next to a dev emulator, and kills a leftover emulator JVM on those ports (Windows leaks it).

Requires Node 22+ (firebase-admin 14). Copy `.env.example` to `.env.local` and fill Firebase + `GEMINI_API_KEY`; without `NEXT_PUBLIC_FIREBASE_API_KEY` the Firebase layer silently skips init and `db`/`auth` are `undefined`.

## Architecture

**Routing.** `app/(auth)/login` is public. Everything under `app/(app)/` (dashboard, records, records/new, upload, trends, analysis, medications, settings, onboarding) is wrapped by `components/layout/app-shell.tsx`, which does the auth gate *client-side* (redirects to `/login` when `useAuth()` has no user), mounts `PatientProvider`, and renders the bottom nav. A user with no patient memberships is sent to `/onboarding` (create "myself" or "someone I care for"); a membership load error shows a retry screen instead (never onboarding). There is no middleware or server-side session — all Firestore access happens from the browser with the signed-in user's credentials, so Firestore/Storage security rules are the real access control. They live in `firestore.rules` / `storage.rules` and are tested in `tests/rules/` — update both whenever you add a collection or storage path. Deploy with `npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage` (Storage rules read Firestore membership: accept the cross-service IAM prompt).

**Active patient & roles (`components/providers/patient-provider.tsx`).** `usePatient()` returns `{ patients, activePatient, pid, role, setActivePatient, refreshPatients, loading, error, records, recordsLoading, recordsError }`; plus `useRole()` and `useCanEdit()` (owner/editor). Memberships come from `listMyPatients()` (collection-group query on `members` where `uid == me`); the active pid is `users/{uid}.activePatientId`, falling back to the first membership. The provider holds ONE realtime `onSnapshot` on the active patient's `labRecords` (ascending by date); `useLabRecords()` (`lib/hooks/use-lab-records.ts`) reads it and keeps the old `{records, loading, error, refetch}` shape (`refetch` is a no-op). `useProfile()` returns the ACTIVE PATIENT's clinical profile (name, DOB, transplant date, doctor, hospital), not the account. Pages take `pid` from the provider and hide add/edit/delete/upload for viewers (`useCanEdit()`; `components/shared/view-only-notice.tsx` on edit screens). The header (`components/layout/header.tsx` + `patient-switcher.tsx`) shows a profile switcher when the user belongs to more than one patient.

**Data layer (`lib/firebase/`).** Thin wrappers over the modular Firebase JS SDK (v13). Clinical functions in `firestore.ts` take `pid` (not uid) and stamp `createdBy` from `auth.currentUser` (rules require `createdBy == auth.uid` on create and keep it immutable). Patients, members, active patient, targets and activity live in `patients.ts`; the document-vault upload in `storage.ts`. Types: `lib/types/{patient,member,care}.ts` (`care.ts` is the shared contract for later phases: Visit, Vital, DocumentMeta, Question, Target, AlertRule, DoseChange, ChatThread/ChatMessage, Invite, ActivityEntry). Data model:
- `users/{uid}`: account profile (fullName, email, phoneNumber, `activePatientId`, `migratedAt`) and `users/{uid}/fcmTokens/{token}`. Owner-only.
- `patients/{pid}`: `ownerUid, displayName, relationship, dateOfBirth, transplantDate` (YYYY-MM-DD strings), `doctorName, hospital`. **pid = uid** for your own profile, **`${uid}_${12 random [a-z0-9]}`** for someone you care for (rules reject any other pid, so nobody can squat another user's pid). Created only in one batch together with the owner member doc (`createPatient()`); never deleted from the client.
- `patients/{pid}/members/{uid}`: `uid, role (owner|editor|viewer), displayName, phone, addedBy`. The owner doc is immutable and undeletable; only the owner switches others between editor and viewer; anyone can delete their own doc (leave). Non-owner members are added server-side only (Phase 4 invites). Collection-group index on `members.uid` in `firestore.indexes.json`.
- `patients/{pid}/labRecords/{id}`: one doc per report; `values: LabValue[]` embedded. `recordDate`/`createdAt`/`updatedAt` are Timestamps, converted to ISO strings on read, so app code always sees strings. `pdfPath` points into the document vault.
- `patients/{pid}/` `medications` (+ `doseHistory`), `visits`, `vitals`, `documents`, `questions`, `targets/{testName}`, `alertRules`: viewer read, editor write.
- `patients/{pid}/activity/{id}`: append-only audit (`logActivity()`, best-effort; `actorUid == auth.uid`, `createdAt == request.time`).
- `patients/{pid}/chats/{chatId}/messages/{id}`: server-written; readable only by the thread's `createdBy`.
- `invites/`, `usage/`, `sharedLinks/`: server-only (closed to clients).
- Storage `patients/{pid}/documents/{docId}/{file}`: members read; editors create PDF/JPEG/PNG/WebP/HEIC under 20 MB; no overwrite.
- **Legacy, read-only until the cleanup release:** `users/{uid}/labRecords|medications` and Storage `lab-pdfs/{uid}/`. `scripts/migrate-to-patients.ts` copies them to `patients/{uid}/` (same ids, `createdBy`, PDFs into the vault with `pdfPath` rewritten); idempotent, `--dry-run`, counts-only output. Core logic is in `scripts/lib/migrate-patients.ts`, tested in `tests/rules/migration.test.ts`.

Server-side membership checks: `requireMember(req, pid, minRole)` in `lib/server/auth.ts`. Storage is lazy-loaded via dynamic import (`getStorageInstance()`). FCM (`messaging.ts` + `public/firebase-messaging-sw.js`) needs `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.

**Personal data.** The repo is public. Real patient data lives only in the gitignored `lib/personal/local.ts`, read **only** by Admin scripts (`scripts/seed-owner.ts`, `npx tsx scripts/seed-owner.ts <uid> [--dry-run]`, needs `FIREBASE_SERVICE_ACCOUNT_B64`). Client code must never import it or the `@personal-data` alias (a CLI deploy would bundle it for every user). Medications and doctor/hospital come from Firestore (`patients/{pid}/medications`, patient doc via `useProfile()`); `seed-owner.ts` writes into `patients/{uid}` (creating the profile and owner member if missing), so run it after the migration. `lib/personal/sample.ts` is synthetic demo data (`SEED_RECORDS`).

**Demo data.** No auto-seeding. With `NEXT_PUBLIC_ENABLE_DEMO=1` the empty dashboard offers editors "Load demo data" (synthetic `SEED_RECORDS`, written to the active patient). Account profiles (`users/{uid}`) are created idempotently by `ensureUserProfile()` on every auth state change; patient profiles only through onboarding or the migration.

**Lab test vocabulary — keep in sync.** A test is identified by its exact `testName` string, which must match across:
1. `REFERENCE_RANGES` in `lib/constants/reference-ranges.ts` — min/max/unit/panel, `higherIsBetter`, and `weight` (1–10) used by scoring
2. `PANELS` in `lib/constants/test-panels.ts` — panel membership/display order; `CRITICAL_METRICS` = Creatinine, eGFR, Tacrolimus
3. `METROPOLIS_PATTERNS` in `lib/parsing/metropolis.ts` — regex extraction (panel/unit come from REFERENCE_RANGES)
4. Seed records in `lib/personal/sample.ts` (and your local `local.ts`) if it should appear in seed data

A name mismatch silently degrades: unknown tests score a neutral 50 and drop out of panels/trends.

**Sign-in (client auth).** Phone OTP (primary) + Google, linkable to one account. `lib/firebase/auth.ts` owns all of it: `sendOtp`/`verifyOtp` (invisible `RecaptchaVerifier`, one at a time — `clearRecaptcha()` on retry/unmount; the page mounts `<div id={RECAPTCHA_CONTAINER_ID}>` exactly once), `signInWithGoogle` (popup → `signInWithRedirect` on popup-blocked/unsupported; `AuthProvider` calls `completeRedirectSignIn()` on load and exposes `redirectError`), `linkGoogle`, `startLinkPhone`/`confirmLinkPhone`, `unlinkProvider` (refuses the last provider), and `friendlyAuthError(err, action)` — always show that, never raw codes. Never auto-merge on `auth/credential-already-in-use`. `ensureUserProfile` runs on every auth state change and mirrors `email`/`phoneNumber` onto `users/{uid}`; post-link syncs are fire-and-forget so an offline Firestore can't hang auth UI. After link/unlink call `useAuth().refreshUser()` (the User object mutates in place). Shared OTP UI (`PhoneField`, `OtpField` with `autocomplete="one-time-code"`, WebOTP hook, resend countdown) is in `components/auth/otp.tsx`; phone parsing in `lib/phone.ts` (`normalizeIndianPhone` → E.164, Indian mobiles only). `next.config.js` proxies `/__/auth/*` + `/__/firebase/*` to `<project>.firebaseapp.com` so `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` can be the app's own domain (redirect sign-in in a TWA). Console setup: README "Phone sign-in setup".

**Server routes and auth.** `app/api/pdf/parse/route.ts` (nodejs runtime) requires `Authorization: Bearer <Firebase ID token>` — call it with `apiFetch()` from `lib/api/client.ts`, which attaches the token. Server helpers in `lib/server/` (`server-only`): `firebase-admin.ts` (Admin SDK; token verification needs only the project ID, Admin Firestore needs `FIREBASE_SERVICE_ACCOUNT_B64`), `auth.ts` (`requireUser`, `requireMember`, `HttpError`, `errorResponse`), `gemini.ts` (`@google/genai`, model from `GEMINI_MODEL`, default gemini-2.5-flash; key must be on a paid/billing-enabled project).

**PDF parsing.** POST multipart `file` (PDF, ≤10 MB, `%PDF-` signature checked) → `pdf-parse` → `parseLabText()` in `lib/parsing/metropolis.ts` (patterns anchored to line start, value read from the same line only) and `extractReportDate()` in `lib/parsing/date.ts` (numeric dates are always DD/MM/YYYY; label priority Collection > Sample > Registration > Report). Fewer than 3 values → Gemini structured-output fallback, names validated against REFERENCE_RANGES.

**Calculations (`lib/calculations/`).** Pure functions, no Firebase:
- `health-score.ts` — per-value score 0–100 (100 in range, decays as (deviation/range width)^0.8), weighted by `REFERENCE_RANGES[*].weight`; record-specific `referenceMin/Max` override defaults; a panel with no values is `null` and excluded from the overall
- `trends.ts` — linear regression over a test's history
- `deltas.ts` — change vs previous record
- `higherIsBetter` in REFERENCE_RANGES is the single source of truth for direction (trends, deltas via `isDeltaPositive`, charts)
- `analysis.ts` — CKD stage from eGFR (`CKD_STAGES`), volatility (SD/CV), age-gap deficit, medication interactions

**Design system.** Ported from the owner's site (vikramrathour_website): tokens in `tailwind.config.js` backed by CSS variables in `app/globals.css` (light + `.dark`, applied from prefers-color-scheme by an inline script in `app/layout.tsx`). Colors `canvas vellum recess wash ink ink-2 ink-3 terra terra-dk terra-pale terra-lt sage sage-pale critical critical-pale hair hair-2 hair-hot`; fonts `font-serif` (Newsreader) / `font-sans` (Plus Jakarta Sans); `rounded-btn` 4px, `rounded-card` 6px, `shadow-soft/lift`, `ease-editorial`; classes `.label .eyebrow .num .tlink .glass .pulse-dot .field`. Lab status colors live in `components/ui/status.ts` (charts use `useThemeColors()` because SVG attributes can't read CSS vars). Don't use raw Tailwind palette colors (emerald/blue/gray…).

**Misc.** `@/*` maps to the repo root. `kidney-health-tracker.jsx` at the root is the original single-file prototype; it contains real data, is gitignored, and isn't imported anywhere. `serwist`/`@serwist/next` are installed but not wired into `next.config.js`.

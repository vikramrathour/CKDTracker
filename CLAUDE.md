# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CKD Tracker: a mobile-first Next.js 15.5 (App Router, React 19, TypeScript strict) PWA, also shipped as an Android TWA, for kidney-transplant patients and their care circle (family, caregivers, doctors). It tracks lab results (hemogram, kidney function, tacrolimus, electrolytes, lipids, urine), medications and dose history, targets, vitals, visits, questions and documents, with a Gemini chat over the reports. Lab reports are mostly Metropolis Healthcare (India) PDFs. Data is multi-tenant: one `patients/{pid}` per tracked person, shared through a role-based care circle (owner/editor/viewer). Firebase JS SDK 13 on the client, firebase-admin 14 on the server. README.md is the full reference; docs/TESTING-GUIDE.md is the manual test plan and go-live checklist.

**Personal data rule.** The repo is PUBLIC and all data is medical. Never commit real reports (`reports/` is gitignored), use synthetic data in fixtures/tests/screenshots. Real data lives only in the gitignored `lib/personal/local.ts`, read **only** by Admin scripts (`scripts/seed-owner.ts`). Client code must never import it or the `@personal-data` alias (a CLI deploy would bundle it for every user); `lib/constants/seed-data.ts` imports `lib/personal/sample.ts` (synthetic) directly, and vitest pins the alias to `sample.ts`. Don't open `lib/personal/local.ts`, `.env.local` or `kidney-health-tracker.jsx` (gitignored prototype with real data).

## Commands

Requires Node 22+ (firebase-admin 14) and Java for emulators.

```bash
npm run dev          # dev server on :3000
npm run build        # production build (full type-check; builds public/sw.js)
npm run lint         # next lint
npx tsc --noEmit     # fast type-check
npm test             # vitest run (tests/*.test.ts, node env, synthetic data; excludes tests/rules/**)
npx vitest run tests/date.test.ts -t "DD/MM"   # single file / test
npm run test:rules   # tests/rules/** (rules, invites, usage, migration) inside emulators:exec; needs Java
npx firebase-tools emulators:start --project demo-ckd   # dev emulators: auth 9099, firestore 8080, storage 9199, UI 4000
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
npx tsx scripts/migrate-to-patients.ts --dry-run   # legacy users/{uid} → patients/{uid} (Admin; --yes to write)
npx tsx scripts/seed-owner.ts <uid> --dry-run      # import local.ts meds/doctor into patients/{uid}
```

`test:rules` (`scripts/test-rules.mjs`) uses `firebase.test.json` (Firestore 8181, Storage 9299, project `demo-ckd`), so it runs next to a dev emulator, and kills leftover JVMs on those ports. Live Gemini smoke test: `RUN_LIVE_GEMINI=1 npx vitest run tests/chat-live.test.ts`.

Env: copy `.env.example` to `.env.local`. Without `NEXT_PUBLIC_FIREBASE_API_KEY` Firebase silently skips init (`db`/`auth` undefined). Emulators: `NEXT_PUBLIC_USE_EMULATORS=1` (client, `lib/firebase/config.ts`) plus `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST`/`FIREBASE_STORAGE_EMULATOR_HOST` (Admin SDK); client and server project ids must match the emulator's `--project`, so leave `FIREBASE_SERVICE_ACCOUNT_B64` empty when using `demo-ckd`.

## Architecture

**Routing and gates.** `app/(auth)/login` is public, as are `/invite/[id]`, `/privacy`, `/terms`, `/~offline`, `/.well-known/assetlinks.json`. Everything under `app/(app)/` is wrapped by `components/layout/app-shell.tsx`: `AppShell` redirects to `/login` without a user → `PatientProvider` → `PendingInviteRedeemer` (redeems an invite id stored in sessionStorage by `/invite/[id]`) + `PatientGate` (spinner while loading; retry screen on membership load error, never onboarding; no memberships → provider redirects to `/onboarding`; bottom nav only when the user has a patient). No middleware or server session: all Firestore/Storage access is client-side with the user's credentials, so **the rules are the real access control**.

**Navigation.** Bottom tabs Home `/dashboard`, Records (`/records`, `/upload`), Chat, Visits (`/visits`, `/questions`), More. Tapping a test anywhere opens its chart sheet: `useTestSheet()?.open(testName)` (`components/trends/test-sheet.tsx`, provider in the app shell; `TestHistory` is also the Trends page chart). `OpenReportButton` (`components/records/open-report-button.tsx`) opens a record's original file. Secondary destinations are listed once in `components/layout/more-routes.ts` (`MORE_ROUTES`, also used for the More tab's active state); add new top-level pages there.

**Active patient and roles** (`components/providers/patient-provider.tsx`). `usePatient()` → `{ patients, activePatient, pid, role, setActivePatient, refreshPatients, loading, error, records, recordsLoading, recordsError }`; `useRole()`, `useCanEdit()` (owner/editor). Memberships via `listMyPatients()` (collection-group query on `members` where `uid == me`, index in `firestore.indexes.json`); active pid in `users/{uid}.activePatientId`. The provider holds ONE realtime listener on the active patient's `labRecords`; `useLabRecords()` reads it. `useProfile()` returns the active PATIENT's clinical profile, not the account. Pages take `pid` from the provider and hide edit controls for viewers (`components/shared/view-only-notice.tsx`).

**Data layer** (`lib/firebase/`): thin wrappers over the modular SDK, all taking `pid`. Firestore uses `persistentLocalCache` (multi-tab); sign-out calls `clearOfflineData()` and reloads. Storage is lazy (`getStorageInstance()`). Types in `lib/types/` (`care.ts` = Visit, Vital, DocumentMeta, Question, Target, AlertRule, DoseChange, Chat*, Invite, ActivityEntry). Timestamps become ISO strings on read.

Data model:
- `users/{uid}` (owner-only): fullName, email, phoneNumber, `activePatientId`, `notificationPrefs`; `fcmTokens/{token}`.
- `patients/{pid}`: `ownerUid, displayName, relationship, dateOfBirth, transplantDate, doctorName, hospital` (+ server `notificationState`). **pid = uid** for your own profile, **`${uid}_${12 [a-z0-9]}`** for others (rules reject other pids: no squatting). Created only in one batch with the owner member doc (`createPatient()`); never deleted by clients.
- `patients/{pid}/members/{uid}`: `uid, role, displayName, phone (masked), addedBy, addedAt`.
- Clinical subcollections `labRecords` (embedded `values: LabValue[]`), `medications` (+`doseHistory`), `visits`, `vitals`, `documents`, `questions`, `targets/{testName}`, `alertRules`: viewer read, editor write.
- `activity/{id}` append-only; `chats/{chatId}/messages/{id}` server-written.
- `invites/`, `usage/`, `sharedLinks/`: server-only.
- Storage `patients/{pid}/documents/{docId}/{fileName}`.
- Legacy read-only: `users/{uid}/labRecords|medications`, Storage `lab-pdfs/{uid}/` (copied by `scripts/migrate-to-patients.ts`, core in `scripts/lib/migrate-patients.ts`).

**Rules invariants** (`firestore.rules`, `storage.rules`; tests in `tests/rules/`, update both whenever you add a collection, field or path):
- Clinical writes: `createdBy == auth.uid` on create, immutable after; per-collection **shape checks** (`validLabRecord`, `validVisit`, …) on the full post-write doc, mirroring the writers in `lib/firebase/*.ts`. A new field must be added to the rule or it may be rejected (types/lengths).
- Server-only: `invites`, `usage`, `sharedLinks`, `chats/**` writes, `documents.extraction`, adding non-owner members, `notificationState`.
- Member docs are readable by every member, so `phone` must be masked (`maskPhone()` in `lib/phone.ts`, rule `maskedPhoneOrNull`). Only the owner changes roles (editor↔viewer); the owner doc is immutable; anyone can delete their own doc.
- Activity: `actorUid == auth.uid`, `createdAt == request.time`, keys `hasOnly` fixed list, action in `clientActivityActions()` allow-list (role-change/removal only by owner), `actorName` must equal your member displayName. Server-only actions: member.added/invited/left, invite.revoked. Add new client actions to the allow-list.
- Patient doc updates: only fields in `patientEditable()`.
- Documents are **metadata-first**: `uploadDocument()` writes `patients/{pid}/documents/{docId}` (with `storagePath` = that doc's own folder, contentType, size) THEN the file; storage.rules accept the object only if the metadata exists with that exact path and content type (PDF/JPEG/PNG/WebP/HEIC, < 20 MB, no overwrite). After upload only `kind/title/documentDate/labRecordId` may change.
- **Deploy rules only together with a client that matches them** (and for the migration: indexes → wait → migrate `--dry-run`/`--yes` → rules + client together → re-run migration; see README).

**Server routes** (`app/api/**`, Node runtime). Clients call them with `apiFetch()` (`lib/api/client.ts`, attaches the ID token). Helpers in `lib/server/` (`server-only`): `auth.ts` → `requireUser(req)` (401), `requireMember(req, pid, minRole)` / `requireRole(user, pid, minRole)` (403, reads the member doc with Admin), `HttpError`, `errorResponse`; `firebase-admin.ts` (token verification needs only the project id; Admin Firestore/Storage needs `FIREBASE_SERVICE_ACCOUNT_B64`); `gemini.ts` (`@google/genai`, `GEMINI_MODEL` default gemini-2.5-flash, key must be on a billing-enabled project). Routes: invites (owner create/list/cancel; public summary; pending + redeem require the token phone to match), members/leave, chat (viewer; SSE), documents/extract (editor), pdf/parse (legacy, editor via multipart `pid`), export (viewer), visits/[id]/prep-pdf (viewer), notifications/test + record-added (editor), account/delete, cron/reminders (`Bearer CRON_SECRET`). Never log message text or lab values.

**Quotas** (`lib/server/usage.ts`, docs `usage/{uid}_{YYYYMMDD|YYYYMM}`, IST): chat `CHAT_DAILY_LIMIT` (50 msgs/day) + `CHAT_MONTHLY_TOKENS` (2M); AI extraction `EXTRACT_DAILY_LIMIT` (30/day), reserved only right before a Gemini call. Extraction results are cached per document (`documents.extraction`, `lib/server/pdf/cache.ts`); partial results (quota/AI unavailable) aren't cached.

**Extraction** (`lib/server/pdf/extract.ts`): PDF → `pdf-parse` (pass a `Uint8Array` copy, a Buffer breaks it) → `parseLabText()` (`lib/parsing/metropolis.ts`, patterns anchored to line start, same-line values) + `extractReportDate()` (`lib/parsing/date.ts`, numeric dates always DD/MM/YYYY). Fewer than 3 values, or a photo → Gemini with the original file inline (≤ 14 MB) and a schema limited to `REFERENCE_RANGES` names. The client always reviews before saving.

**Chat** (`lib/server/chat/**`): context builder (CSV of values, meds + dose changes, last 3 visits, open questions, targets, documents, ALERTS; never names), tools `compute_trend`/`get_record`/`get_document`/`propose_doctor_question` (≤ 4 rounds), SSE events `meta/delta/chart/proposal/done/error`, system prompt forbids diagnosis/dose changes and treats document text as untrusted.

**Sign-in** (`lib/firebase/auth.ts` owns all of it): phone OTP primary (invisible `RecaptchaVerifier`, one at a time; `clearRecaptcha()` on retry/unmount; the page mounts `RECAPTCHA_CONTAINER_ID` once) + Google (popup → redirect fallback; `AuthProvider` calls `completeRedirectSignIn()`), `linkGoogle`, `startLinkPhone`/`confirmLinkPhone`, `unlinkProvider` (refuses the last). Always show `friendlyAuthError()`; never auto-merge on `credential-already-in-use`. `ensureUserProfile` runs on every auth change; post-link syncs are fire-and-forget. After link/unlink call `useAuth().refreshUser()`. Phones: `lib/phone.ts` (`normalizeIndianPhone` → E.164, Indian mobiles only). `next.config.js` proxies `/__/auth/*` and `/__/firebase/*` to `<project>.firebaseapp.com` so `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` can be the app's own domain (redirect sign-in in the TWA).

**Lab test vocabulary — keep in sync.** A test is its exact `testName`, which must match across:
1. `REFERENCE_RANGES` in `lib/constants/reference-ranges.ts` (min/max/unit/panel, `higherIsBetter` = single source of direction, `weight` 1–10)
2. `PANELS` in `lib/constants/test-panels.ts` (`CRITICAL_METRICS` = Creatinine, eGFR, Tacrolimus)
3. `METROPOLIS_PATTERNS` in `lib/parsing/metropolis.ts`
4. `lib/personal/sample.ts` seed records if it should appear in demo data

A mismatch silently degrades (neutral score 50, dropped from panels/trends); `tests/consistency.test.ts` checks it.

**Calculations** (`lib/calculations/`, pure, no Firebase; shared by client, chat, notifications, visit PDF):
- `targets.ts` `resolveRange()`: **patient target > range on the report > REFERENCE_RANGES**, used by scoring, trends bands, analysis, alerts, chat, visit prep
- `health-score.ts`: 100 in range, `100 × (1 − d^0.8)` outside; panel weights; empty panel = null
- `alerts.ts` `computeAlerts()`: creatinine > 20% above baseline (critical), K > 6.0 critical / > 5.5 warning, eGFR > 25% below baseline, tacrolimus outside target (5–10 default), outside-target values, custom `alertRules`; baseline = median of up to 3 earlier values (≥ 2)
- `compare.ts` `buildComparison()`: per-test latest · previous · before readings (cells carry their own date/record, since reports are often partial), attention rows, panel groups, stale "Older results"; optional `anchorRecordId` for one report. Rendered by `components/compare/compare-table.tsx` (dashboard, record page, doctor view `/compare`, visit prep)
- `trends.ts`, `deltas.ts`, `analysis.ts` (CKD stage, volatility, age-gap, interactions), `vitals.ts` (BP/fever/weight flags), `medications.ts` (daily-dose parsing, dose-chart eligibility)
- Other pure builders: `lib/visits/prep.ts` (page + PDF), `lib/timeline/build.ts`, `lib/export/`, `lib/server/notifications/schedule.ts`, `lib/server/account-deletion.ts`

**Design system** (ported from vikramrathour.com): tokens in `tailwind.config.js` backed by CSS variables in `app/globals.css` (light + `.dark`, set from prefers-color-scheme by an inline script in `app/layout.tsx`). Colors `canvas vellum recess wash ink ink-2 ink-3 terra terra-dk terra-pale terra-lt sage sage-pale critical critical-pale hair hair-2 hair-hot`; `font-serif` (Newsreader) / `font-sans` (Plus Jakarta Sans); `rounded-btn` 4px, `rounded-card` 6px, `shadow-soft/lift`, `ease-editorial`; classes `.label .eyebrow .num .tlink .glass .pulse-dot .field`. Lab status colors in `components/ui/status.ts`; charts use `useThemeColors()` (SVG attributes can't read CSS vars). Don't use raw Tailwind palette colors.

**Service worker, push, cron.**
- One worker: `app/sw.ts` → `public/sw.js` (gitignored, built by `@serwist/next` in `next build`; off in `next dev` unless `NEXT_PUBLIC_ENABLE_SW_IN_DEV=1`). Never cache `/api/**`, `/__/*`, `/.well-known/*`; Serwist's `apis`/`cross-origin` caches are removed so Firestore/Storage data never reaches Cache Storage.
- `PwaBridge` (in `app/layout.tsx`) registers `/sw.js?<public firebase config>`; `public/firebase-messaging-sw.js` is a self-unregistering stub.
- Push messages are data-only `{title, body, url, tag, kind}`; text must never contain values, test, medicine or doctor names.
- `lib/server/notifications/`: `schedule.ts` (pure), `send.ts` (multicast + token pruning), `reminders.ts` (Admin I/O). Prefs `users/{uid}.notificationPrefs`, bookkeeping `patients/{pid}.notificationState`.
- `vercel.json` cron hits `/api/cron/reminders` at `30 * * * *` UTC (:00 IST); `?mode=daily` for Vercel Hobby. After saving a lab record the client calls `notifyRecordAdded(pid, recordId)`.

**Demo data.** No auto-seeding. With `NEXT_PUBLIC_ENABLE_DEMO=1` the empty dashboard offers editors "Load demo data" (synthetic `SEED_RECORDS` from `lib/personal/sample.ts`).

**Misc.** `@/*` maps to the repo root. `NEXT_DIST_DIR` lets parallel dev servers use separate build dirs (`.next-*/` is gitignored).

## Gotchas

- **OneDrive:** the repo lives in OneDrive; `.next` can break with `readlink` `EINVAL` errors. Delete `.next` (or the `NEXT_DIST_DIR` folder) and restart.
- **`next dev` with `NEXT_DIST_DIR`** rewrites `tsconfig.json` (adds the alternate dir's types to `include`). Revert that change; don't commit it.
- **Emulators on Windows** leave Java processes listening after Ctrl+C or `emulators:exec`; find them with `netstat -ano | findstr :8080` and `taskkill /PID <pid> /F` (`test:rules` cleans its own ports).
- **`*-debug.log`** (firebase-debug.log, firestore-debug.log, …) dump the environment including secrets. They are gitignored; never commit or paste them.
- **Rules and client ship together.** Deploying new rules ahead of the client (or vice versa) breaks writes because of the shape checks and the activity allow-list.
- `.claude/settings.json` hooks block edits to `.env*` and `package-lock.json` and run `tsc --noEmit` after TS edits.

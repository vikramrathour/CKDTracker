# CKD Tracker

A mobile-first progressive web app (and Android app, via a Trusted Web Activity) for kidney-transplant patients and the family, caregivers and doctors who help them. It keeps lab reports in one place, charts how the important markers change, flags values that drift, and helps doctor visits run smoothly: visit prep, questions for the doctor, a document vault, and a chat that answers questions about the reports.

Each account can track **several people** (your own profile and anyone you care for). Every profile, a *patient*, has its own **care circle** with owner, editor and viewer roles; people join through invite links shared on WhatsApp and sign in with their own phone number. Most reports come from Metropolis Healthcare (India), and the offline PDF parser is tuned for that format; other labs, scans and photos go through Gemini.

> **Medical data.** This app stores personal health information and the repo is **public**. Never commit real lab reports (`reports/` is gitignored), real patient data (`lib/personal/local.ts` is gitignored) or secrets. Use synthetic or redacted data for fixtures, screenshots and issues. The app supports tracking only. It is not a diagnostic tool and the chat is not medical advice.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Commands and tests](#commands-and-tests)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Security model](#security-model)
- [Feature notes](#feature-notes): [sign-in](#sign-in) · [care circle](#care-circle) · [labs, parsing and scoring](#labs-parsing-and-scoring) · [medications, targets, vitals](#medications-targets-and-vitals) · [chat and alerts](#chat-with-your-reports-and-alerts) · [visits, questions, documents, export](#visits-questions-documents-timeline-and-export) · [notifications](#notifications) · [offline](#offline) · [privacy and deletion](#privacy-and-account-deletion)
- [Deployment](#deployment)
- [Android app (Play Store)](#android-app-play-store)
- [Project structure](#project-structure)
- [Implementation status](#implementation-status)
- [Technology review and alternatives](#technology-review-and-alternatives)
- [Costs](#costs)
- [Working with Claude Code](#working-with-claude-code)

A hands-on local test plan and the production go-live checklist are in [`docs/TESTING-GUIDE.md`](docs/TESTING-GUIDE.md).

---

## Features

Bottom tabs: **Home · Records · Chat · Visits · More**. Everything else is reached from **More** (`components/layout/more-routes.ts`).

| Area | Routes | What it does |
|---|---|---|
| Sign-in | `/login` | Phone OTP (primary) or Google; both can be linked to one account |
| Onboarding | `/onboarding` | First run or "Add someone": shows pending invites first, then create a profile for yourself or someone you care for |
| Home | `/dashboard` | Health score ring, per-system scores, alerts banner, critical-metric cards (Creatinine, eGFR, Tacrolimus) with sparklines and change since the last report, panel overview, quick vitals entry |
| Records | `/records`, `/records/new`, `/records/{id}`, `/upload`, `/records/print` | Report list; manual entry by panel; view/edit/delete a report; upload a PDF or photo (stored in the vault, then extracted and reviewed); printable full history |
| Trends, Analysis | `/trends`, `/analysis` | Charts with the reference or target band; CKD stage, volatility, times out of range, eGFR vs age-expected, medication–lab interaction flags |
| Medications | `/medications`, `/medications/new`, `/medications/{id}`, `/medications/{id}/edit` | Current and stopped medicines, dose history, tacrolimus trough level vs dose chart |
| Targets | `/targets` | Per-test ranges set by the doctor; they override report and default ranges everywhere |
| Vitals | `/vitals` | BP, pulse, weight, temperature, glucose, urine output, with simple flags |
| Chat | `/chat` | Ask questions about the reports (Gemini), with citations, inline trend charts and "add to doctor's questions" |
| Visits | `/visits`, `/visits/new`, `/visits/{id}`, `/visits/{id}/edit`, `/visits/{id}/prep` | Appointments, visit prep summary, doctor mode, A4 PDF |
| Questions | `/questions` | Questions for the doctor: open → asked → answered |
| Documents | `/documents`, `/documents/{id}` | Vault for reports, prescriptions, discharge summaries, imaging; AI value extraction |
| Timeline | `/timeline` | Reports, visits, dose changes, documents and answered questions in one feed |
| Care circle | `/care-circle`, `/invite/{id}` | Members and roles, WhatsApp invites, recent activity |
| Settings | `/settings` | Linked sign-in methods, notifications, CSV/JSON export, printable report, privacy/terms, delete account |
| Public | `/privacy`, `/terms`, `/~offline`, `/.well-known/assetlinks.json` | Legal pages, offline fallback, Android Digital Asset Links |

Panels tracked: **Hemogram, Kidney Function, Tacrolimus, Electrolytes, Lipid Profile, Urine Routine**. When you belong to more than one profile, the header shows whose data you are looking at and lets you switch. Viewers see everything but get no add, edit, upload or delete controls.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15.5 (App Router), React 19, TypeScript (strict). Node 22+ |
| Styling | Tailwind CSS 3 with a design system ported from vikramrathour.com (Newsreader + Plus Jakarta Sans, warm paper / ink / terracotta palette, light and dark), `lucide-react`, in-house UI kit in `components/ui/` |
| Forms | `react-hook-form` + `zod` |
| Charts | Recharts |
| Auth | Firebase Authentication: phone OTP + Google, linkable |
| Database | Cloud Firestore (Firebase JS SDK 13, modular) with a persistent offline cache |
| Files | Firebase Storage (document vault) |
| Server | Next.js route handlers (Node runtime) using `firebase-admin` 14 |
| AI | Google Gemini via `@google/genai` (default `gemini-2.5-flash`, paid project only): report extraction and chat |
| PDF | `pdf-parse` (text extraction), `@react-pdf/renderer` (visit-prep PDF) |
| Push / offline | Firebase Cloud Messaging; `serwist` / `@serwist/next` service worker |
| Scheduling | Vercel Cron (`vercel.json`) |
| Tests | Vitest; `@firebase/rules-unit-testing` against the Firebase emulators |
| Android | Trusted Web Activity built with Bubblewrap ([`twa/README.md`](twa/README.md)) |

---

## Getting started

### Prerequisites

- **Node.js 22+** (required by `firebase-admin` 14)
- **Java JDK** (21+ for current `firebase-tools`) for the emulators and `npm run test:rules`
- A Firebase project with Authentication (Phone + Google), Firestore and Storage. Phone auth with real SMS needs the **Blaze** plan; emulators need nothing
- A Gemini API key on a **billing-enabled** Google Cloud project (only for AI extraction and chat)

### Install and configure

```bash
npm install
cp .env.example .env.local
```

| Variable | Purpose | Needed for |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID` | Firebase web config (console → Project settings → Your apps). Public by design. For production/TWA set `_AUTH_DOMAIN` to the app's own domain (see [Sign-in](#sign-in)) | Always |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Web Push public key (Project settings → Cloud Messaging → Web Push certificates) | Push |
| `FIREBASE_SERVICE_ACCOUNT_B64` | Base64 of a service-account JSON. Server-only. Without it the server can verify ID tokens but **every Admin Firestore/Storage call fails** (invites, chat, extraction, export, visit PDF, notifications, account deletion, scripts) | Production |
| `GEMINI_API_KEY` | Gemini key on a paid project (free-tier traffic may be used for training) | AI extraction, chat |
| `GEMINI_MODEL` | Default `gemini-2.5-flash` | Optional |
| `CHAT_DAILY_LIMIT` / `CHAT_MONTHLY_TOKENS` | Chat caps per user: messages/day (50), tokens/month (2,000,000) | Optional |
| `EXTRACT_DAILY_LIMIT` | AI report extractions per user per day (30); the regex parser is free | Optional |
| `FIREBASE_STORAGE_BUCKET` | Server-side bucket override (defaults to the public bucket, then `<project>.appspot.com`) | Optional |
| `CRON_SECRET` | Bearer secret for `/api/cron/reminders` (`openssl rand -hex 32`) | Reminders |
| `NEXT_PUBLIC_APP_URL` | Public origin used in invite links and metadata | Production |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Contact on `/privacy` and `/terms` (placeholder otherwise) | Production |
| `ANDROID_PACKAGE_NAME`, `ANDROID_SHA256_FINGERPRINTS` | Build `/.well-known/assetlinks.json` (comma-separated SHA-256: upload key **and** Play signing key) | TWA |
| `NEXT_PUBLIC_APPCHECK_SITE_KEY`, `NEXT_PUBLIC_APPCHECK_DEBUG` | Optional App Check (reCAPTCHA Enterprise); debug token locally | Optional |
| `NEXT_PUBLIC_ENABLE_DEMO` | `1` shows "Load demo data" (synthetic records) on an empty dashboard for editors | Optional |
| `NEXT_PUBLIC_USE_EMULATORS` | `1` connects the client to the local Auth/Firestore/Storage emulators | Local |
| `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST` | Point the Admin SDK (server routes, scripts) at the emulators | Local |
| `NEXT_PUBLIC_ENABLE_SW_IN_DEV` | `1` enables the service worker in `next dev` (needed to test push locally) | Optional |
| `NEXT_DIST_DIR` | Alternative build dir so several dev servers can share a checkout | Optional |

If `NEXT_PUBLIC_FIREBASE_API_KEY` is empty, Firebase silently skips initialisation (`auth`/`db` are `undefined`) and the app stays on the loading/login screen.

### Emulator quick start

No Firebase project, SMS or billing needed; Gemini still needs a real key if you want to try chat/extraction.

```bash
# terminal 1: Auth 9099, Firestore 8080, Storage 9199, UI http://127.0.0.1:4000
npx firebase-tools emulators:start --project demo-ckd
```

In `.env.local` set `NEXT_PUBLIC_USE_EMULATORS=1`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-ckd`, any non-empty API key, the three `*_EMULATOR_HOST` values from `.env.example`, and leave `FIREBASE_SERVICE_ACCOUNT_B64` empty (so the server uses the same `demo-ckd` project). Then:

```bash
npm run dev    # terminal 2, http://localhost:3000
```

No SMS is sent: read OTP codes from the emulator terminal output or `http://127.0.0.1:9099/emulator/v1/projects/demo-ckd/verificationCodes`. The full step-by-step is in [`docs/TESTING-GUIDE.md`](docs/TESTING-GUIDE.md).

### Against a real project

```bash
npx firebase-tools login
npx firebase-tools use <project-id>    # .firebaserc pins the default
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
npm run dev
```

Storage rules read membership from Firestore, so the first deploy asks to grant the Storage service agent access to Firestore: accept. The `members.uid` collection-group index takes a few minutes to build; until then the app can't list profiles. If the project still has pre-Phase-2 data, follow the [deploy order](#deploy-order-for-the-patients-migration) instead.

A new account starts at onboarding. Create a profile, then upload a report or add one by hand; with `NEXT_PUBLIC_ENABLE_DEMO=1` you can load the synthetic records from `lib/personal/sample.ts` instead.

---

## Commands and tests

```bash
npm run dev          # dev server on :3000
npm run build        # production build (full type-check; also builds public/sw.js)
npm run start        # serve the production build
npm run lint         # next lint
npx tsc --noEmit     # fast type-check

npm test                                      # Vitest unit suites (tests/*.test.ts), synthetic data only
npx vitest run tests/date.test.ts -t "DD/MM"  # one file / one test
npm run test:rules                            # rules + invites + usage + migration suites on the emulators (needs Java)
RUN_LIVE_GEMINI=1 npx vitest run tests/chat-live.test.ts   # opt-in live Gemini smoke test (synthetic data)

npx firebase-tools emulators:start --project demo-ckd       # local emulators (firebase.json)
npx tsx scripts/migrate-to-patients.ts --dry-run             # legacy → patients migration (Admin)
npx tsx scripts/seed-owner.ts <uid> --dry-run                # import local.ts meds/doctor (Admin)
```

Unit tests cover the parsers (Metropolis regex, DD/MM dates), scoring, trends, deltas, analysis, alerts, targets, vitals, medications (dose parsing), chat (context snapshot, SSE protocol, tools, usage caps, citations), invites, documents (paths, extraction cache), visit prep, timeline, export, notifications scheduling, account-deletion planning, phone parsing, and a consistency check across `REFERENCE_RANGES`, `PANELS`, parser patterns and sample data. `npm test` excludes `tests/rules/**`.

`npm run test:rules` (`scripts/test-rules.mjs`) runs `firebase-tools emulators:exec --config firebase.test.json` on dedicated ports (Firestore 8181, Storage 9299), so it works next to a running dev emulator, and kills leftover emulator JVMs on those ports (Windows leaks them).

---

## Architecture

```
┌──────────────────────────────── Browser (PWA / TWA) ─────────────────────────────────┐
│ app/(auth)/login ──► AuthProvider (onAuthStateChanged, redirect sign-in completion)  │
│                                                                                      │
│ app/(app)/* ─► AppShell: auth gate (→ /login)                                        │
│                 └─ PatientProvider: memberships, active pid, role, realtime records  │
│                     ├─ PendingInviteRedeemer (finishes /invite/{id} → login flow)    │
│                     └─ PatientGate: spinner / retry / → /onboarding / BottomNav      │
│                                                                                      │
│ pages ─► lib/firebase/* ─────────────────► Firestore + Storage  (rules = access ctl) │
│       ─► lib/calculations/* (pure: score, trends, alerts, targets, vitals, …)        │
│       ─► apiFetch() (Bearer ID token) ──┐                                            │
│ sw.js (serwist): app shell cache + FCM  │                                            │
└─────────────────────────────────────────┼────────────────────────────────────────────┘
                                          ▼
   app/api/** (Node runtime) ── requireUser / requireMember(pid, role) ── firebase-admin
     invites, members/leave, chat (SSE, Gemini + tools), documents/extract, pdf/parse,
     export, visits/{id}/prep-pdf, notifications/*, account/delete
   app/api/cron/reminders  ◄── Vercel Cron (Bearer CRON_SECRET) ──► FCM
```

- **Client-side data access.** There is no middleware and no server session. Pages are client components that read and write Firestore/Storage directly with the user's credentials, so **`firestore.rules` and `storage.rules` are the real access control**. The AppShell redirect only affects UX.
- **Server routes** handle what clients must not do themselves: anything touching server-only collections (`invites`, `usage`, chat threads, the extraction cache), cross-member actions, AI calls with secrets, push sending, and account deletion. Each route verifies the Firebase ID token and, where a patient is involved, the caller's role.
- **Pure calculations** live in `lib/calculations/` with no Firebase imports, so they are unit-tested directly and shared by the client and the server (the chat context, notifications and visit PDF reuse them).
- **Path alias:** `@/*` → repo root.

---

## Data model

```
users/{uid}                          fullName, email, phoneNumber, activePatientId, notificationPrefs, migratedAt
  fcmTokens/{token}                  token, platform, userAgent, createdAt, lastSeenAt
patients/{pid}                       ownerUid, displayName, relationship (self|family|other),
                                     dateOfBirth, transplantDate (YYYY-MM-DD), doctorName, hospital,
                                     notificationState (server), nextLabDate (read by reminders)
  members/{uid}                      uid, role (owner|editor|viewer), displayName, phone (masked), addedBy, addedAt
  labRecords/{id}                    recordDate (Timestamp), labName, doctorName, notes, pdfPath,
                                     sourceDocumentId, values: LabValue[], createdBy, createdAt, updatedAt
  medications/{id}                   name, dose, frequency, category, timeOfDay[], prescribedBy, startDate,
    doseHistory/{id}                 isActive, stoppedAt, stopReason, notes, createdBy
                                     dose, frequency, previousDose/Frequency, effectiveDate, reason, changedByName
  visits | vitals | questions | targets/{testName} | alertRules
  documents/{docId}                  kind, title, fileName, storagePath, contentType, size, documentDate,
                                     labRecordId, source, extraction (server cache), createdBy
  activity/{id}                      append-only audit (names and short summaries, never values)
  chats/{chatId}/messages/{id}       written by /api/chat, readable only by the thread creator
invites/{id}  usage/{id}  sharedLinks/{id}      server-only (closed to clients)

Storage: patients/{pid}/documents/{docId}/{fileName}

Legacy, read-only until the cleanup release:
users/{uid}/labRecords  users/{uid}/medications  lab-pdfs/{uid}/{timestamp}-{file}
```

- **Patient ids.** Your own profile is `pid = uid`; a profile for someone you care for is `${uid}_${12 random [a-z0-9]}`. The rules refuse any other id, so nobody can claim a pid before its user signs up. A patient is created in one batch with its owner member doc and is never deleted from the client.
- **Listing profiles** is a collection-group query on `members` where `uid == me`, backed by the field override in `firestore.indexes.json`. The active profile is `users/{uid}.activePatientId`.
- **Lab values are embedded** in the record (`values: LabValue[]`), one read per report. Timestamps are converted to ISO strings in `lib/firebase/*`, so app code only sees strings.
- **Shared types** are in `lib/types/` (`lab-record`, `medication`, `patient`, `member`, `care.ts` for visits, vitals, documents, questions, targets, alert rules, dose changes, chats, invites, activity).

```ts
interface LabValue {
  testName: string          // must match REFERENCE_RANGES keys exactly
  panel: 'hemogram' | 'kidney' | 'tacrolimus' | 'electrolytes' | 'lipid' | 'urine'
  value: number
  unit: string
  referenceMin?: number     // range printed on this report (overrides the default)
  referenceMax?: number
  isAbnormal: boolean
}
```

---

## Security model

### Firestore and Storage rules

Rules live in `firestore.rules` and `storage.rules` and are tested in `tests/rules/` (`npm run test:rules`). **Update both whenever you add a collection, field or storage path.**

| Path | Read | Write |
|---|---|---|
| `users/{uid}`, `fcmTokens` | self | self |
| `members` (collection group) | only your own membership docs | — |
| `patients/{pid}` | members | create: own pid namespace, `ownerUid == me`, in the same batch as an owner member doc; update: editors, only profile fields; delete: never |
| `patients/{pid}/members/{uid}` | members | create: owner bootstrap only (others are added by the server on invite redemption); update: owner switches others between editor and viewer; delete: yourself (leave) or the owner, never the owner doc. `phone` must be masked |
| clinical collections (`labRecords`, `medications`(+`doseHistory`), `visits`, `vitals`, `documents`, `questions`, `targets`, `alertRules`) | viewers+ | editors+; `createdBy == me` on create and immutable; field **shape checks** per collection on the full post-write doc |
| `documents/{docId}` | viewers+ | `storagePath` must be this doc's own folder; allowed types PDF/JPEG/PNG/WebP/HEIC, < 20 MB; after upload only `kind/title/documentDate/labRecordId` change; `extraction` is server-only |
| `activity/{id}` | viewers+ | editors+ append only: allow-listed actions, `actorUid == me`, `createdAt == request.time`, `actorName` = your member display name; role-change/removal entries only by the owner; never update/delete |
| `chats/**` | thread creator (still a member) | server only |
| `invites`, `usage`, `sharedLinks` | — | server only |
| legacy `users/{uid}/labRecords|medications` | self | — |
| Storage `patients/{pid}/documents/{docId}/{file}` | members | editors create only when the Firestore metadata doc already exists with this exact path and content type (**metadata-first**), < 20 MB, exact MIME, no overwrite; editors delete |
| Storage legacy `lab-pdfs/{uid}/**` | self | — |

### Server routes

All routes run on the Node runtime and return `{ error }` JSON via `errorResponse()`. Clients call them with `apiFetch()` (`lib/api/client.ts`), which attaches the ID token.

| Route | Auth | Notes |
|---|---|---|
| `POST /api/invites`, `GET /api/invites?pid=` | owner | create/refresh invite (7-day expiry), list pending |
| `DELETE /api/invites/{id}` | owner of the invite's patient | cancel |
| `GET /api/invites/{id}/summary` | public | first names + role only |
| `GET /api/invites/pending`, `POST /api/invites/redeem` | signed in | redeem requires the token's phone to equal the invited number |
| `POST /api/members/leave` | viewer+ | logs the departure server-side |
| `POST /api/chat`, `DELETE /api/chat/{chatId}?pid=` | viewer+ (delete: thread creator) | SSE; chat caps |
| `POST /api/documents/extract` | editor+ | cached per document; AI quota |
| `POST /api/pdf/parse` | editor+ (multipart `pid`) | legacy PDF-only fallback, ≤ 10 MB, `%PDF-` checked; AI quota |
| `GET /api/export?pid=&format=csv|json` | viewer+ | formula-injection safe CSV |
| `GET|POST /api/visits/{id}/prep-pdf?pid=` | viewer+ | A4 visit summary |
| `POST /api/notifications/test` | signed in | test push to your devices |
| `POST /api/notifications/record-added` | editor+ | idempotent per record |
| `POST /api/account/delete` | signed in | 409 if you own a profile others still use |
| `GET /api/cron/reminders` | `Bearer CRON_SECRET` | hourly reminders/alerts |
| `GET /.well-known/assetlinks.json` | public | TWA asset links |

Helpers in `lib/server/auth.ts`: `requireUser(req)` (401), `requireMember(req, pid, minRole)` and `requireRole(user, pid, minRole)` (403), `HttpError`, `errorResponse`.

### Quotas and cost controls

Usage counters are server-only docs `usage/{uid}_{YYYYMMDD}` and `usage/{uid}_{YYYYMM}` (India time):

- **Chat:** `CHAT_DAILY_LIMIT` messages/day (default 50) and `CHAT_MONTHLY_TOKENS` tokens/month (default 2,000,000). Past either cap the API returns 429 with a friendly message. Tokens are recorded even when a call fails part-way; only a call that consumed nothing gives the message back.
- **AI extraction:** `EXTRACT_DAILY_LIMIT` per day (default 30), counted only right before a Gemini call. The regex path is free, and each document caches its extraction result so repeats don't call Gemini again.

### Other

- Secrets: `.env*` is gitignored; `GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_B64` and `CRON_SECRET` are secret. `*-debug.log` (firebase-tools logs dump the environment) and service-account JSON names are gitignored.
- The server never logs chat text or lab values. Notification text never contains values, test or medicine names.
- `sharedLinks` stays closed (the old client-side token scan was removed). A shared doctor view would need a token-keyed `get` or a server route.

---

## Feature notes

### Sign-in

Phone OTP is primary, Google is a fallback, and both can be linked to one account in **Settings → Sign-in methods**. All auth code lives in `lib/firebase/auth.ts` (invisible reCAPTCHA, `sendOtp`/`verifyOtp`, Google popup with redirect fallback, `linkGoogle`, `startLinkPhone`/`confirmLinkPhone`, `unlinkProvider` which refuses the last provider, `friendlyAuthError`). UI: `app/(auth)/login/page.tsx`, `components/auth/otp.tsx`, `components/settings/linked-accounts.tsx`. Numbers are normalised to E.164 by `lib/phone.ts` (Indian mobiles only).

- **Existing Google users: link, don't start over.** Signing in with an unlinked phone number creates a new, empty account. Sign in with Google, then add the phone in Settings. Accounts are never merged automatically; a credential that belongs to another account is refused.
- **Auth domain for redirects / TWA.** `next.config.js` proxies `/__/auth/*` and `/__/firebase/*` to `<project-id>.firebaseapp.com`. In production set `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` to the app's own domain and add `https://<domain>/__/auth/handler` to the OAuth client's authorized redirect URIs (Google Cloud → APIs & Services → Credentials), so redirect sign-in stays first-party under storage partitioning and inside the TWA. Leave the default locally.
- **Console setup** (Blaze + budget, Phone provider, India-only SMS region, test numbers, authorized domains): see the go-live checklist in [`docs/TESTING-GUIDE.md`](docs/TESTING-GUIDE.md#production-go-live-checklist).
- Account profiles (`users/{uid}`) are created idempotently by `ensureUserProfile()` on every auth state change, which also mirrors email/phone.

### Care circle

Each person signs in with their own number; nobody shares a login.

| Role | Can |
|---|---|
| Owner | Everything, including inviting, changing roles and removing people. One per profile; can't leave or be removed |
| Editor | Read, chat, and add/edit reports, medications, visits, vitals, documents, questions, targets |
| Viewer | Read and chat. Read-only |

1. The owner opens **Care circle**, enters a mobile number, optional name and role, and taps *Create invite link*. `POST /api/invites` stores `invites/{id}` (7-day expiry); inviting the same number again refreshes the pending invite and keeps the link.
2. The owner shares `https://<app>/invite/{id}` with **Share on WhatsApp** (a `wa.me` link to that number, no SMS cost), *Copy link* or the share sheet.
3. The landing page shows only first names and the role. *Sign in to accept* stores the invite id for the tab and goes to `/login`; after sign-in `PendingInviteRedeemer` redeems it and opens that profile.
4. `POST /api/invites/redeem` is a transaction: the signed-in phone must equal the invited number and the invite must be pending and unexpired; it creates the member doc (masked phone) and marks the invite accepted. A different number gets a masked hint; cancelled or expired invites get 410.
5. Invitees who never open the link still see invites on onboarding (`GET /api/invites/pending`).

Google-only accounts have no phone number in their token, so they must link the invited number first. The owner can change roles and remove people (rules), list/re-share/cancel invites; others can leave (`POST /api/members/leave`). Joins, invites, role changes, removals and data edits are written to `activity` and shown as *Recent activity* (latest 50).

### Labs, parsing and scoring

**Vocabulary.** A test is identified by its exact `testName`, which must match in `REFERENCE_RANGES` (`lib/constants/reference-ranges.ts`), `PANELS` (`lib/constants/test-panels.ts`), `METROPOLIS_PATTERNS` (`lib/parsing/metropolis.ts`) and the sample data (`lib/personal/sample.ts`). A mismatch fails silently (unknown tests score a neutral 50 and drop out of panels and trends); `tests/consistency.test.ts` guards it.

**Extraction** (`lib/server/pdf/extract.ts`, shared by `/api/documents/extract` and `/api/pdf/parse`):

1. PDFs go through `pdf-parse` (given a plain `Uint8Array` copy; a Node `Buffer` makes its bundled pdf.js fail) and `parseLabText()`: patterns anchored to line start, value read from the same line. Report dates come from `lib/parsing/date.ts` (numeric dates are always DD/MM/YYYY; priority Collection > Sample > Registration > Report).
2. Fewer than 3 values (other labs, scans) or a photo → Gemini with the **original file** as inline data (≤ 14 MB) and a response schema that only allows `REFERENCE_RANGES` names. Without `GEMINI_API_KEY`, PDFs use regex only and photos can't be read.
3. The user reviews every value before saving.

**Scoring** (`lib/calculations/health-score.ts`). A value in range scores 100; outside it falls as `100 × (1 − d^0.8)` with `d` the deviation as a fraction of the range width (capped at 1). The range is resolved by `resolveRange()`: **doctor target > range printed on the report > `REFERENCE_RANGES` default**. Panels are weighted averages by `weight`; the overall score weights kidney ×3, tacrolimus ×3, electrolytes ×2, hemogram ×2, lipid ×1 (urine not scored); an empty panel is `null` and excluded.

**Analysis** (`lib/calculations/`): `trends.ts` (linear regression, direction from `higherIsBetter`), `deltas.ts` (change vs previous record), `analysis.ts` (KDIGO stage from eGFR, SD/CV volatility, times out of range, eGFR vs age-expected, medication–lab interaction flags). These are tracking heuristics, not clinically validated.

### Medications, targets and vitals

- **Medications.** Add, edit, stop and restart (editors+). Stopping keeps the doc (`isActive: false`, `stoppedAt`). Every new medication and every dose/frequency change writes a `doseHistory` entry in the same batch. For tacrolimus and other immunosuppressants the detail page charts **trough level vs dose**: levels with the target band and markers at dose changes, above a daily-dose step line. Daily dose is parsed from free text (`1 mg` × `Twice daily` = 2 mg/day; `1-0-0.5` = 1.5 mg/day; `lib/calculations/medications.ts`).
- **Targets** (`patients/{pid}/targets/{testName}`: `min`/`max`, either blank for "at least"/"at most"). Used by scoring, Trends bands (*Your target*), Analysis, alerts, the chat context and visit prep.
- **Vitals.** Any subset per reading with plausible-range validation, grouped by day, one chart per vital. Flags (`lib/calculations/vitals.ts`): BP ≥ 140/90 warning, ≥ 180/120 critical; temperature ≥ 38 °C warning; weight change > 2 kg within 3 days warning. They prompt contacting the transplant team; they are not a diagnosis.

### Chat with your reports and alerts

`/chat` is open to every member. Answers stream in, cite reports as date links (`[2026-09-28]` → the record), can show a small trend chart, and may propose a question for the doctor that editors can save with one tap (nothing is written without it).

`POST /api/chat {pid, chatId?, message}` checks membership and the caps, then builds a compact context with the Admin SDK (`lib/server/chat/context.ts`): one CSV row per lab value (`recordId,date,test,value,unit,refMin,refMax,target`), active medications with recent dose changes, the last 3 visits, open questions, targets, a document list, age and transplant date (never names), and an **ALERTS** block. The model can call, for at most 4 rounds (`lib/server/chat/tools.ts`):

| Tool | What it does |
|---|---|
| `compute_trend(testName, from?, to?)` | Trend stats from `trends.ts` (no model arithmetic); also sends the chart |
| `get_record(recordId)` | One report in full |
| `get_document(documentId)` | Attaches the original PDF/photo from Storage |
| `propose_doctor_question(text)` | Returns a proposal only |

The reply is `text/event-stream` with `meta`, `delta`, `chart`, `proposal`, `done` and `error` events. The system prompt (`lib/server/chat/system-prompt.ts`) forbids diagnosis and dose changes, defers to the transplant team, raises ALERTS first ("Please contact your transplant team today" for critical ones), says when data is missing, and treats report/document text as untrusted. Every screen shows "Not medical advice — confirm with your transplant team."

**Alerts** (`lib/calculations/alerts.ts`) are computed in code, never by the model, from the latest value of each test; baseline = median of up to 3 earlier values (at least 2 needed):

| Rule | Severity |
|---|---|
| Creatinine > 20% above baseline | critical |
| Potassium > 6.0 / > 5.5 | critical / warning |
| eGFR > 25% below baseline | warning |
| Tacrolimus outside the patient's target (5–10 without one) | warning |
| Any value outside its patient target | warning |
| Custom `alertRules` (`above`, `below`, `change-pct`, `outside-target`) | warning |

They feed the dashboard `AlertsBanner` (tap → `/chat?q=…`, sent only when you tap send), the chat context, visit prep and critical-alert push notifications.

### Visits, questions, documents, timeline and export

- **Visits:** date/time, doctor, hospital, purpose, notes, advice, dose changes, next visit date, linked reports and questions.
- **Visit prep** (`/visits/{id}/prep`): new reports since the previous visit, per-test change with trend arrows, out-of-range values (against targets), alerts as of the visit date, active medications and open questions. **Doctor mode** shows it full-screen in large type; **PDF** (`/api/visits/{id}/prep-pdf`) builds an A4 summary to download or share. Page and PDF share `buildVisitPrep()` (`lib/visits/prep.ts`).
- **Questions:** open → asked → answered (answer recorded against a visit); chat-sourced ones carry a badge.
- **Document vault:** PDFs and camera photos (< 20 MB). Upload is **metadata-first** (`uploadDocument()` writes the Firestore doc, then the file; on failure the doc is removed). **Extract values** (editors) reads the stored file server-side, runs the extraction above, caches the result on the document (`extraction`; `force` re-reads), and after review saves a record linked both ways (`sourceDocumentId`/`pdfPath` ↔ `labRecordId`). `/upload` uses the same flow and falls back to `/api/pdf/parse` (values only) if the vault upload fails.
- **Records:** `/records/{id}` shows values by panel, notes and the source document; editors can change values, date, lab and notes, or delete.
- **Timeline:** everything in one feed with filter chips, six months at a time.
- **Export:** `GET /api/export?format=csv` (one row per value; formula characters neutralised) or `format=json` (profile, records, medications with dose history, visits, questions, targets, vitals, document metadata; no files). `/records/print` is a printable history with both buttons.

### Notifications

FCM web push through the app's single service worker (`app/sw.ts` → `/sw.js`).

- **Devices:** Settings → Notifications → *Turn on for this device* stores `users/{uid}/fcmTokens/{token}`; refreshed on app start, removed on *Turn off here* and on sign-out; the server prunes rejected tokens and tokens unseen for 60 days. *Send a test* calls `/api/notifications/test`.
- **Preferences** (`users/{uid}.notificationPrefs`, `lib/notifications/prefs.ts`): lab, visit, medication (opt-in), alerts, care-circle updates, quiet hours (IST). During quiet hours reminders are skipped and alerts wait.
- **Schedule** (`lib/server/notifications/schedule.ts`, pure and tested): visit tomorrow at 18:00 IST (with open-question count); lab due tomorrow at 18:00 IST when `patients/{pid}.nextLabDate` is tomorrow; medication reminders at 08/14/19/22 IST by `timeOfDay`; a critical alert on the latest record (≤ 14 days old) once per member per record; "new report added" to the rest of the circle via `notifyRecordAdded()` → `/api/notifications/record-added`.
- **Cron:** `vercel.json` runs `GET /api/cron/reminders` at `30 * * * *` UTC (:00 IST) with `Authorization: Bearer $CRON_SECRET`. Each slot runs once per IST day (`patients/{pid}.notificationState`), so retries don't double-send. **Vercel Hobby only allows daily crons:** use `"30 12 * * *"` with `/api/cron/reminders?mode=daily` (digest + alerts, no medication reminders), or Pro / an external scheduler for hourly.
- **Privacy:** messages are data-only `{title, body, url, tag, kind}` and never contain values, test, medicine or doctor names.
- **iPhone:** web push only after Add to Home Screen (iOS 16.4+).
- **Local:** the worker is off in `next dev`; set `NEXT_PUBLIC_ENABLE_SW_IN_DEV=1` or use `npm run build && npm start`. Trigger the cron by hand with `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reminders`. Push needs a real Firebase project (FCM isn't emulated).

### Offline

- **App shell.** `@serwist/next` builds `app/sw.ts` into `public/sw.js` (gitignored) during `next build`. It precaches static assets, icons and `/~offline`; pages are NetworkFirst, Google Fonts CacheFirst. `/api/**`, `/__/*` and `/.well-known/*` are never cached, and Serwist's default `apis`/`cross-origin` caches are removed so Firestore/Storage data never reaches Cache Storage.
- **Registration.** `components/notifications/pwa-bridge.tsx` registers `/sw.js?apiKey=…&projectId=…&messagingSenderId=…&appId=…` (public values for FCM). `public/firebase-messaging-sw.js` is a stub that unregisters itself.
- **Data.** Firestore uses `persistentLocalCache` with a multi-tab manager (memory fallback). Seen records stay readable without signal and edits queue. Sign-out deletes the device token, clears the cache (`clearOfflineData()`) and reloads `/login`.
- `<OfflineIndicator />` shows "Offline: showing saved data".

### Privacy and account deletion

- `/privacy` and `/terms` (public, linked from Settings) cover what is stored where, Gemini on a paid project, care-circle sharing, offline copies, lock-screen-safe notifications, DPDP rights and that the app isn't medical advice. Set `NEXT_PUBLIC_SUPPORT_EMAIL` before publishing.
- **Delete my account** (typed `DELETE`) → `POST /api/account/delete`, planned by `lib/server/account-deletion.ts`: leave circles where you're editor/viewer (your chats there are deleted); delete profiles you own alone (whole `patients/{pid}` subtree, Storage files, invites); **refuse with 409** if you own a profile others still use (no ownership transfer yet). Then delete your invites, usage counters, `users/{uid}`, legacy `lab-pdfs/{uid}/` and finally the Auth user.

---

## Deployment

The app is a standard Next.js app. **Vercel** is the simplest host: import the repo, add the env vars, deploy. All API routes need the Node runtime. On Vercel Hobby, change the cron to daily (see [Notifications](#notifications)); Hobby is also non-commercial only.

After deploying:

1. Add the production domain to Firebase Auth → **Authorized domains**, and set `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` + the OAuth redirect URI as described under [Sign-in](#sign-in).
2. Set `FIREBASE_SERVICE_ACCOUNT_B64`, `GEMINI_API_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`.
3. Deploy rules and indexes whenever they change: `npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage`. **Deploy rules only together with the client that matches them.**

### Deploy order for the patients migration

Before Phase 2, data lived under `users/{uid}/…` and `lab-pdfs/{uid}/…`. `scripts/migrate-to-patients.ts` (Admin SDK; core in `scripts/lib/migrate-patients.ts`, tested in `tests/rules/migration.test.ts`) copies each user with lab records or medications into `patients/{uid}`: patient doc, owner membership, records and medications with the **same ids** plus `createdBy`, stored PDFs into the vault with metadata and rewritten `pdfPath`, then `activePatientId`. It only writes what is missing (safe to re-run), never deletes legacy data, and prints counts only.

```bash
npx tsx scripts/migrate-to-patients.ts --dry-run               # plan, all users
npx tsx scripts/migrate-to-patients.ts --uid <uid> --dry-run
npx tsx scripts/migrate-to-patients.ts --yes                   # write (real projects need --yes)
# options: --skip-storage, --bucket <name>; uses FIREBASE_SERVICE_ACCOUNT_B64 (or
# GOOGLE_APPLICATION_CREDENTIALS), or the emulators when FIRESTORE_EMULATOR_HOST is set
```

The new client only works with the new rules, and the old client can only read under them:

1. `npx firebase-tools deploy --only firestore:indexes` and **wait** until the `members` index is built.
2. Run the migration with `--dry-run`, then `--yes`. Check every user reports `verified OK`.
3. Deploy the rules (`--only firestore:rules,storage`) **and** ship the new client together.
4. Run the migration again to pick up anything the old client wrote in between.
5. Optionally import your medications/doctor from `lib/personal/local.ts`: `npx tsx scripts/seed-owner.ts <uid> --dry-run`, then without `--dry-run`.
6. One release later, remove the legacy data and rule blocks with a cleanup script (not written yet).

---

## Android app (Play Store)

The Android app is a Trusted Web Activity built with Bubblewrap from the live site. Step-by-step: [`twa/README.md`](twa/README.md) (init from `/manifest.webmanifest`, signing key, fingerprints, build, Play Console, Data safety answers).

- **Manifest** (`app/manifest.ts`): `id: '/'`, `start_url: /dashboard`, standalone, portrait, categories medical/health, shortcuts (Upload report, Chat, Visits). The maskable icon reuses `icon-512.png`; replace it with a padded one before release.
- **Digital Asset Links:** `/.well-known/assetlinks.json` is built from `ANDROID_PACKAGE_NAME` and `ANDROID_SHA256_FINGERPRINTS`; it returns `[]` until both are set.
- **App Check** (optional): with `NEXT_PUBLIC_APPCHECK_SITE_KEY` the client initialises reCAPTCHA Enterprise (the TWA runs the same web code). Register the web app in Firebase App Check, watch Metrics, then **Enforce** for Firestore and Storage in the console. Locally set `NEXT_PUBLIC_APPCHECK_DEBUG=1` and register the debug token. Skipped on emulators; server routes are unaffected.

---

## Project structure

```
app/
  (auth)/login/                Public login
  (app)/                       Authenticated area (AppShell): dashboard, records(/new,/[id],/print), upload,
                               trends, analysis, medications(/new,/[id],/[id]/edit), targets, vitals, chat,
                               visits(/new,/[id],/[id]/edit,/[id]/prep), questions, documents(/[id]),
                               timeline, care-circle, more, settings, onboarding
  api/                         Server routes (see Security model)
  invite/[id]/                 Public invite landing
  privacy/ terms/ ~offline/    Public pages
  .well-known/assetlinks.json/ TWA asset links
  sw.ts  manifest.ts  layout.tsx  globals.css
components/
  layout/                      AppShell, BottomNav, more-routes, Header, PatientSwitcher
  providers/                   AuthProvider, PatientProvider, ToastProvider
  alerts/ auth/ care-circle/ chat/ dashboard/ documents/ medications/ notifications/
  questions/ records/ settings/ shared/ targets/ timeline/ trends/ visits/ vitals/
  ui/                          Button, Card, Badge, Modal, Tabs, Toast, Skeleton, status colors
lib/
  firebase/                    Client SDK wrappers (config, auth, firestore, patients, storage, documents,
                               medications, visits, vitals, questions, targets, chat, invites, messaging, notifications)
  server/                      server-only: firebase-admin, auth, gemini, usage, invites, account-deletion,
                               patient-data, chat/, pdf/ (extract, cache, visit-prep-pdf), notifications/
  calculations/                Pure: health-score, trends, deltas, analysis, alerts, targets, vitals, medications
  parsing/                     metropolis (regex), date, extraction helpers
  constants/                   reference ranges, panels, seed data, medications
  visits/ timeline/ export/ documents/ notifications/ twa/   Pure builders and helpers
  personal/                    types.ts, sample.ts (synthetic), local.ts (gitignored, Admin scripts only)
  types/                       Shared types
scripts/                       migrate-to-patients.ts, seed-owner.ts, test-rules.mjs, lib/
tests/                         Vitest suites; rules/ = emulator suites
twa/                           Android TWA guide + example manifest
firestore.rules  storage.rules  firestore.indexes.json  firebase.json  firebase.test.json  vercel.json
```

---

## Implementation status

| Area | State |
|---|---|
| Phone OTP + Google sign-in, linking/unlinking | ✅ |
| Multiple profiles, care-circle roles, profile switcher, view-only UI | ✅ |
| Invites via WhatsApp links, pending invites, leave/remove, activity feed | ✅ |
| Lab records: manual, PDF/photo upload with review, view/edit/delete | ✅ |
| Dashboard, trends, analysis, alerts banner | ✅ |
| Medications CRUD, dose history, tacrolimus dose-vs-level | ✅ |
| Doctor targets (target > report > default) | ✅ |
| Vitals with flags | ✅ |
| Chat with reports (Gemini, tools, caps) | ✅ |
| Visits, visit prep, doctor mode, prep PDF, questions | ✅ |
| Document vault + AI extraction with quota and cache | ✅ |
| Timeline, CSV/JSON export, printable report | ✅ |
| Push notifications + cron reminders | ✅ (needs VAPID key, service account, `CRON_SECRET`) |
| Offline app shell + Firestore persistent cache | ✅ |
| Privacy/terms, account deletion | ✅ (no ownership transfer: owners of shared profiles get 409) |
| Android TWA | 🟡 Guide and asset links ready; app not yet built/published; maskable icon needs replacing |
| Lab-due reminders | 🟡 Scheduler reads `patients/{pid}.nextLabDate`, but nothing in the app sets it yet |
| Custom alert rules | 🟡 Engine and rules support `alertRules`; no UI to create them |
| Editing a patient profile (doctor, hospital, dates) | 🟡 `updatePatient()` and rules exist; no screen yet |
| Shareable doctor view | 🔴 Not built (`sharedLinks` closed; needs a token-keyed or server design) |
| Legacy data cleanup script | 🔴 Not written (planned one release after the migration) |
| Tests | ✅ Vitest unit suites + emulator suites for rules, invites, usage and migration |

---

## Technology review and alternatives

### How much of Firebase is used

Now essentially all of it: **Auth** (phone + Google), **Firestore** (multi-tenant data with role-based rules and a collection-group index), **Storage** (document vault with cross-service rules), **FCM** (push), optionally **App Check**, plus the **Admin SDK** on the server for invites, chat, extraction, export, notifications and account deletion. Client code still goes through `lib/firebase/` and server code through `lib/server/`, but the access-control logic now lives in ~400 lines of `firestore.rules` plus `storage.rules`, so a backend swap is a substantial project rather than a one-folder rewrite.

### Is Firebase the right choice?

**What works well here**
- Near-zero cost at family scale; phone auth, push and offline cache come built in.
- No server to run for data access; the rules model maps well to "members of a patient".
- The emulator suite makes the rules testable (`npm run test:rules`).

**What fits less well**
- **Vendor lock-in and data residency.** Data lives in Google Cloud and Firebase can't be self-hosted.
- **Relational / time-series data.** Firestore can't query "all Creatinine values ordered by date", so the app loads every record of a patient and computes on the client (fine for hundreds of reports, clumsy for analytics).
- **Security depends entirely on rules.** Each new collection needs rules and tests; mistakes are easy.
- **Phone OTP SMS costs** money and needs fraud controls (India-only region policy, budget alert).

### Open-source alternatives

| Option | What it is | Fit | Trade-offs |
|---|---|---|---|
| **Supabase** | Postgres + Auth (phone and OAuth) + Storage + Row-Level Security; managed or self-hosted | Closest replacement. RLS replaces the rules; SQL gives real queries over lab values | Managed free tier pauses idle projects; self-hosting is several containers; no built-in push |
| **PocketBase** | One Go binary: SQLite, auth, files, realtime, JS SDK | Best for full data ownership at family scale; API rules resemble Firestore rules | You run and back up a server; pre-1.0 |
| **Appwrite** | Open-source BaaS (auth incl. phone, DB, storage, functions, messaging) | Covers the feature set | Heavier to self-host; less SQL-like than Supabase |
| **Postgres + Auth.js + Drizzle** | Assemble it inside Next.js | Most control; authorisation lives in code | Most work: API layer, sessions, files, OTP provider |
| **Local-first** (IndexedDB/Dexie + optional sync) | Data stays on the device | Strong privacy for one patient | Care-circle sharing and backups become hard |

### Recommendation

- **Keep Firebase.** It is cheap at this scale, the rules are tested, and the care-circle, offline and push features lean on it. Migrating would not fix any current gap.
- **If data ownership becomes a requirement, Supabase** is the most direct swap (phone/OAuth auth, storage, policy-based access, and Postgres suits lab history). Plan it as a rewrite of `lib/firebase/`, `lib/server/` and the rules, behind a small data-store interface.

### Other parts of the stack

| Component | Assessment | Suggested change |
|---|---|---|
| Next.js 15.5 / React 19 | Current | Keep |
| `pdf-parse` 1.1.1 | Unmaintained since 2019; needs a `Uint8Array` workaround | Swap for `unpdf` or `pdfjs-dist` if parsing breaks; Gemini already reads the original file for non-Metropolis reports |
| Regex + Gemini extraction | Regex is free and offline for Metropolis; Gemini covers other labs and photos with a schema limited to known tests | Keep; add patterns as new report layouts appear |
| Recharts | Good fit | Keep |
| Tailwind + custom UI kit | Good fit | Keep |
| `react-hook-form` + `zod` | Used for medication, vitals, target and visit forms | Keep |
| `serwist` | Wired (app shell, push) | Keep |
| Testing | Vitest + emulator rules tests | Add end-to-end tests (e.g. Playwright against the emulators) |

---

## Costs

Monthly, USD, estimated from 2026 third-party prices: **verify live prices before launch.** Assumptions: India SMS OTP ≈ $0.06–0.07 each and 1–2 per user per month (sessions persist); one chat message ≈ 10k input + 1.5k output tokens; one AI report parse ≈ $0.01. Gemini 2.5 Flash is $0.30 / $2.50 per 1M tokens in/out; newer Flash models cost more.

| Item | Just you | 100 active users |
|---|---|---|
| Phone OTP SMS | ~$0.15 (2 SMS) | $7–14 (100–200 SMS) |
| Firestore (50k reads / 20k writes per day free) | $0 | $0 |
| Storage (5 GB free) | $0 | $0 (~2 GB of PDFs/photos) |
| Firebase Auth MAU, FCM, App Check | $0 | $0 |
| Gemini chat | $1–3 (~100 msgs) | $20 (2.5 Flash) – $80 (newer Flash), ~3,000 msgs |
| Gemini report extraction | < $0.10 | ~$3 |
| Hosting: Vercel | $0 (Hobby, personal, daily cron) | $20 (Pro; Hobby is non-commercial only) |
| Domain | $0 (subdomain) | $0 |
| **Monthly total** | **≈ $1–4** | **≈ $30–120** |
| One-time | Google Play developer fee $25 | same |

**Cost controls in the code and setup:** per-user chat caps (`CHAT_DAILY_LIMIT`, `CHAT_MONTHLY_TOKENS`) and extraction cap (`EXTRACT_DAILY_LIMIT`) with a per-document extraction cache; `GEMINI_MODEL` to switch models; free regex parsing first; invites over WhatsApp instead of SMS; India-only SMS region policy (blocks SMS-pumping fraud, the biggest bill risk); a GCP budget alert. Hosting on Firebase App Hosting or Cloud Run instead of Vercel Pro would cost about $0–5 at 100 users.

---

## Working with Claude Code

- `CLAUDE.md`: architecture notes, invariants and gotchas for AI sessions
- `.claude/settings.json`: a PreToolUse hook blocks edits to `.env*` and `package-lock.json`; a PostToolUse hook runs `tsc --noEmit` after TypeScript edits
- `.mcp.json`: Firebase MCP server (`firebase-tools mcp`) for querying the linked project and validating rules

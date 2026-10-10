# CKD Tracker

A mobile-first progressive web app for a kidney-transplant patient to keep lab results in one place and watch how they change over time. You can upload a lab report PDF or enter values by hand. The app scores each panel against reference ranges, charts the important markers, and flags values that are drifting.

It is built for **one patient**. Most reports come from Metropolis Healthcare (India), and the PDF parser is tuned for that format.

> **Medical data.** This app stores personal health information. Never commit real lab reports. `reports/` is gitignored for this reason. Use synthetic or redacted data for fixtures, screenshots and issues. The app supports tracking only and is not a diagnostic tool.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Lab test vocabulary](#lab-test-vocabulary)
- [Scoring and analysis](#scoring-and-analysis)
- [Security](#security)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Implementation status](#implementation-status)
- [Technology review and alternatives](#technology-review-and-alternatives)
- [Working with Claude Code](#working-with-claude-code)

---

## Features

| Screen | Route | What it does |
|---|---|---|
| Login | `/login` | Google sign-in through Firebase Auth |
| Dashboard | `/dashboard` | Overall health score ring, per-system scores, critical-metric cards (Creatinine, eGFR, Tacrolimus) with sparklines and change from the previous report, and a panel overview |
| Records | `/records` | List of lab reports, with delete |
| New record | `/records/new` | Manual entry form grouped by panel, with reference ranges pre-filled |
| Upload | `/upload` | Drop in a PDF. The server extracts values, you review them, then save them as a record |
| Trends | `/trends` | Charts for key markers (Creatinine, eGFR, Tacrolimus, Potassium, Haemoglobin, Sodium) with the reference band shown |
| Analysis | `/analysis` | CKD stage from eGFR, volatility (SD/CV), times out of range, eGFR compared with the age-expected value |
| Medications | `/medications` | Current prescription list from the personal-data module (static for now, see [status](#implementation-status)) |
| Settings | `/settings` | Account info, sign out |

Panels tracked are **Hemogram, Kidney Function, Tacrolimus, Electrolytes, Lipid Profile, and Urine Routine**.

The app is installable as a PWA through the web manifest (`app/manifest.ts`). Offline caching is not wired up yet.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript (strict) |
| Styling | Tailwind CSS 3, `lucide-react` icons, small in-house UI kit in `components/ui/` |
| Charts | Recharts |
| Auth | Firebase Authentication (Google provider) |
| Database | Cloud Firestore (client SDK, modular v10) |
| File storage | Firebase Storage (wired, not used yet) |
| Push | Firebase Cloud Messaging (wired, not used yet) |
| PDF text extraction | `pdf-parse` (server route) |
| AI fallback parser | Google Gemini via `@google/generative-ai` |
| Dates | `date-fns` |

---

## Getting started

### Prerequisites

- Node.js 18.17 or later (20 LTS recommended)
- A Firebase project with **Authentication (Google provider)** and **Firestore** turned on
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). This is optional and only needed for the AI parsing fallback.

### 1. Install

```bash
npm install
```

### 2. Configure the environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to find it | Required |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` … `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase console → Project settings → General → Your apps | Yes |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Project settings → Cloud Messaging → Web Push certificates | Only for push |
| `GEMINI_API_KEY` | Google AI Studio | Only for the AI fallback |
| `CRON_SECRET` | `openssl rand -hex 32` | Not used yet |

If `NEXT_PUBLIC_FIREBASE_API_KEY` is missing, Firebase skips initialisation and does not raise an error. `auth` and `db` are then `undefined`, and the app stays on the loading or login screen.

`NEXT_PUBLIC_*` Firebase values are public by design: they ship to the browser. The security rules are what protect your data. `GEMINI_API_KEY` is server-only and must stay secret.

### 3. Link Firebase and deploy the security rules

```bash
npx firebase-tools login
npx firebase-tools use <your-project-id>   # .firebaserc pins the default project
npx firebase-tools deploy --only firestore:rules,storage
```

In the Firebase console, add your local and production hostnames under **Authentication → Settings → Authorized domains**.

### 4. Run

```bash
npm run dev        # http://localhost:3000
```

The first time you sign in, the app finds you have no records and seeds records from the personal-data module. See [Personal data](#personal-data).

### Commands

```bash
npm run dev          # dev server on :3000
npm run build        # production build (also runs the full type-check)
npm run start        # serve the production build
npm run lint         # next lint
npx tsc --noEmit     # fast type-check without building
```

There is no test framework yet.

---

## Architecture

```
┌──────────────────────────── Browser (PWA) ─────────────────────────────┐
│                                                                        │
│  app/(auth)/login ──► AuthProvider (onAuthStateChanged)                │
│                              │                                         │
│  app/(app)/* ── AppShell ────┘ client-side auth gate + bottom nav      │
│       │                                                                │
│       ├─ useLabRecords() ──► lib/firebase/firestore.ts ──► Firestore   │
│       │                                                     (rules)   │
│       ├─ lib/calculations/* (pure: scores, trends, deltas, staging)    │
│       │                                                                │
│       └─ /upload ── POST multipart PDF ─────┐                          │
└─────────────────────────────────────────────┼──────────────────────────┘
                                              ▼
                     app/api/pdf/parse/route.ts (Node runtime)
                     pdf-parse → regex (METROPOLIS_PATTERNS)
                     └─ fewer than 3 matches → Gemini fallback
                     returns { values, date, labName } → client reviews → saves
```

Key points:

- **Data access happens only in the browser.** There is no middleware and no server session. Pages are client components that call Firestore directly with the signed-in user's credentials. **Firestore and Storage security rules are the real access control.** `AppShell`'s redirect to `/login` only affects the UX.
- **There is one server route,** `POST /api/pdf/parse`. It parses the PDF and returns the extracted values. It does not write to the database: the client shows the values for review and saves them itself.
- **Calculations are pure functions** in `lib/calculations/` with no Firebase imports, so they can be unit-tested directly.
- **Path alias:** `@/*` maps to the repo root.

### PDF parsing

1. `pdf-parse` extracts the raw text. `pdf-parse` is listed in `serverComponentsExternalPackages` in `next.config.js` so webpack leaves it unbundled.
2. Each entry in `METROPOLIS_PATTERNS` is matched against that text. The regexes are sensitive to order and overlap: `MCH` must not match `MCHC`, and `HDL`/`LDL` must not match `VLDL`. Re-check related patterns whenever you edit one.
3. If fewer than 3 values match, the first 4,000 characters are sent to Gemini with the list of allowed test names. Gemini's answer is kept only if it found more values.
4. The report date is pulled from `Collection/Sample/Report Date`, `DD-Mon-YYYY` or ISO patterns.

### Personal data

The repo is public, so patient-specific data stays out of git. Seed lab history, the prescription list and the doctor/hospital name come from the `@personal-data` alias (`tsconfig.json`):

- `lib/personal/local.ts`: **gitignored**, holds the real data. Used whenever it exists.
- `lib/personal/sample.ts`: committed, synthetic. Used on a fresh clone.

To use your own data, copy `sample.ts` to `local.ts` and edit it. Both files implement `PersonalData` from `lib/personal/types.ts`. The original prototype `kidney-health-tracker.jsx` also contains real data and is gitignored.

### First-login seeding

`lib/hooks/use-lab-records.ts` writes `SEED_RECORDS` to Firestore whenever the signed-in user has **zero** records. Editing seed data only affects users who haven't signed in yet. Deleting every record will trigger a re-seed on the next load.

---

## Data model

```
users/{uid}                          profile: fullName, email, dateOfBirth, bloodGroup,
                                     transplantDate, doctorName, doctorHospital, nextLabDate
users/{uid}/labRecords/{id}          recordDate (Timestamp), labName, doctorName, notes,
                                     pdfPath, values: LabValue[], createdAt, updatedAt
users/{uid}/medications/{id}         name, dose, frequency, category, isActive, …
sharedLinks/{id}                     token, isActive, expiresAt   (closed by rules)

Storage: lab-pdfs/{uid}/{timestamp}-{filename}
```

```ts
interface LabValue {
  testName: string          // must match REFERENCE_RANGES keys exactly
  panel: 'hemogram' | 'kidney' | 'tacrolimus' | 'electrolytes' | 'lipid' | 'urine'
  value: number
  unit: string
  referenceMin?: number     // overrides the default range for this record
  referenceMax?: number
  isAbnormal: boolean
}
```

- Lab values are **embedded** in the record document as an array, not stored as a subcollection. That means one read per report.
- Firestore `Timestamp`s are converted to ISO strings in `lib/firebase/firestore.ts`. The rest of the app only sees strings.

---

## Lab test vocabulary

A test is identified by its exact `testName` string. **That string has to match in four places:**

1. `REFERENCE_RANGES` in `lib/constants/reference-ranges.ts`: min/max, unit, panel, `higherIsBetter`, and `weight` (1–10) used in scoring
2. `PANELS` in `lib/constants/test-panels.ts`: which panel the test belongs to and its display order
3. `METROPOLIS_PATTERNS` in `app/api/pdf/parse/route.ts`: the extraction regex
4. Seed records in `lib/personal/sample.ts` (and `local.ts`), if it should appear in sample data

A mismatch fails without an error. An unknown test scores a neutral 50 and is left out of panels and trends.

---

## Scoring and analysis

**Per-value score (0–100).** A value inside its reference range scores 100. Outside the range, the score falls as `100 × (1 − d^0.8)`, where `d` is the deviation as a fraction of the range width, capped at 1. Record-specific `referenceMin/Max` override the defaults.

**System score.** This is the weighted average of the panel's values, using `REFERENCE_RANGES[*].weight`.

**Overall score.** This is the weighted average of system scores: kidney ×3, immunosuppression (tacrolimus) ×3, electrolytes ×2, hemogram ×2, lipid ×1. The urine panel is not scored.

**Analysis helpers** (`lib/calculations/`):

| Module | Function |
|---|---|
| `trends.ts` | Linear regression (slope, R²) over a test's history. Labels the trend as improving, worsening or stable, using `higherIsBetter` |
| `deltas.ts` | Absolute and percentage change from the previous record |
| `analysis.ts` | CKD stage from eGFR (KDIGO stages 1–5), volatility (SD and coefficient of variation; CV under 10% counts as stable), times above range, the gap between actual eGFR and the age-expected value (~1 mL/min/year decline after 30), and medication–lab interaction flags |

These are heuristics for tracking trends. They are not clinically validated.

---

## Security

| Area | Status |
|---|---|
| Firestore rules | Deployed. `users/{uid}/**` is owner-only. `sharedLinks` is fully closed |
| Storage rules | Deployed. `lab-pdfs/{uid}/**` is owner-only. Uploads must be `application/pdf` and under 20 MB |
| `/api/pdf/parse` | ⚠️ **No auth check.** Anyone who has the URL can call it and use up your Gemini quota. Fix: send the Firebase ID token and verify it with the Admin SDK, or move parsing to the client |
| Share links | `getSharedLinkByToken()` lists the whole collection, so an open read rule would expose every token. Redesign before enabling: key docs by token and allow `get` only, or serve shared views from a server route |
| Secrets | `.env*` is gitignored. Only `GEMINI_API_KEY` (and `CRON_SECRET`) are secret |

Rules live in `firestore.rules` and `storage.rules`, and `firebase.json` points the CLI at them. **Update them whenever you add a collection or storage path,** then redeploy:

```bash
npx firebase-tools deploy --only firestore:rules,storage
```

---

## Deployment

The app is a standard Next.js app. **Vercel** is the simplest host: import the repo, add the env vars from `.env.example`, and deploy. Any Node host that runs `next start` works too. The PDF route needs the Node runtime, not Edge.

After deploying:

1. Add the production domain to Firebase Auth → **Authorized domains**.
2. Deploy rules (above) if they changed.

---

## Project structure

```
app/
  (auth)/login/            Public login page
  (app)/                   Authenticated area, wrapped by AppShell
    dashboard/  records/  records/new/  upload/  trends/  analysis/  medications/  settings/
  api/pdf/parse/route.ts   Only server route: PDF → lab values
  layout.tsx  manifest.ts  error.tsx  loading.tsx  page.tsx (redirects to /dashboard or /login)
components/
  layout/                  AppShell, BottomNav, Header
  providers/               AuthProvider, ToastProvider
  dashboard/ records/ trends/   Feature components
  ui/                      Button, Card, Badge, Modal, Tabs, Toast, Skeleton
lib/
  firebase/                config, auth, firestore, storage, messaging wrappers
  hooks/use-lab-records.ts Fetch, seed and select helpers
  calculations/            Pure scoring, trends, deltas and analysis
  constants/               Reference ranges, panels, seed data, medications
  personal/                Patient data: types.ts, sample.ts (synthetic), local.ts (gitignored)
  types/                   LabRecord, Medication, analysis types
public/
  firebase-messaging-sw.js FCM service worker
  icons/                   PWA icons
firestore.rules  storage.rules  firebase.json  .firebaserc
kidney-health-tracker.jsx  Original single-file prototype (gitignored, not imported)
```

---

## Implementation status

| Area | State |
|---|---|
| Google sign-in, profile doc creation | ✅ Working |
| Lab records: list, add (manual), add (PDF), delete | ✅ Working |
| Dashboard, trends, analysis | ✅ Working |
| Edit a record | 🟡 `updateLabRecord()` exists, but there is no UI for it |
| Store uploaded PDFs | 🟡 `uploadPDF()` and Storage rules exist, but the upload page doesn't call them, so `pdfPath` is never set |
| Medications | 🟡 The page renders the static `DEFAULT_MEDICATIONS`. Firestore CRUD exists but is unused |
| Profile editing / settings | 🟡 Settings shows only email and sign-out |
| Push notifications (lab reminders) | 🔴 `messaging.ts` is never called. The service worker reads `self.__FIREBASE_CONFIG__`, which is never set |
| Shareable doctor view | 🔴 Data-layer stub only. Blocked on the redesign described under [Security](#security) |
| Offline / service-worker caching | 🔴 `serwist` / `@serwist/next` installed but not configured |
| PDF export | 🔴 `@react-pdf/renderer` installed but unused |
| Gemini fallback | 🔴 Uses `gemini-1.5-flash`, which Google has retired, so the fallback currently fails and falls back to the regex result. Update the model name |
| Tests | 🔴 None. `lib/calculations/` and the parse regexes are the best first targets |

Dependencies that are installed but unused: `react-hook-form`, `zod`, `@react-pdf/renderer`, `serwist`, `@serwist/next`.

---

## Technology review and alternatives

### How much of Firebase is actually used

In practice the app uses **Firebase Auth (Google) and Firestore**, through about five functions: sign-in, `getLabRecords`, `addLabRecord`, `deleteLabRecord` and profile creation. Storage, FCM and share links are written but never called. All Firebase code sits behind `lib/firebase/`, and pages only import those wrappers, so **replacing Firebase means rewriting roughly 250 lines in one folder**, plus the security rules.

### Is Firebase the right choice?

**What works well here**
- Free (Spark plan) at single-user scale.
- Google sign-in takes a few lines of code.
- No server to run, and the rules model fits "owner-only" data.

**What fits less well**
- **Vendor lock-in and data residency.** Data lives in Google's cloud, and Firebase itself is proprietary, so you can't self-host it.
- **The data is relational and time-series:** reports contain values, and values build up over time. Firestore can't run a query like "all Creatinine values ordered by date", so the app loads every record and filters on the client. That's fine for dozens of reports, but clumsy for analytics.
- **Security depends entirely on rules,** because the client talks to the database directly. That's workable, but easy to get wrong when you add collections.

### Open-source alternatives

| Option | What it is | Fit for this app | Trade-offs |
|---|---|---|---|
| **Supabase** | Open-source Postgres + Auth (Google OAuth) + Storage + Row-Level Security. Managed or self-hosted | **Closest replacement for Firebase.** RLS policies replace the Firestore rules. SQL gives real queries over lab values (`SELECT … WHERE test_name='Creatinine' ORDER BY date`). Has its own Storage | The managed free tier pauses projects after about a week of inactivity, which is awkward for an app used around lab visits. Self-hosting runs several containers |
| **PocketBase** | One Go binary with SQLite, auth (OAuth2/Google), file storage, realtime and a JS SDK | **Best for full data ownership at single-user scale.** Runs on a $5 VPS or Fly.io, backups are one SQLite file, and its API rules work like Firestore rules | You run and back up a server yourself. It's still pre-1.0 (it's stable in practice, but the API can change) |
| **Appwrite** | Open-source backend-as-a-service (auth, database, storage, functions). Managed or self-hosted | Covers the full feature set | Heavier to self-host than PocketBase, with a less SQL-like data model than Supabase |
| **Postgres + Auth.js + Drizzle** (e.g. Neon/Railway, or self-hosted) | Assemble the stack yourself inside Next.js | Most control. Data access moves to server routes, so authorisation lives in code rather than rules | The most work: you write the API layer, sessions and file storage yourself |
| **Local-first** (IndexedDB via Dexie, optional sync) | Data stays on the device | Strong privacy story for a single patient. Works offline | Multi-device sync and backups become your problem |

### Recommendation

- **Short term: keep Firebase.** It costs nothing, the rules are deployed, and migrating doesn't fix any of the current problems. The higher-value work is the open items above: the auth check on the parse route, the retired Gemini model, tests, and finishing the half-wired features.
- **If open-source or data ownership matters, move to Supabase.** It's the most direct swap: Google OAuth, storage and policy-based access all carry over. Postgres also suits lab history better than documents do. Self-host it later if you want, or use **PocketBase** if you'd rather run a single binary on your own VPS.
- **Do the migration through the existing `lib/firebase/` seam.** First define a small `DataStore` interface (`getLabRecords`, `addLabRecord`, …) that the pages depend on, then write the new backend against that interface.

### Other parts of the stack

| Component | Assessment | Suggested change |
|---|---|---|
| Next.js 14 App Router | Fine, though newer major versions exist | Upgrade when convenient. Nothing urgent |
| `pdf-parse` 1.1.1 | Unmaintained since 2019, with no types of its own | Swap for `unpdf` or `pdfjs-dist` if parsing starts to break |
| Regex + Gemini 1.5 fallback | Regexes are brittle and tied to one lab's layout. The Gemini model name is retired | Send the **PDF itself** to a current multimodal model with a JSON schema for structured output. It works across lab formats and drops the need for both regex and `pdf-parse`. Keep the regex path as an offline fallback |
| Recharts | Good fit for small time series | Keep |
| Tailwind + custom UI kit | Good fit | Keep. Add shadcn/ui if the component set grows |
| `react-hook-form` + `zod` | Installed, unused | Use them for the manual-entry form (validation and units), or remove them |
| `serwist` | Installed, not wired | Configure it for offline support, or remove it |
| Testing | None | Add Vitest. Start with `lib/calculations/` and parse fixtures built from **redacted** sample text |

---

## Working with Claude Code

This repo includes Claude Code configuration:

- `CLAUDE.md`: architecture notes and rules for the AI assistant
- `.claude/settings.json` with two hooks: one blocks edits to `.env*` and `package-lock.json`, and one runs `tsc --noEmit` after each TypeScript edit
- `.mcp.json`: Firebase MCP server, for querying and validating rules against the linked project

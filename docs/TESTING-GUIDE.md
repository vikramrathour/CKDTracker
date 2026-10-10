# Testing guide

A practical walk-through for checking every feature locally against the Firebase emulators, then taking the app live. Commands are for **Git Bash on Windows** (PowerShell equivalents are noted where they differ). Use **synthetic data only**: the repo is public.

- [Part 1: one-time setup](#part-1-one-time-setup)
- [Part 2: start everything](#part-2-start-everything)
- [Part 3: feature checklist](#part-3-feature-checklist)
- [Part 4: automated tests](#part-4-automated-tests)
- [Production go-live checklist](#production-go-live-checklist)
- [Troubleshooting](#troubleshooting)

---

## Part 1: one-time setup

1. **Node 22+ and Java.** `node -v` should print v22 or later. `java -version` should work (current `firebase-tools` emulators want JDK 21+; install Temurin from adoptium.net if missing).
2. **Dependencies.** From the repo root: `npm install`.
3. **Back up your real config.** `cp .env.local .env.local.real` (both are gitignored). You'll switch `.env.local` to emulator mode now and restore it later.
4. **Emulator values in `.env.local`.** Edit by hand (Claude's hooks block `.env*` edits). Set or replace these lines:

   ```bash
   NEXT_PUBLIC_USE_EMULATORS=1
   NEXT_PUBLIC_FIREBASE_API_KEY=demo-key            # any non-empty string
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-ckd.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-ckd
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-ckd.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=0
   NEXT_PUBLIC_FIREBASE_APP_ID=1:0:web:demo
   FIREBASE_SERVICE_ACCOUNT_B64=                    # EMPTY: the server then uses demo-ckd too
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
   FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
   NEXT_PUBLIC_ENABLE_DEMO=1                        # "Load demo data" button
   GEMINI_API_KEY=<your paid-project key>           # keep it for chat/extraction; synthetic data only
   CHAT_DAILY_LIMIT=50
   EXTRACT_DAILY_LIMIT=30
   CRON_SECRET=local-test-secret
   ```

   Why `demo-ckd` and an empty service account: a `demo-*` project can never reach a real Firebase project, and the browser, the Next server (Admin SDK) and the emulators must all use the **same project id**. With a real service account set, the server would use the real project id and reject emulator tokens (401) or read a different emulator namespace.

   Leave `NEXT_PUBLIC_APPCHECK_SITE_KEY` empty. App Check is skipped on emulators anyway.

5. **A synthetic lab report PDF.** Open Notepad, paste the block below, then *File → Print → Microsoft Print to PDF* and save it as `synthetic-report.pdf` **outside the repo** (or in `reports/`, which is gitignored). The regex parser reads one test per line.

   ```
   Metropolis Healthcare (synthetic sample)
   Patient Name : TEST PATIENT          Age/Sex : 40 Y / M
   Collection Date : 11/09/2026 10:42
   Haemoglobin (Hb)          12.1  g/dL        13.0 - 17.0
   Total Leucocyte Count     7.2   10^3/uL     4.0 - 10.0
   Platelet Count            2.45  Lakhs/cumm  1.5 - 4.1
   Creatinine, Serum         1.62  mg/dL       0.70 - 1.30
   eGFR (CKD-EPI 2021)       48    mL/min/1.73m2  >60
   Urea, Serum               52    mg/dL       15 - 43
   Tacrolimus, Whole Blood   11.4  ng/mL       5 - 10
   Sodium (Na+)              137   mEq/L       136 - 146
   Potassium (K+)            5.7   mEq/L       3.5 - 5.1
   Chloride (Cl-)            103   mEq/L       98 - 106
   ```

   The high creatinine, potassium and tacrolimus values are there on purpose so alerts fire. For the photo path, take a phone photo of the printed page (needs `GEMINI_API_KEY`).

---

## Part 2: start everything

**Terminal 1: emulators** (Auth 9099, Firestore 8080, Storage 9199, Emulator UI 4000; they load `firestore.rules` and `storage.rules` from `firebase.json`):

```bash
npx firebase-tools emulators:start --project demo-ckd
# keep data between runs (directory outside the repo):
#   first run:   npx firebase-tools emulators:start --project demo-ckd --export-on-exit ../ckd-emulator-data
#   later runs:  npx firebase-tools emulators:start --project demo-ckd --import ../ckd-emulator-data --export-on-exit
```

**Terminal 2: the app:**

```bash
npm run dev        # http://localhost:3000
```

**Reading OTP codes.** No SMS is sent and reCAPTCHA is mocked. After *Send code*, the code appears:

- in the emulator terminal (it logs the code for each number),
- via REST: `curl http://127.0.0.1:9099/emulator/v1/projects/demo-ckd/verificationCodes`,
- in the Emulator UI → Authentication (http://127.0.0.1:4000/auth).

**Test numbers.** Any valid Indian mobile works on the emulator (the app only accepts Indian mobiles). Use:

| Who | Number | Browser |
|---|---|---|
| Owner (you) | `98765 00001` | your normal Chrome profile |
| Family member | `98765 00002` | a second Chrome profile (Profile icon → Add) or another browser |

Inspect data at any time in the Emulator UI → Firestore / Storage (http://127.0.0.1:4000).

---

## Part 3: feature checklist

Tick each line. "Owner" = browser 1, "Viewer" = browser 2.

### Sign-in and onboarding
- [ ] Owner: open http://localhost:3000 → redirected to `/login`. Enter `98765 00001`, read the code, verify → lands on `/onboarding`.
- [ ] Wrong code shows a friendly error (not a raw `auth/...` code); *Resend* has a countdown.
- [ ] Onboarding: create **Myself** (name, DOB, transplant date, doctor, hospital, optional tacrolimus target) → dashboard with bottom tabs Home / Records / Chat / Visits / More.
- [ ] Emulator UI → Firestore: `patients/{uid}` and `patients/{uid}/members/{uid}` (role `owner`) exist; `users/{uid}.activePatientId` is set.

### Records and dashboard
- [ ] Empty dashboard → **Load demo data** (from `NEXT_PUBLIC_ENABLE_DEMO=1`; synthetic records from `lib/personal/sample.ts`). Score ring, system scores, critical-metric cards with sparklines and deltas appear.
- [ ] Records → Upload → choose `synthetic-report.pdf` → values are extracted (method regex), date 11/09/2026 → review, fix one value, save.
- [ ] The new record appears in Records; `/records/{id}` shows values by panel and the source document; edit the notes, save; delete works (try it on a throwaway manual record).
- [ ] Records → *Add manually* (`/records/new`) saves a record.
- [ ] Dashboard **alerts banner** shows the creatinine (critical, vs baseline), potassium and tacrolimus alerts. Tapping one opens `/chat?q=…` with the question prefilled but **not sent**.
- [ ] More → Trends: charts with reference bands. More → Analysis: CKD stage, volatility, out-of-range counts.

### Targets, medications, vitals
- [ ] More → Targets: set eGFR min 45 and Tacrolimus 6–9. Trends shows *Your target*; the dashboard score and alerts change accordingly (target > report range > default).
- [ ] More → Medications → Add: Tacrolimus, `1 mg`, `Twice daily`, morning + night. Edit it to `1.5 mg` with a reason. The detail page shows the dose history and the **trough level vs dose** chart with a marker at the change.
- [ ] Stop the medicine, then restart it; it moves between Current and Stopped.
- [ ] More → Vitals: enter BP 150/95, weight, temperature 38.2 → warnings shown. Enter a weight 2.5 kg different within 3 days → weight warning.

### Visits, questions, documents
- [ ] Visits → New visit for tomorrow; link the new report. Open **Prep**: new reports, changes with arrows, out-of-range values, alerts, medications, open questions.
- [ ] **Doctor mode** opens a large-type full-screen summary. **PDF** downloads/shares an A4 summary.
- [ ] More → Questions: add a question; move it open → asked → answered (answer linked to the visit).
- [ ] More → Documents: upload a PDF and a phone photo (or PNG) as *lab report*. Emulator Storage shows `patients/{pid}/documents/{docId}/{file}`.
- [ ] **Extract values** on the photo (Gemini, counts 1 toward `EXTRACT_DAILY_LIMIT`) → review → save a record; document and record link to each other. Extract again → returns instantly (cached).
- [ ] Optional quota check: set `EXTRACT_DAILY_LIMIT=1`, restart dev, extract a new photo twice → friendly 429 message. Reset afterwards.

### Chat
- [ ] Chat: "What changed since my last report?" → streamed answer, date citations link to records, possibly a mini trend chart.
- [ ] "Help me prepare for my next appointment" → proposed question → **Add to doctor's questions** saves it with a "From chat" badge.
- [ ] Every chat screen shows "Not medical advice".
- [ ] Optional cap check: `CHAT_DAILY_LIMIT=2`, restart dev, send 3 messages → friendly limit message. Reset afterwards.

### Care circle (two browsers)
- [ ] Owner: More → Care circle → invite `98765 00002`, name "Test Viewer", role **Viewer** → *Create invite link* → **Copy link** (WhatsApp opens wa.me, which you don't need locally).
- [ ] Viewer (browser 2): open the link → landing page shows only first names and the role → *Sign in to accept* → OTP for `98765 00002` → lands on the owner's profile dashboard.
- [ ] Viewer sees records, trends, chat; sees **no** add/edit/upload/delete controls; pages show the view-only notice.
- [ ] Viewer can chat; their chat threads are not visible to the owner (and vice versa).
- [ ] Owner: Care circle shows the member with a **masked** phone; switch them to **Editor** → viewer's browser now shows edit controls (refresh). Switch back to Viewer.
- [ ] Owner: Recent activity lists the invite, join, role change and data edits (no lab values).
- [ ] Invite a third number, then **cancel** it; opening that link now shows it's no longer available.
- [ ] Wrong-number check: open a fresh invite in browser 2 while signed in as `98765 00002` but invited `98765 00003` → "sent to +91 ••••• •••03" style message.
- [ ] Viewer: Care circle → **Leave** → they go to onboarding (no profiles); owner's activity shows the departure. Re-invite if you want to keep testing.
- [ ] Owner: dashboard → *Track someone else's reports →* (bottom of the page) creates a second profile; the header switcher (shown once you have two profiles, with *Add someone*) moves between them.

### Timeline, export, settings
- [ ] More → Timeline: reports, visit, dose change, documents, answered question; filter chips work.
- [ ] Settings → Export **CSV** (one row per value) and **JSON** (everything except files); *Printable report* opens `/records/print`.
- [ ] Settings → Sign-in methods: **Link Google** (the Auth emulator shows a fake account picker; add a new account). Unlink Google again. Unlinking the last remaining method is refused.
- [ ] Sign out → `/login`; sign back in with the same number → same data.

### Notifications (needs a real project)
FCM isn't emulated, so do this after switching back to the real config (`.env.local.real`) with `NEXT_PUBLIC_FIREBASE_VAPID_KEY` and `FIREBASE_SERVICE_ACCOUNT_B64` set, plus `NEXT_PUBLIC_ENABLE_SW_IN_DEV=1` (or `npm run build && npm start`):
- [ ] Settings → Notifications → *Turn on for this device* → allow → *Send a test* arrives.
- [ ] Change preferences and quiet hours; they persist after reload.
- [ ] Trigger reminders by hand: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reminders` (response = counts only). A visit tomorrow should notify at the 18:00 IST run; use `?mode=daily` to send the digest regardless of the hour.
- [ ] Lock-screen text contains no values, test, medicine or doctor names.

### Offline (production build)
- [ ] `npm run build && npm start` (stop `npm run dev` first), open http://localhost:3000, visit dashboard, records, trends.
- [ ] DevTools → Application → Service workers shows `/sw.js` active. Network → *Offline* → reload: visited pages and data still show, with the "Offline: showing saved data" banner; an unvisited page shows `/~offline`.
- [ ] Add a vital while offline → the write is queued; go online → it syncs (check the Emulator UI).
- [ ] Sign out → offline cache is cleared (IndexedDB `firestore/...` gone).

### Delete account
- [ ] Viewer (browser 2): Settings → **Delete my account**, type `DELETE` → account and membership gone; owner's data untouched.
- [ ] Owner, with another member still in a profile → deletion refused (409) with an explanation. Remove the member, retry → all owned profiles, files and invites are deleted (check Firestore/Storage in the Emulator UI), then you're signed out.

### Clean up
- [ ] Restore your config: `cp .env.local.real .env.local`.
- [ ] Stop the emulators (Ctrl+C). On Windows check for leftover Java listeners: `netstat -ano | grep -E ":(8080|9099|9199|4000|4400|4500) "` then `taskkill //PID <pid> //F` (PowerShell: `taskkill /PID <pid> /F`).

---

## Part 4: automated tests

```bash
npm test               # all unit suites (synthetic data)
npm run test:rules     # rules, invites, usage, migration on dedicated emulator ports (needs Java)
npx tsc --noEmit
npm run lint
npm run build          # also the full type-check
```

Migration dry run on emulator data (with terminal 1 running):

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 \
  npx tsx scripts/migrate-to-patients.ts --dry-run
```

---

## Production go-live checklist

**Firebase / Google Cloud**
- [ ] Project on the **Blaze** plan (phone SMS needs it).
- [ ] **Budget alert**: Google Cloud → Billing → Budgets & alerts, e.g. $10 and $50 (or ₹500) with emails at 50/90/100%.
- [ ] Authentication → Sign-in method: **Phone** enabled, **Google** enabled.
- [ ] Authentication → Settings → **SMS region policy** → Allow → **India only** (blocks SMS-pumping fraud).
- [ ] Phone provider → **Phone numbers for testing**: e.g. `+91 99999 00001` / `123456` and `+91 99999 00002` / `123456` (no SMS, no quota; also for Play review).
- [ ] Authentication → Settings → **Authorized domains**: `localhost` and every production hostname.
- [ ] If `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is your own domain (recommended, needed for the TWA): add `https://<domain>/__/auth/handler` to the OAuth web client's authorized redirect URIs (Google Cloud → APIs & Services → Credentials).
- [ ] **Service account**: Project settings → Service accounts → Generate new private key → `base64 -w0 key.json` (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("key.json"))`) → `FIREBASE_SERVICE_ACCOUNT_B64`. Delete the JSON file afterwards; never put it in the repo.
- [ ] **VAPID key**: Project settings → Cloud Messaging → Web Push certificates → Generate key pair → `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (public key).
- [ ] **Gemini**: key from a **billing-enabled** project (free tier may train on data) → `GEMINI_API_KEY`; optionally `GEMINI_MODEL`, caps `CHAT_DAILY_LIMIT`, `CHAT_MONTHLY_TOKENS`, `EXTRACT_DAILY_LIMIT`.
- [ ] Optional App Check: reCAPTCHA Enterprise website key → `NEXT_PUBLIC_APPCHECK_SITE_KEY`; register in Firebase App Check; enforce only after Metrics show nearly all requests verified.

**Vercel**
- [ ] Env vars: all `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_SERVICE_ACCOUNT_B64`, `GEMINI_API_KEY`, `CRON_SECRET` (`openssl rand -hex 32`), `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, caps; **not** `NEXT_PUBLIC_USE_EMULATORS`, `*_EMULATOR_HOST` or `NEXT_PUBLIC_ENABLE_DEMO`.
- [ ] **Cron and plan:** `vercel.json` runs hourly (`30 * * * *`), which needs **Vercel Pro**. On Hobby change it to `"30 12 * * *"` with path `/api/cron/reminders?mode=daily` (no medication reminders), or call the URL hourly from an external scheduler with the Bearer secret. Hobby is also non-commercial only.

**Deploy order (data migration from the old `users/{uid}` model)**
1. [ ] `npx firebase-tools deploy --only firestore:indexes` → wait until the `members` index shows *Enabled* in the console.
2. [ ] `npx tsx scripts/migrate-to-patients.ts --dry-run` (uses `FIREBASE_SERVICE_ACCOUNT_B64` from `.env.local`), check the counts, then `--yes`. Every user should report `verified OK`.
3. [ ] Deploy rules **and** ship the new client together: `npx firebase-tools deploy --only firestore:rules,storage` + Vercel production deploy. Accept the Storage → Firestore IAM prompt.
4. [ ] Re-run `npx tsx scripts/migrate-to-patients.ts --yes` to catch anything the old client wrote in between.
5. [ ] Optional: `npx tsx scripts/seed-owner.ts <your-uid> --dry-run`, then without `--dry-run`, to import medications/doctor from `lib/personal/local.ts`.
6. [ ] Smoke test production with a **test phone number**: sign in, dashboard shows migrated records, upload, chat, invite.

**Before publishing**
- [ ] `NEXT_PUBLIC_SUPPORT_EMAIL` set; `/privacy` and `/terms` reviewed.
- [ ] Notifications: test push on an Android phone; cron response shows counts.

**Play Store** (full steps in [`twa/README.md`](../twa/README.md))
- [ ] Site live on its final HTTPS domain, `/manifest.webmanifest` loads, `/sw.js` active, auth domain = app domain.
- [ ] Replace the maskable icon with a properly padded 512×512 one.
- [ ] Bubblewrap init/build outside the repo; keep the keystore private and backed up.
- [ ] Set `ANDROID_PACKAGE_NAME` and `ANDROID_SHA256_FINGERPRINTS` (upload key **and** Play App Signing key) → redeploy → `/.well-known/assetlinks.json` returns them.
- [ ] Play Console: $25 developer account, app listing, health/medical declarations, Data safety form (answers in `twa/README.md`), test phone number for reviewers, internal testing track first.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| App stuck on the spinner / login | `NEXT_PUBLIC_FIREBASE_API_KEY` empty, or emulators not running while `NEXT_PUBLIC_USE_EMULATORS=1` |
| API calls return 401 on emulators | Project id mismatch: `FIREBASE_SERVICE_ACCOUNT_B64` must be empty and `NEXT_PUBLIC_FIREBASE_PROJECT_ID` must equal the emulator `--project` |
| API calls return 500 "Internal server error" | Admin env missing (`*_EMULATOR_HOST` locally, `FIREBASE_SERVICE_ACCOUNT_B64` in production); check the dev server log |
| "Couldn't load your profiles" | Production: the `members` index is still building. Emulator: Firestore emulator down |
| `readlink` / `EINVAL` errors from `.next` | OneDrive sync: delete `.next` and restart `npm run dev` |
| `tsconfig.json` changed after `NEXT_DIST_DIR=… npm run dev` | Revert it (`git checkout tsconfig.json`) |
| Emulator ports already in use | Leftover Java process: `netstat -ano` + `taskkill` (see Clean up) |
| `firebase-debug.log` / `firestore-debug.log` appeared | Gitignored; they contain your environment, so never share them |
| Upload rejected by Storage | File ≥ 20 MB or not PDF/JPEG/PNG/WebP/HEIC; or you are a viewer |

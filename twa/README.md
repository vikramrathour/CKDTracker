# Android app (Trusted Web Activity)

The Play Store app is a thin Android shell around the deployed web app, built
with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). Chrome runs
the same code, service worker and Firebase sign-in as the website. No app code
lives in this repo: only this guide and `twa-manifest.example.json`. The
generated Android project and **the signing keystore must never be committed**.
Keep them in a private location and back up the keystore, because losing it means
you can't update the app.

Replace `ckd.example.com` with the production domain and
`com.example.ckdtracker` with your package name throughout.

## 0. Prerequisites

- The site is deployed over HTTPS on its final domain, with
  `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` set to that domain (see `.env.example`), so
  Google sign-in stays first-party inside the TWA.
- `https://ckd.example.com/manifest.webmanifest` loads, and the service worker
  (`/sw.js`) is active (DevTools → Application). Lighthouse's PWA checks pass.
- JDK 17 and Node 18+. Bubblewrap downloads the Android SDK on first run.
- A maskable icon with safe-zone padding (512×512). `app/manifest.ts` currently
  reuses `icon-512.png`. Make one at https://maskable.app and point the
  `maskable` entry at it.
- `/privacy` and `/terms` are live, and `NEXT_PUBLIC_SUPPORT_EMAIL` is set to a real address.

## 1. Generate the project

```bash
mkdir ~/ckd-twa && cd ~/ckd-twa          # outside the repo
npx @bubblewrap/cli init --manifest https://ckd.example.com/manifest.webmanifest
```

Answer the prompts (compare with `twa-manifest.example.json`):

| Prompt | Answer |
|---|---|
| Domain | `ckd.example.com` |
| URL path | `/dashboard` |
| Application name / short name | `CKD Tracker` |
| Application ID (package) | `com.example.ckdtracker` (permanent) |
| Display mode / orientation | `standalone` / `portrait` |
| Status bar colour | `#F7F6F2` |
| Splash background | `#F7F6F2` |
| Icon / maskable icon | the 512px PNGs |
| Include support for Play Billing | No |
| Request geolocation permission | No |
| Enable notifications delegation | **Yes**: web push from the service worker is shown as Android notifications (Android 13+ asks for permission) |
| Key store location / key name | `./android.keystore` / `ckdtracker`. Bubblewrap creates the signing key; pick strong passwords and store them in a password manager |

## 2. Fingerprints → assetlinks.json

Android verifies that the app and site belong together through
`https://ckd.example.com/.well-known/assetlinks.json`, served by
`app/.well-known/assetlinks.json/route.ts` from env vars.

```bash
npx @bubblewrap/cli fingerprint list            # SHA-256 of your upload key
# or: keytool -list -v -keystore android.keystore -alias ckdtracker
```

After the first upload, Play Console → your app → **Test and release → App
integrity → App signing** shows the **app signing key** SHA-256 (Google re-signs
the app with it). Set both on Vercel (Production):

```
ANDROID_PACKAGE_NAME=com.example.ckdtracker
ANDROID_SHA256_FINGERPRINTS=AA:BB:…:99,CC:DD:…:11   # upload key, Play app-signing key
```

Redeploy, then check:

```bash
curl https://ckd.example.com/.well-known/assetlinks.json
# Google's checker:
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://ckd.example.com&relation=delegate_permission/common.handle_all_urls
```

If the URL bar shows up inside the installed app, the fingerprints don't match.

## 3. Build

```bash
npx @bubblewrap/cli build        # → app-release-bundle.aab (Play) and app-release-signed.apk (sideload test)
npx @bubblewrap/cli install      # install the APK on a USB-connected phone
```

Test on a device: sign in with phone OTP and Google, open a report offline
(airplane mode after one online visit), enable notifications in Settings and
press "Send a test", then tap the notification and check it opens the app.

For each update, bump `appVersionCode` (and `appVersionName`) in
`twa-manifest.json`, then run `npx @bubblewrap/cli update && npx @bubblewrap/cli build`.
Web changes ship through Vercel and don't need a new app build.

## 4. Play Console

1. Create the app (free app, category **Medical**, or **Health & Fitness**).
   Enrol in **Play App Signing** and upload `app-release-bundle.aab` to
   **Internal testing** first.
2. **App content**:
   - **Privacy policy**: `https://ckd.example.com/privacy`
   - **App access**: sign-in is required. Give reviewers a test phone number
     with a fixed OTP (Firebase console → Authentication → Sign-in method →
     Phone → *Phone numbers for testing*) and a profile filled with **synthetic** data.
   - **Ads**: No ads.
   - **Content rating**: questionnaire, reference app category "Health".
   - **Target audience**: 18+.
   - **Health apps declaration**: personal health records / medication
     reminders / lab-result tracking. *Not* a medical device; no diagnosis.
   - **Account deletion**: in-app at Settings → Delete my account. Web URL
     for requests: `https://ckd.example.com/privacy` (section "Keeping and
     deleting data").
   - **Data safety**: see below.
3. Store listing: screenshots from a device or emulator using synthetic data
   only (never real reports), short and full description, feature graphic.
4. Promote from internal → closed testing → production. New personal developer
   accounts must run a closed test with at least 12 testers for 14 days before production.

### Data safety form

Answers for the current implementation (re-check whenever features change):

- **Does your app collect or share any of the required user data types?** Yes.
- **Is all of the user data collected by your app encrypted in transit?** Yes (HTTPS / Firebase TLS).
- **Do you provide a way for users to request that their data is deleted?** Yes (in-app + email).
- **Shared with third parties?** No. Google (Firebase, Gemini) and Vercel are
  *service providers* processing on our behalf, which Play does not count as sharing.

| Data type | Collected | Purpose | Optional? |
|---|---|---|---|
| Personal info → Name | Yes | App functionality, Account management | Required |
| Personal info → Email address | Yes (Google sign-in) | Account management | Optional |
| Personal info → Phone number | Yes (OTP sign-in) | Account management | Optional (one sign-in method required) |
| Health and fitness → Health info | Yes: lab results, medications, vitals, visits | App functionality | Required for the core feature |
| Messages → Other in-app messages | Yes: AI chat questions/answers | App functionality | Optional |
| Files and docs | Yes: uploaded report PDFs/photos | App functionality | Optional |
| App activity → Other user-generated content | Yes: doctor questions, notes | App functionality | Optional |
| Device or other IDs | Yes: FCM push token | App functionality (notifications) | Optional |

Data is **not** used for advertising, analytics or personalisation and is
**not** processed ephemerally (it's stored until deleted). AI processing uses
the Gemini API on a paid project; Google doesn't use that data for training.

## 5. App Check (recommended before launch)

The TWA runs the web code in Chrome, so App Check uses the **reCAPTCHA
Enterprise** web provider. Play Integrity applies only to native Android code,
which a TWA doesn't have. Setup steps are in the main README under "Android app
(Play Store)".

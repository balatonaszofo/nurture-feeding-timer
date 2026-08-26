# Nurture Day

A small, calming feeding timer that remembers the last feeding and automatically calculates the next one from your chosen interval.

## What it does

- Log a feeding with one tap
- Edit the feeding time if you forgot to log it immediately
- Stop an active feeding to save its session duration in the timetable
- Add or edit feeding details: planned vs. top-off, breast milk vs. formula, and optional notes
- Count top-offs in history without letting them reset the next planned-feeding countdown
- Choose a 2, 3, 4, or 5 hour routine—or enter a custom interval
- See a live countdown and approximate next feeding time
- Enable an on-device chime, vibration, and notification when the timer ends
- Count feedings and review a complete timetable grouped by day
- Log diaper changes, see today's count, undo mistakes, and review change history
- Classify diaper changes as pee, poo, or both
- Export all feeding and diaper history as a Google Sheets-ready CSV file
- Welcome new families with a two-step onboarding experience
- Keep every browser or signed-in account in a separate private profile
- Continue with Google for a recoverable cloud profile or without Google as a private guest
- Switch between the light and dark appearance
- Keep your settings on the device with local storage
- Install from the browser as a home-screen app
- Work offline after the first visit

## Install on a phone

Once GitHub Pages is enabled, open the published site on your phone.

### iPhone or iPad

1. Open the site in Safari.
2. Tap the **Share** button.
3. Choose **Add to Home Screen**.
4. Tap **Add**.

### Android

1. Open the site in Chrome.
2. Open the browser menu.
3. Choose **Install app** or **Add to Home screen**.

Until Firebase is connected, all feeding and diaper-change data stays in that browser on that device. It is not uploaded to a server or shared between devices.

When Firebase is connected, Google and anonymous guest profiles store an encrypted-in-transit backup in Cloud Firestore. Firestore rules restrict each profile document to the matching Firebase Authentication UID. A guest profile has no email or Google identity and is recoverable only from the browser where it was created. Existing pre-profile history is claimed by the first profile selected and is never offered to a second account on the same browser.

Use **Export care log** to share the CSV file from a phone or download it from a browser. Choose Google Sheets or Google Drive from the phone's share menu when available, or import the downloaded CSV into Google Sheets.

## Enable Google sign-in and private cloud profiles

The onboarding and isolated on-device guest profiles work without external configuration. Google sign-in and cloud backup activate after this one-time Firebase setup:

1. Create a Firebase project and register a **Web app** in Firebase Console.
2. Copy the public Firebase web configuration values into `firebase-config.js`.
3. In **Authentication → Sign-in method**, enable **Google** and **Anonymous**.
4. Add `balatonaszofo.github.io` to **Authentication → Settings → Authorized domains**. Add the custom domain there later as well.
5. Create a Cloud Firestore database in production mode.
6. Deploy the included owner-only rules:

```sh
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project YOUR_PROJECT_ID
```

Firebase's web configuration object identifies the public app; access control comes from Firebase Authentication and `firestore.rules`, not from hiding the API key. The rules allow a user to read or update only `/users/{their-own-uid}` and deny every other document path.

## Metrics

Production visits and a small onboarding funnel are measured with the Google Analytics property already connected to Firebase. Care-log data and user identifiers are never included in custom analytics events. See [ANALYTICS.md](ANALYTICS.md) for the dashboard steps, event definitions, and privacy boundaries.

The alarm is designed for use while Nurture Day is active. Mobile operating systems may suspend browser timers when the app is in the background, even if it still appears open. Guaranteed background notifications require server-backed web push or a native mobile app.

## Background notification server

The optional server in `server/` schedules standards-based Web Push notifications while keeping feeding history on the phone. It stores only the device push subscription and next due time.

1. Run `npm install` inside `server/`.
2. Run `npm run setup` and replace the placeholder VAPID contact email in `server/.env`.
3. Run `npm start` and expose `http://127.0.0.1:8787` through a stable HTTPS Cloudflare Tunnel hostname.
4. Put that hostname in `push-config.js` and redeploy the static site.

The computer and tunnel must remain running for background reminders to arrive.

On Windows, run `server/install-windows-tasks.ps1` as an administrator after configuring the tunnel. It installs the push server and Cloudflare tunnel as startup tasks with automatic restart. Run `server/remove-windows-tasks.ps1` as an administrator to remove them.

## Native Android app

Nurture Day includes a Capacitor 8 Android project in `android/` using package ID `com.nurtureday.app`. The native shell draws the selected app background behind Android's edge-to-edge system bars, switches system icon contrast with light/dark mode, uses Android Credential Manager for Google sign-in, and schedules feeding alarms directly on the device.

### One-time Firebase Android setup

1. Open Firebase Console → **nurtureday** → **Project settings** → **General**.
2. Under **Your apps**, choose **Add app** → **Android**.
3. Enter Android package name `com.nurtureday.app` and app nickname `Nurture Day`.
4. Register the app and download `google-services.json`.
5. Place that file at `android/app/google-services.json`. It is ignored by Git because it is environment-specific.
6. Add the debug and release SHA-1 fingerprints to the Firebase Android app before using Google sign-in.

For GitHub Actions, base64-encode the complete `google-services.json` file and save it as the repository secret `FIREBASE_ANDROID_CONFIG`.

### Build locally

Install Android Studio with JDK 21, then run:

```text
npm install
npm run native:open
```

Android Studio can run the app on a connected phone and generate signed APK/AAB release files. Every push affecting the Android app also creates a debug APK under GitHub **Actions → Build Android app**.

## Run locally

Serve this folder with any static web server, then open the local address in a browser. For example:

```sh
npx serve .
```

## Publishing

The workflow in `.github/workflows/deploy-pages.yml` publishes the site to GitHub Pages whenever the `main` branch is updated. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** if it is not selected automatically.

## Note

This timer supports a family's routine but is not medical guidance. Feeding needs vary; follow your baby's cues and your pediatric clinician's advice.

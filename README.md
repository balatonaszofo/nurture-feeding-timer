# Nurture Feeding Timer

A small, calming feeding timer that remembers the last feeding and automatically calculates the next one from your chosen interval.

## What it does

- Log a feeding with one tap
- Edit the feeding time if you forgot to log it immediately
- Choose a 2, 3, 4, or 5 hour routine—or enter a custom interval
- See a live countdown and approximate next feeding time
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

All feeding data stays in that browser on that device. It is not uploaded to a server or shared between devices.

## Run locally

Serve this folder with any static web server, then open the local address in a browser. For example:

```sh
npx serve .
```

## Publishing

The workflow in `.github/workflows/deploy-pages.yml` publishes the site to GitHub Pages whenever the `main` branch is updated. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** if it is not selected automatically.

## Note

This timer supports a family's routine but is not medical guidance. Feeding needs vary; follow your baby's cues and your pediatric clinician's advice.

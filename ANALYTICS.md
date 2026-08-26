# Nurture Day metrics

Nurture Day uses the Google Analytics 4 property already connected to its Firebase web app. Analytics runs only on `nurtureday.com` and `www.nurtureday.com`.

## See how many people visit

1. Open the [Firebase console](https://console.firebase.google.com/) and select the `nurtureday` project.
2. Open **Analytics**, then **Dashboard**.
3. Use **Active users** for the number of people who checked out the app. **New users** estimates first-time visitors, and **Views** counts total page loads.
4. For activity from the last 30 minutes, open **Analytics**, then **Realtime**.

Google Analytics reports can take up to 24 hours to populate after collection begins. Realtime usually begins showing visits within a few minutes.

## Privacy-scoped funnel events

The app records these events:

| Event | Meaning |
| --- | --- |
| `page_view` | Someone opened the public site. This is collected automatically. |
| `onboarding_started` | Someone tapped **Get started**. |
| `sign_in_selected` | Someone chose Google or guest access. |
| `nurture_app_opened` | The main tracker successfully opened. |

In Google Analytics, open **Reports**, then **Engagement**, then **Events** to see these counts. Comparing the events gives a simple visitor funnel from opening the site to reaching the tracker.

## Privacy boundaries

Analytics does not send names, email addresses, profile IDs, feeding or diaper records, notes, quantities, schedules, or timestamps from the care log. Advertising storage, Google Signals, and ad personalization are disabled. Local development and the GitHub Pages origin do not send analytics.

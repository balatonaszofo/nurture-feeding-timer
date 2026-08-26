const FIREBASE_VERSION = "12.17.1";

const EVENT_PARAMETERS = Object.freeze({
  onboarding_started: Object.freeze({}),
  sign_in_selected: Object.freeze({ method: new Set(["google", "guest"]) }),
  nurture_app_opened: Object.freeze({ access_mode: new Set(["google", "guest"]) })
});

let analyticsService = null;
let analyticsSdk = null;
const queuedEvents = [];

export function isProductionAnalyticsHost(hostname = "") {
  const normalized = String(hostname).trim().toLowerCase();
  return normalized === "nurtureday.com" || normalized === "www.nurtureday.com";
}

export function sanitizeAnalyticsEvent(name, parameters = {}) {
  const allowedParameters = EVENT_PARAMETERS[name];
  if (!allowedParameters) return null;
  const safeParameters = {};
  Object.entries(allowedParameters).forEach(([key, allowedValues]) => {
    const value = parameters[key];
    if (allowedValues.has(value)) safeParameters[key] = value;
  });
  return { name, parameters: safeParameters };
}

function sendEvent(event) {
  if (!analyticsService || !analyticsSdk) return false;
  analyticsSdk.logEvent(analyticsService, event.name, event.parameters);
  return true;
}

export function trackNurtureEvent(name, parameters = {}) {
  if (typeof window !== "undefined" && !isProductionAnalyticsHost(window.location.hostname)) return false;
  const event = sanitizeAnalyticsEvent(name, parameters);
  if (!event) return false;
  if (!sendEvent(event)) queuedEvents.push(event);
  return true;
}

export async function initializeNurtureAnalytics() {
  if (typeof window === "undefined" || !isProductionAnalyticsHost(window.location.hostname)) return false;
  const config = window.NURTURE_FIREBASE_CONFIG;
  if (!config?.measurementId || !config?.apiKey || !config?.appId || !config?.projectId) return false;

  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [appSdk, loadedAnalyticsSdk] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-analytics.js`)
    ]);
    if (!await loadedAnalyticsSdk.isSupported()) return false;

    const firebaseApp = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(config);
    analyticsSdk = loadedAnalyticsSdk;
    loadedAnalyticsSdk.setConsent({
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    analyticsService = loadedAnalyticsSdk.initializeAnalytics(firebaseApp, {
      config: {
        send_page_view: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false
      }
    });
    queuedEvents.splice(0).forEach(sendEvent);
    return true;
  } catch {
    analyticsService = null;
    analyticsSdk = null;
    queuedEvents.length = 0;
    return false;
  }
}

if (typeof window !== "undefined") void initializeNurtureAnalytics();

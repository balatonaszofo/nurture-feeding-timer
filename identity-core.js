export const LEGACY_STORAGE_KEY = "nurture-feeding-state";
export const LEGACY_MIGRATED_KEY = "nurture-legacy-profile-migration";
export const ACTIVE_PROFILE_KEY = "nurture-active-profile";
export const LOCAL_PROFILE_KEY = "nurture-local-profile-id";

export function safeParseState(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function profileStorageKey(profileId) {
  return `${LEGACY_STORAGE_KEY}:${profileId}`;
}

export function isFirebaseConfigured(config) {
  if (!config || typeof config !== "object") return false;
  return ["apiKey", "authDomain", "projectId", "appId"].every(key => {
    const value = String(config[key] || "").trim();
    return value && !value.includes("YOUR_");
  });
}

export function friendlyCloudError(error) {
  const code = String(error?.code || "").toLowerCase();
  if (code.endsWith("permission-denied")) return "Cloud permission needs setup · publish Firestore rules";
  if (code.endsWith("unauthenticated")) return "Cloud session expired · sign in again";
  if (code.endsWith("failed-precondition") || code.endsWith("not-found")) return "Cloud database setup is incomplete";
  if (code.endsWith("unavailable") || code.endsWith("deadline-exceeded") || code.includes("network")) return "Cloud is temporarily unavailable · tap Retry";
  return "Saved on this device · tap Retry for cloud backup";
}

export function createLocalProfileId(storage, randomUUID) {
  const existing = storage.getItem(LOCAL_PROFILE_KEY);
  if (existing) return existing;
  const generated = randomUUID ? randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const profileId = `local-${generated}`;
  storage.setItem(LOCAL_PROFILE_KEY, profileId);
  return profileId;
}

export function migrateLegacyState(storage, targetKey) {
  if (storage.getItem(targetKey)) {
    if (storage.getItem(LEGACY_STORAGE_KEY) && !storage.getItem(LEGACY_MIGRATED_KEY)) storage.setItem(LEGACY_MIGRATED_KEY, targetKey);
    return safeParseState(storage.getItem(targetKey));
  }
  if (storage.getItem(LEGACY_MIGRATED_KEY)) return {};
  const legacy = storage.getItem(LEGACY_STORAGE_KEY);
  if (legacy) {
    storage.setItem(targetKey, legacy);
    storage.setItem(LEGACY_MIGRATED_KEY, targetKey);
  }
  return safeParseState(legacy);
}

function validDates(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(value => {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
  }))].sort((a, b) => new Date(a) - new Date(b));
}

function mergeSessions(primary, secondary) {
  const sessions = new Map();
  [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])].forEach(session => {
    if (!session?.startAt || Number.isNaN(new Date(session.startAt).getTime())) return;
    const current = sessions.get(session.startAt);
    const candidateEnd = session.endAt && !Number.isNaN(new Date(session.endAt).getTime()) ? session.endAt : null;
    if (!current || (!current.endAt && candidateEnd)) sessions.set(session.startAt, { startAt: session.startAt, endAt: candidateEnd });
  });
  return [...sessions.values()].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
}

function newestDate(values) {
  return validDates(values).at(-1) || null;
}

export function mergeCareStates(primary = {}, secondary = {}) {
  const first = primary && typeof primary === "object" ? primary : {};
  const second = secondary && typeof secondary === "object" ? secondary : {};
  const feedingHistory = validDates([
    ...(first.feedingHistory || []), first.lastFeeding,
    ...(second.feedingHistory || []), second.lastFeeding
  ].filter(Boolean));
  const diaperHistory = validDates([...(first.diaperHistory || []), ...(second.diaperHistory || [])]);
  const merged = {
    ...first,
    ...second,
    intervalHours: Number(second.intervalHours) || Number(first.intervalHours) || 3,
    lastFeeding: newestDate(feedingHistory),
    feedingHistory,
    feedingSessions: mergeSessions(first.feedingSessions, second.feedingSessions),
    feedingDetails: { ...(first.feedingDetails || {}), ...(second.feedingDetails || {}) },
    diaperHistory,
    diaperDetails: { ...(first.diaperDetails || {}), ...(second.diaperDetails || {}) },
    darkMode: typeof second.darkMode === "boolean" ? second.darkMode : first.darkMode === true,
    alarmEnabled: typeof second.alarmEnabled === "boolean" ? second.alarmEnabled : first.alarmEnabled === true,
    lastAlarmedFor: second.lastAlarmedFor || first.lastAlarmedFor || null
  };
  return merged;
}

export function hasCareData(state) {
  return Boolean(
    state && (
      (Array.isArray(state.feedingHistory) && state.feedingHistory.length) ||
      (Array.isArray(state.diaperHistory) && state.diaperHistory.length) ||
      state.lastFeeding
    )
  );
}

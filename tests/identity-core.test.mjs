import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LEGACY_STORAGE_KEY,
  createLocalProfileId,
  friendlyCloudError,
  isFirebaseConfigured,
  mergeCareStates,
  migrateLegacyState,
  profileStorageKey
} from "../identity-core.js";

function memoryStorage(values = {}) {
  const data = new Map(Object.entries(values));
  return {
    getItem(key) { return data.get(key) || null; },
    setItem(key, value) { data.set(key, String(value)); },
    snapshot() { return Object.fromEntries(data); }
  };
}

test("profile storage keys isolate each identity", () => {
  assert.notEqual(profileStorageKey("firebase-user-a"), profileStorageKey("firebase-user-b"));
  assert.notEqual(profileStorageKey("local-browser-a"), LEGACY_STORAGE_KEY);
});

test("a legacy care log migrates into the first private profile", () => {
  const legacyState = JSON.stringify({ feedingHistory: ["2026-08-20T18:00:00.000Z"] });
  const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: legacyState });
  const target = profileStorageKey("local-browser-a");

  const migrated = migrateLegacyState(storage, target);

  assert.deepEqual(migrated.feedingHistory, ["2026-08-20T18:00:00.000Z"]);
  assert.equal(storage.snapshot()[target], legacyState);
  assert.equal(migrateLegacyState(storage, profileStorageKey("another-profile")).feedingHistory, undefined);
});

test("local guest identity remains stable in the same browser", () => {
  const storage = memoryStorage();
  const first = createLocalProfileId(storage, () => "fixed-id");
  const second = createLocalProfileId(storage, () => "different-id");
  assert.equal(first, "local-fixed-id");
  assert.equal(second, first);
});

test("cloud and device care logs merge without losing either person's own events", () => {
  const firstFeed = "2026-08-20T17:00:00.000Z";
  const secondFeed = "2026-08-20T20:00:00.000Z";
  const diaper = "2026-08-20T18:30:00.000Z";
  const merged = mergeCareStates({
    feedingHistory: [firstFeed],
    feedingSessions: [{ startAt: firstFeed, endAt: null }],
    feedingDetails: { [firstFeed]: { kind: "planned" } }
  }, {
    feedingHistory: [secondFeed],
    feedingSessions: [{ startAt: firstFeed, endAt: "2026-08-20T17:20:00.000Z" }],
    diaperHistory: [diaper],
    diaperDetails: { [diaper]: { type: "pee" } }
  });

  assert.deepEqual(merged.feedingHistory, [firstFeed, secondFeed]);
  assert.equal(merged.lastFeeding, secondFeed);
  assert.equal(merged.feedingSessions[0].endAt, "2026-08-20T17:20:00.000Z");
  assert.equal(merged.feedingDetails[firstFeed].kind, "planned");
  assert.equal(merged.diaperDetails[diaper].type, "pee");
});

test("new profiles default to dark without overriding an explicit light choice", () => {
  assert.equal(mergeCareStates({}, {}).darkMode, true);
  assert.equal(mergeCareStates({ darkMode: false }, {}).darkMode, false);
  assert.equal(mergeCareStates({ darkMode: true }, { darkMode: false }).darkMode, false);
});

test("Firebase connection requires the complete public web config", () => {
  assert.equal(isFirebaseConfigured({}), false);
  assert.equal(isFirebaseConfigured({ apiKey: "YOUR_KEY", authDomain: "x", projectId: "x", appId: "x" }), false);
  assert.equal(isFirebaseConfigured({ apiKey: "key", authDomain: "project.firebaseapp.com", projectId: "project", appId: "app" }), true);
});

test("cloud sync errors distinguish setup problems from temporary outages", () => {
  assert.match(friendlyCloudError({ code: "permission-denied" }), /publish Firestore rules/);
  assert.match(friendlyCloudError({ code: "firestore\/unavailable" }), /temporarily unavailable/);
  assert.match(friendlyCloudError({ code: "unauthenticated" }), /sign in again/);
});

test("Firestore rules bind every profile document to its authenticated UID", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(rules, /match \/\{document=\*\*\}[\s\S]*allow read, write: if false/);
  assert.match(rules, /allow delete: if false/);
});

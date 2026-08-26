import assert from "node:assert/strict";
import test from "node:test";

import {
  isProductionAnalyticsHost,
  sanitizeAnalyticsEvent
} from "../analytics.js";

test("analytics runs only on the public Nurture Day domain", () => {
  assert.equal(isProductionAnalyticsHost("nurtureday.com"), true);
  assert.equal(isProductionAnalyticsHost("www.nurtureday.com"), true);
  assert.equal(isProductionAnalyticsHost("localhost"), false);
  assert.equal(isProductionAnalyticsHost("balatonaszofo.github.io"), false);
});

test("analytics accepts only privacy-scoped funnel events and approved values", () => {
  assert.deepEqual(sanitizeAnalyticsEvent("onboarding_started", { notes: "private" }), {
    name: "onboarding_started",
    parameters: {}
  });
  assert.deepEqual(sanitizeAnalyticsEvent("sign_in_selected", { method: "google", email: "private@example.com" }), {
    name: "sign_in_selected",
    parameters: { method: "google" }
  });
  assert.deepEqual(sanitizeAnalyticsEvent("nurture_app_opened", { access_mode: "guest", feedingCount: 4 }), {
    name: "nurture_app_opened",
    parameters: { access_mode: "guest" }
  });
  assert.equal(sanitizeAnalyticsEvent("feeding_logged", { amount: 90 }), null);
});

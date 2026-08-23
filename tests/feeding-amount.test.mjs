import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("feeding amount uses an exact numeric stepper instead of a range slider", () => {
  assert.match(page, /id="feeding-amount" type="number"/);
  assert.doesNotMatch(page, /id="feeding-amount"[^>]+type="range"/);
  assert.match(page, /id="feeding-amount-decrease"/);
  assert.match(page, /id="feeding-amount-increase"/);
  assert.match(page, /id="feeding-amount-clear"/);
  assert.match(page, /id="feeding-amount-readout" class="sr-only"/);
  assert.match(app, /function adjustFeedingAmount\(direction\)/);
});

test("a feeding without an amount starts with the most recently recorded amount", () => {
  assert.match(app, /function findRecentFeedingAmount\(excludedStartAt\)/);
  assert.match(app, /const recentAmount = findRecentFeedingAmount\(selectedFeedingStart\)/);
  assert.match(app, /details\.amountUnit \|\| recentAmount\?\.amountUnit \|\| amountUnitPreference/);
  assert.match(app, /details\.amount \|\| recentAmount\?\.amount \|\| 0/);
});

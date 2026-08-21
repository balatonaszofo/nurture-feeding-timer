import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function makeElement() {
  return {
    classList: { toggle() {} },
    dataset: {},
    disabled: false,
    hidden: false,
    style: {},
    textContent: "",
    value: "",
    addEventListener() {},
    append() {},
    click() {},
    close() {},
    remove() {},
    replaceChildren() {},
    setAttribute() {},
    showModal() {}
  };
}

function loadApp(savedState, navigatorOverrides = {}) {
  const elements = new Map();
  const getElement = selector => {
    if (!elements.has(selector)) elements.set(selector, makeElement());
    return elements.get(selector);
  };
  const document = {
    body: { append() {} },
    documentElement: { dataset: {} },
    addEventListener() {},
    createElement: makeElement,
    querySelector: getElement,
    querySelectorAll() { return []; }
  };
  const storage = new Map([["nurture-feeding-state", JSON.stringify(savedState)]]);
  const context = {
    Blob,
    Date,
    File,
    Intl,
    Map,
    Math,
    Set,
    URL,
    console,
    document,
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); }
    },
    navigator: navigatorOverrides,
    setInterval() {},
    setTimeout,
    window: { NURTURE_PUSH_SERVER: "", addEventListener() {} }
  };
  vm.runInNewContext(readFileSync(new URL("../app.js", import.meta.url), "utf8"), context);
  return context;
}

test("care log CSV combines chronological feeding and diaper details", () => {
  const diaperAt = "2026-08-20T17:00:00.000Z";
  const feedingAt = "2026-08-20T18:00:00.000Z";
  const feedingEnd = "2026-08-20T18:42:30.000Z";
  const app = loadApp({
    feedingHistory: [feedingAt],
    feedingSessions: [{ startAt: feedingAt, endAt: feedingEnd }],
    feedingDetails: {
      [feedingAt]: { kind: "top-off", milk: "formula", notes: "=SUM(1,2)" }
    },
    diaperHistory: [diaperAt],
    diaperDetails: { [diaperAt]: { type: "both" } }
  });

  const csv = app.buildCareLogCsv();
  assert.match(csv, /^"Date","Time","Event"/);
  assert.ok(csv.indexOf('"Diaper change"') < csv.indexOf('"Feeding"'));
  assert.match(csv, /"Top-off","Formula","Completed"/);
  assert.match(csv, /"42\.5","'=SUM\(1,2\)"/);
  assert.match(csv, /"Pee \+ poo"/);
});

test("care log CSV preserves an untracked feeding", () => {
  const feedingAt = "2026-08-20T18:00:00.000Z";
  const app = loadApp({ feedingHistory: [feedingAt] });
  const csv = app.buildCareLogCsv();

  assert.match(csv, /"Feeding","","","Not tracked","","","","",""/);
});

test("export uses the phone share sheet when file sharing is supported", async () => {
  const feedingAt = "2026-08-20T18:00:00.000Z";
  let sharedPayload;
  const app = loadApp({ feedingHistory: [feedingAt] }, {
    canShare({ files }) { return files.length === 1; },
    async share(payload) { sharedPayload = payload; }
  });

  await app.exportCareLog();

  assert.equal(sharedPayload.files.length, 1);
  assert.match(sharedPayload.files[0].name, /^nurture-care-log-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.equal(sharedPayload.files[0].type, "text/csv;charset=utf-8");
  assert.match(await sharedPayload.files[0].text(), /"Feeding"/);
});

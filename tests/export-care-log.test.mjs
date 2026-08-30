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

test("care log CSV combines chronological feeding, diaper, and head-position details", () => {
  const diaperAt = "2026-08-20T17:00:00.000Z";
  const headPositionAt = "2026-08-20T17:30:00.000Z";
  const feedingAt = "2026-08-20T18:00:00.000Z";
  const feedingEnd = "2026-08-20T18:42:30.000Z";
  const app = loadApp({
    feedingHistory: [feedingAt],
    feedingSessions: [{ startAt: feedingAt, endAt: feedingEnd }],
    feedingDetails: {
      [feedingAt]: { kind: "top-off", milk: "formula", amount: 2.5, amountUnit: "oz", notes: "=SUM(1,2)" }
    },
    diaperHistory: [diaperAt],
    diaperDetails: { [diaperAt]: { type: "both" } },
    headPositionHistory: [headPositionAt],
    headPositionDetails: { [headPositionAt]: { position: "left" } }
  });

  const csv = app.buildCareLogCsv();
  assert.match(csv, /^"Date","Time","Event"/);
  assert.ok(csv.indexOf('"Diaper change"') < csv.indexOf('"Feeding"'));
  assert.ok(csv.indexOf('"Head position"') < csv.indexOf('"Feeding"'));
  assert.match(csv, /"Top-off","Formula","2\.5","oz","Completed"/);
  assert.match(csv, /"42\.5","'=SUM\(1,2\)"/);
  assert.match(csv, /"Pee \+ poo"/);
  assert.match(csv, /"Head position".*"Left"/);
});

test("care log CSV preserves an untracked feeding", () => {
  const feedingAt = "2026-08-20T18:00:00.000Z";
  const app = loadApp({ feedingHistory: [feedingAt] });
  const csv = app.buildCareLogCsv();

  assert.match(csv, /"Feeding","","","","","Not tracked","","","","",""/);
});

test("a Nurture CSV backup restores feeding details, sessions, and diapers", () => {
  const app = loadApp({});
  const csv = [
    '"Date","Time","Event","Feeding type","Milk type","Amount","Amount unit","Session status","End date","End time","Duration (minutes)","Notes","Diaper contents"',
    '"2026-08-20","11:30","Feeding","Top-off","Formula","90","mL","Completed","2026-08-20","11:45","15","A ""small"" top-off",""',
    '"2026-08-20","12:10","Diaper change","","","","","","","","","","Pee + poo"'
  ].join("\r\n");

  const restored = app.parseCareLogCsv(csv);

  assert.equal(restored.feedingHistory.length, 1);
  assert.equal(restored.diaperHistory.length, 1);
  const feedingAt = restored.feedingHistory[0];
  assert.deepEqual({ ...restored.feedingDetails[feedingAt] }, { kind: "top-off", milk: "formula", amount: 90, amountUnit: "ml", notes: 'A "small" top-off' });
  assert.ok(restored.feedingSessions[0].endAt);
  assert.equal(restored.diaperDetails[restored.diaperHistory[0]].type, "both");
});

test("a Nurture CSV backup restores head positions and accepts centered as back", () => {
  const app = loadApp({});
  const csv = [
    '"Date","Time","Event","Feeding type","Milk type","Amount","Amount unit","Session status","End date","End time","Duration (minutes)","Notes","Diaper contents","Head position"',
    '"2026-08-20","12:30","Head position","","","","","","","","","","","Left"',
    '"2026-08-20","13:15","Head position","","","","","","","","","","","Centered"'
  ].join("\r\n");

  const restored = app.parseCareLogCsv(csv);

  assert.equal(restored.headPositionHistory.length, 2);
  assert.equal(restored.headPositionDetails[restored.headPositionHistory[0]].position, "left");
  assert.equal(restored.headPositionDetails[restored.headPositionHistory[1]].position, "back");
});

test("a timed head position preserves its completed duration through CSV", () => {
  const app = loadApp({});
  const started = new Date("2026-08-20T18:00:00.000Z");
  const ended = new Date("2026-08-20T18:15:00.000Z");

  app.logHeadPosition(started, "right");
  app.stopHeadPosition(ended);
  const csv = app.buildCareLogCsv();
  const restored = app.parseCareLogCsv(csv);
  const loggedAt = restored.headPositionHistory[0];

  assert.match(csv, /"Head position"[^\r\n]*"Completed"[^\r\n]*"15"[^\r\n]*"Right"/);
  assert.equal(restored.headPositionDetails[loggedAt].position, "right");
  assert.equal(restored.headPositionDetails[loggedAt].endAt, ended.toISOString());
});

test("switching head position closes the previous timer and starts the next", () => {
  const app = loadApp({});
  app.logHeadPosition(new Date("2026-08-20T18:00:00.000Z"), "left");
  app.logHeadPosition(new Date("2026-08-20T18:10:00.000Z"), "right");
  app.stopHeadPosition(new Date("2026-08-20T18:25:00.000Z"));

  const restored = app.parseCareLogCsv(app.buildCareLogCsv());
  const [leftAt, rightAt] = restored.headPositionHistory;

  assert.equal(restored.headPositionDetails[leftAt].endAt, rightAt);
  assert.equal(new Date(restored.headPositionDetails[rightAt].endAt) - new Date(rightAt), 15 * 60000);
});

test("restoring the same CSV deduplicates its event timestamps", () => {
  const app = loadApp({});
  const csv = [
    '"Date","Time","Event","Feeding type","Milk type","Session status","End date","End time","Duration (minutes)","Notes","Diaper contents"',
    '"2026-08-20","11:30","Feeding","Planned","Breast milk","Not tracked","","","","",""',
    '"2026-08-20","11:30","Feeding","Planned","Breast milk","Not tracked","","","","",""'
  ].join("\n");

  assert.equal(app.parseCareLogCsv(csv).feedingHistory.length, 1);
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
  assert.match(sharedPayload.files[0].name, /^nurture-day-care-log-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.equal(sharedPayload.files[0].type, "text/csv");
  assert.match(await sharedPayload.files[0].text(), /"Feeding"/);
});

const STORAGE_KEY = window.NURTURE_STORAGE_KEY || "nurture-feeding-state";
const PUSH_DEVICE_KEY = `nurture-push-device-id:${window.NURTURE_PROFILE_ID || "legacy"}`;
const PUSH_SERVER = String(window.NURTURE_PUSH_SERVER || "").replace(/\/$/, "");
const state = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
})();
let intervalHours = Number(state.intervalHours) || 3;
let darkMode = state.darkMode !== false;
let amountUnitPreference = state.amountUnitPreference === "ml" ? "ml" : "oz";
let feedingAmountUnit = amountUnitPreference;
document.documentElement.dataset.theme = darkMode ? "dark" : "light";
const storedFeedings = Array.isArray(state.feedingHistory) ? state.feedingHistory : [];
let feedingHistory = [...new Set([...storedFeedings, state.lastFeeding].filter(value => {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}))].sort((a, b) => new Date(a) - new Date(b));
const storedFeedingSessions = Array.isArray(state.feedingSessions) ? state.feedingSessions : [];
let feedingSessions = storedFeedingSessions.map(session => ({
  startAt: session?.startAt,
  endAt: session?.endAt || null
})).filter(session => {
  if (!session.startAt || Number.isNaN(new Date(session.startAt).getTime())) return false;
  return !session.endAt || !Number.isNaN(new Date(session.endAt).getTime());
}).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
const feedingDetails = {};
const storedFeedingDetails = state.feedingDetails && typeof state.feedingDetails === "object" && !Array.isArray(state.feedingDetails) ? state.feedingDetails : {};
Object.entries(storedFeedingDetails).forEach(([startAt, details]) => {
  if (Number.isNaN(new Date(startAt).getTime()) || !details || typeof details !== "object") return;
  const kind = ["planned", "top-off"].includes(details.kind) ? details.kind : null;
  const milk = ["breast-milk", "formula"].includes(details.milk) ? details.milk : null;
  const amountUnit = ["oz", "ml"].includes(details.amountUnit) ? details.amountUnit : null;
  const amountValue = Number(details.amount);
  const amountMaximum = amountUnit === "oz" ? 12 : 360;
  const amount = amountUnit && amountValue > 0 && amountValue <= amountMaximum ? amountValue : null;
  const notes = typeof details.notes === "string" ? details.notes.trim().slice(0, 500) : "";
  if (kind || milk || amount || notes) feedingDetails[startAt] = { kind, milk, amount, amountUnit: amount ? amountUnit : null, notes };
});
const storedDiapers = Array.isArray(state.diaperHistory) ? state.diaperHistory : [];
let diaperHistory = [...new Set(storedDiapers.filter(value => {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}))].sort((a, b) => new Date(a) - new Date(b));
const diaperDetails = {};
const storedDiaperDetails = state.diaperDetails && typeof state.diaperDetails === "object" && !Array.isArray(state.diaperDetails) ? state.diaperDetails : {};
Object.entries(storedDiaperDetails).forEach(([changedAt, details]) => {
  if (Number.isNaN(new Date(changedAt).getTime()) || !details || typeof details !== "object") return;
  if (["pee", "poo", "both"].includes(details.type)) diaperDetails[changedAt] = { type: details.type };
});
const storedHeadPositions = Array.isArray(state.headPositionHistory) ? state.headPositionHistory : [];
let headPositionHistory = [...new Set(storedHeadPositions.filter(value => {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}))].sort((a, b) => new Date(a) - new Date(b));
const headPositionDetails = {};
const storedHeadPositionDetails = state.headPositionDetails && typeof state.headPositionDetails === "object" && !Array.isArray(state.headPositionDetails) ? state.headPositionDetails : {};
Object.entries(storedHeadPositionDetails).forEach(([loggedAt, details]) => {
  if (Number.isNaN(new Date(loggedAt).getTime()) || !details || typeof details !== "object") return;
  if (["left", "right", "back"].includes(details.position)) headPositionDetails[loggedAt] = { position: details.position };
});
let lastFeeding = feedingHistory.length ? new Date(feedingHistory[feedingHistory.length - 1]) : null;
let alarmEnabled = state.alarmEnabled === true;
let lastAlarmedFor = state.lastAlarmedFor || null;
let alarmAudioContext = null;
let editingExistingFeeding = false;
let selectedFeedingStart = null;
let pushConnected = false;

const $ = (selector) => document.querySelector(selector);
const countdown = $("#countdown");
const countdownDuration = $("#countdown-duration");
const countdownMessage = $("#countdown-message");
const countdownHours = $("#countdown-hours");
const countdownMinutes = $("#countdown-minutes");
const nextTime = $("#next-time");
const lastFed = $("#last-fed");
const feedNow = $("#feed-now");
const feedButtonLabel = $("#feed-button-label");
const feedingSessionControls = $("#feeding-session-controls");
const sessionElapsed = $("#session-elapsed");
const latestFeedingDetails = $("#latest-feeding-details");
const timerLabel = $("#timer-label");
const progressBar = $("#progress-bar");
const progressCopy = $("#progress-copy");
const dialog = $("#time-dialog");
const timeInput = $("#feeding-time");
const alarmToggle = $("#alarm-toggle");
const alarmStatus = $("#alarm-status");
const testAlarm = $("#test-alarm");
const historyDialog = $("#history-dialog");
const feedingTimetable = $("#feeding-timetable");
const feedingDetailsDialog = $("#feeding-details-dialog");
const feedingDetailsForm = $("#feeding-details-form");
const feedingAmount = $("#feeding-amount");
const feedingAmountReadout = $("#feeding-amount-readout");
const feedingAmountUnitLabel = $("#feeding-amount-unit-label");
const feedingAmountStep = $("#feeding-amount-step");
const feedingAmountDecrease = $("#feeding-amount-decrease");
const feedingAmountIncrease = $("#feeding-amount-increase");
const feedingAmountClear = $("#feeding-amount-clear");
const feedingAmountUnitButtons = document.querySelectorAll("[data-amount-unit]");
const diaperHistoryDialog = $("#diaper-history-dialog");
const diaperTimetable = $("#diaper-timetable");
const undoDiaper = $("#undo-diaper");
const diaperLogDialog = $("#diaper-log-dialog");
const diaperLogForm = $("#diaper-log-form");
const headPositionHistoryDialog = $("#head-position-history-dialog");
const headPositionTimetable = $("#head-position-timetable");
const undoHeadPosition = $("#undo-head-position");
const headPositionLogDialog = $("#head-position-log-dialog");
const headPositionLogForm = $("#head-position-log-form");
const darkModeToggle = $("#dark-mode-toggle");
const exportCareLogButton = $("#export-care-log");
const exportStatus = $("#export-status");
const exportDialog = $("#export-dialog");
const exportGoogleSheetsButton = $("#export-google-sheets");
const downloadCareLogButton = $("#download-care-log");
const importCareLogButton = $("#import-care-log");
const importCareLogFile = $("#import-care-log-file");
const importStatus = $("#import-status");

function save() {
  const stateToSave = {
    intervalHours,
    lastFeeding: lastFeeding?.toISOString() || null,
    feedingHistory,
    feedingSessions,
    feedingDetails,
    diaperHistory,
    diaperDetails,
    headPositionHistory,
    headPositionDetails,
    darkMode,
    amountUnitPreference,
    alarmEnabled,
    lastAlarmedFor
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  window.NURTURE_CLOUD?.scheduleSave(stateToSave);
}

function getDurationParts(ms) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

function showDuration(ms, subject = "the next feeding") {
  const { hours, minutes } = getDurationParts(ms);
  countdownDuration.hidden = false;
  countdownMessage.hidden = true;
  countdownHours.textContent = hours;
  countdownMinutes.textContent = String(minutes).padStart(2, "0");
  countdown.setAttribute("aria-label", `${hours} ${hours === 1 ? "hour" : "hours"} and ${minutes} ${minutes === 1 ? "minute" : "minutes"} until ${subject}`);
}

function showCountdownMessage(message) {
  countdownDuration.hidden = true;
  countdownMessage.hidden = false;
  countdownMessage.textContent = message;
  countdown.setAttribute("aria-label", message);
}

function formatTime(date) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

function getPushDeviceId() {
  let deviceId = localStorage.getItem(PUSH_DEVICE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(PUSH_DEVICE_KEY, deviceId);
  }
  return deviceId;
}

function decodeVapidKey(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}

async function cancelPushReminder() {
  if (window.NURTURE_NATIVE?.isNative) {
    try {
      await window.NURTURE_NATIVE.cancelReminder();
    } finally {
      pushConnected = false;
    }
    return;
  }
  if (!PUSH_SERVER) return;
  try {
    await fetch(`${PUSH_SERVER}/api/reminders/${getPushDeviceId()}`, { method: "DELETE" });
  } catch {
    // A stale reminder expires automatically on the server after its due time.
  }
  pushConnected = false;
}

async function syncPushReminder() {
  const scheduleAnchor = getScheduleAnchorFeeding();
  if (window.NURTURE_NATIVE?.isNative) {
    if (!alarmEnabled || !scheduleAnchor) {
      await cancelPushReminder();
      return false;
    }
    const dueAt = new Date(scheduleAnchor.getTime() + intervalHours * 3600000);
    try {
      pushConnected = await window.NURTURE_NATIVE.scheduleReminder(dueAt.toISOString());
      updateAlarmUI(pushConnected ? "" : "On · allow notifications to receive background alarms");
      return pushConnected;
    } catch {
      pushConnected = false;
      updateAlarmUI("On · native alarm could not be scheduled");
      return false;
    }
  }
  if (!PUSH_SERVER || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (!alarmEnabled || !scheduleAnchor) {
    await cancelPushReminder();
    return false;
  }
  const dueAt = new Date(scheduleAnchor.getTime() + intervalHours * 3600000);
  if (dueAt <= new Date() || !("Notification" in window) || Notification.permission !== "granted") {
    await cancelPushReminder();
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const configResponse = await fetch(`${PUSH_SERVER}/api/config`);
      if (!configResponse.ok) throw new Error("Push configuration unavailable");
      const { vapidPublicKey } = await configResponse.json();
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(vapidPublicKey)
      });
    }
    const response = await fetch(`${PUSH_SERVER}/api/reminders/${getPushDeviceId()}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription, dueAt: dueAt.toISOString() })
    });
    if (!response.ok) throw new Error("Reminder schedule rejected");
    pushConnected = true;
    updateAlarmUI();
    return true;
  } catch {
    pushConnected = false;
    updateAlarmUI("On · background service unavailable; keep Nurture Day active");
    return false;
  }
}

function localDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatGap(ms) {
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min after previous`;
  if (!minutes) return `${hours} hr after previous`;
  return `${hours} hr ${minutes} min after previous`;
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours} hr ${minutes} min ${seconds} sec`;
  if (minutes) return `${minutes} min ${seconds} sec`;
  return `${seconds} sec`;
}

function formatSessionDuration(ms) {
  if (ms < 60000) return "Under 1 min";
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

function getActiveFeedingSession() {
  return [...feedingSessions].reverse().find(session => !session.endAt) || null;
}

function getScheduleAnchorFeeding() {
  for (let index = feedingHistory.length - 1; index >= 0; index -= 1) {
    const startAt = feedingHistory[index];
    if (feedingDetails[startAt]?.kind !== "top-off") return new Date(startAt);
  }
  return lastFeeding;
}

function hasFeedingDetails(startAt) {
  const details = feedingDetails[startAt];
  return Boolean(details && (details.kind || details.milk || details.amount || details.notes));
}

function feedingKindLabel(value) {
  return value === "planned" ? "Planned" : value === "top-off" ? "Top-off" : "";
}

function milkKindLabel(value) {
  return value === "breast-milk" ? "Breast milk" : value === "formula" ? "Formula" : "";
}

function feedingAmountLabel(details) {
  const amount = Number(details?.amount);
  if (!(amount > 0) || !["oz", "ml"].includes(details?.amountUnit)) return "";
  const value = details.amountUnit === "oz" && !Number.isInteger(amount)
    ? amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
    : String(Math.round(amount));
  return `${value} ${details.amountUnit === "ml" ? "mL" : "oz"}`;
}

function updateFeedingAmountReadout() {
  const amount = Number(feedingAmount.value);
  feedingAmountReadout.textContent = amount > 0 ? feedingAmountLabel({ amount, amountUnit: feedingAmountUnit }) : "Not recorded";
  feedingAmountDecrease.disabled = !(amount > 0);
  feedingAmountIncrease.disabled = amount >= Number(feedingAmount.max);
  feedingAmountClear.disabled = !(amount > 0);
}

function configureFeedingAmount(unit, value = 0) {
  feedingAmountUnit = unit === "ml" ? "ml" : "oz";
  feedingAmount.max = feedingAmountUnit === "ml" ? "360" : "12";
  feedingAmount.step = "any";
  const amount = Math.min(Number(feedingAmount.max), Math.max(0, Number(value) || 0));
  feedingAmount.value = amount > 0 ? String(amount) : "";
  feedingAmountUnitLabel.textContent = feedingAmountUnit === "ml" ? "mL" : "oz";
  feedingAmountStep.textContent = feedingAmountUnit === "ml" ? "Buttons adjust by 5 mL" : "Buttons adjust by 0.5 oz";
  feedingAmountUnitButtons.forEach(button => button.setAttribute("aria-checked", String(button.dataset.amountUnit === feedingAmountUnit)));
  updateFeedingAmountReadout();
}

function adjustFeedingAmount(direction) {
  const step = feedingAmountUnit === "ml" ? 5 : 0.5;
  const maximum = Number(feedingAmount.max);
  const current = Number(feedingAmount.value) || 0;
  const next = Math.min(maximum, Math.max(0, current + direction * step));
  feedingAmount.value = String(Math.round(next * 100) / 100);
  updateFeedingAmountReadout();
}

function normalizeFeedingAmountInput() {
  const amount = Number(feedingAmount.value);
  if (!(amount > 0)) {
    feedingAmount.value = "";
  } else {
    feedingAmount.value = String(Math.min(Number(feedingAmount.max), amount));
  }
  updateFeedingAmountReadout();
}

function findRecentFeedingAmount(excludedStartAt) {
  for (let index = feedingHistory.length - 1; index >= 0; index -= 1) {
    const startAt = feedingHistory[index];
    if (startAt === excludedStartAt) continue;
    const details = feedingDetails[startAt];
    if (Number(details?.amount) > 0 && ["oz", "ml"].includes(details?.amountUnit)) {
      return { amount: Number(details.amount), amountUnit: details.amountUnit };
    }
  }
  return null;
}

function changeFeedingAmountUnit(nextUnit) {
  if (nextUnit === feedingAmountUnit) return;
  const currentAmount = Number(feedingAmount.value);
  if (!(currentAmount > 0)) {
    configureFeedingAmount(nextUnit, 0);
    return;
  }
  const converted = nextUnit === "ml"
    ? Math.round((currentAmount * 29.5735) / 5) * 5
    : Math.round((currentAmount / 29.5735) * 2) / 2;
  configureFeedingAmount(nextUnit, converted);
}

function diaperTypeLabel(value) {
  return value === "pee" ? "Pee" : value === "poo" ? "Poo" : value === "both" ? "Pee + poo" : "Type not recorded";
}

function headPositionLabel(value) {
  return value === "left" ? "Left" : value === "right" ? "Right" : value === "back" ? "Back / centered" : "Position not recorded";
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeValue(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCareLogCsv() {
  const sessionsByStart = new Map(feedingSessions.map(session => [session.startAt, session]));
  const events = [];

  feedingHistory.forEach(startAt => {
    const started = new Date(startAt);
    if (Number.isNaN(started.getTime())) return;
    const metadata = feedingDetails[startAt] || {};
    const session = sessionsByStart.get(startAt);
    let ended = null;
    let sessionStatus = "Not tracked";
    let durationMinutes = "";
    if (session) {
      ended = session.endAt ? new Date(session.endAt) : null;
      const durationEnd = ended && !Number.isNaN(ended.getTime()) ? ended : new Date();
      durationMinutes = Math.max(0, Math.round((durationEnd - started) / 6000) / 10);
      sessionStatus = ended && !Number.isNaN(ended.getTime()) ? "Completed" : "In progress";
    }
    events.push({
      timestamp: started.getTime(),
      cells: [
        localDateValue(started), localTimeValue(started), "Feeding",
        feedingKindLabel(metadata.kind), milkKindLabel(metadata.milk), metadata.amount || "",
        metadata.amount ? (metadata.amountUnit === "ml" ? "mL" : "oz") : "", sessionStatus,
        ended && !Number.isNaN(ended.getTime()) ? localDateValue(ended) : "",
        ended && !Number.isNaN(ended.getTime()) ? localTimeValue(ended) : "",
        durationMinutes, metadata.notes || "", "", ""
      ]
    });
  });

  diaperHistory.forEach(changedAt => {
    const changed = new Date(changedAt);
    if (Number.isNaN(changed.getTime())) return;
    events.push({
      timestamp: changed.getTime(),
      cells: [
        localDateValue(changed), localTimeValue(changed), "Diaper change",
        "", "", "", "", "", "", "", "", "", diaperTypeLabel(diaperDetails[changedAt]?.type), ""
      ]
    });
  });

  headPositionHistory.forEach(loggedAt => {
    const logged = new Date(loggedAt);
    if (Number.isNaN(logged.getTime())) return;
    events.push({
      timestamp: logged.getTime(),
      cells: [
        localDateValue(logged), localTimeValue(logged), "Head position",
        "", "", "", "", "", "", "", "", "", "", headPositionLabel(headPositionDetails[loggedAt]?.position)
      ]
    });
  });

  events.sort((a, b) => a.timestamp - b.timestamp);
  const headings = [
    "Date", "Time", "Event", "Feeding type", "Milk type", "Amount", "Amount unit", "Session status",
    "End date", "End time", "Duration (minutes)", "Notes", "Diaper contents", "Head position"
  ];
  return [headings, ...events.map(event => event.cells)].map(row => row.map(csvCell).join(",")).join("\r\n");
}

function updateExportAvailability() {
  const isEmpty = !feedingHistory.length && !diaperHistory.length && !headPositionHistory.length;
  exportCareLogButton.disabled = isEmpty;
  if (isEmpty) {
    exportStatus.textContent = "Log a feeding, diaper change, or head position to enable export.";
  } else if (exportStatus.textContent.startsWith("Log a feeding")) {
    exportStatus.textContent = "Export your complete care history.";
  }
}

function downloadCareLog(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createCareLogFile() {
  const today = localDateValue(new Date());
  return new File(["\ufeff", buildCareLogCsv()], `nurture-day-care-log-${today}.csv`, { type: "text/csv;charset=utf-8" });
}

function openExportOptions() {
  if (!feedingHistory.length && !diaperHistory.length && !headPositionHistory.length) return;
  exportStatus.textContent = "Choose Google Sheets or a CSV download.";
  exportDialog.showModal();
}

async function exportCareLog() {
  if (!feedingHistory.length && !diaperHistory.length && !headPositionHistory.length) return;
  const file = createCareLogFile();
  exportGoogleSheetsButton.disabled = true;
  exportStatus.textContent = "Opening your phone's share menu…";

  try {
    let canShareFile = false;
    try {
      canShareFile = Boolean(navigator.share && navigator.canShare?.({ files: [file] }));
    } catch {
      // Browsers that cannot inspect shared files still receive a regular download.
    }
    if (!canShareFile) {
      exportStatus.textContent = "Google Sheets sharing isn't available here. Choose Download CSV instead.";
      return;
    }
    try {
      await navigator.share({
        title: "Nurture Day care log",
        text: "Open this care log with Google Sheets.",
        files: [file]
      });
      exportDialog.close();
      exportStatus.textContent = "Care log shared. Choose Google Sheets from the share menu.";
    } catch (error) {
      if (error?.name === "AbortError") {
        exportStatus.textContent = "Export canceled. Your records are unchanged.";
        return;
      }
      exportStatus.textContent = "The share menu couldn't open. Choose Download CSV instead.";
    }
  } finally {
    exportGoogleSheetsButton.disabled = false;
  }
}

function downloadCareLogCsv() {
  if (!feedingHistory.length && !diaperHistory.length && !headPositionHistory.length) return;
  downloadCareLog(createCareLogFile());
  exportDialog.close();
  exportStatus.textContent = "CSV backup downloaded to this device.";
}

function parseCsvRows(text) {
  const source = String(text || "").replace(/^\ufeff/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some(cell => cell !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("The CSV file has an unfinished quoted field.");
  row.push(field.replace(/\r$/, ""));
  if (row.some(cell => cell !== "")) rows.push(row);
  return rows;
}

function csvLocalDateTime(dateValue, timeValue) {
  const dateMatch = String(dateValue || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(timeValue || "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!dateMatch || !timeMatch) return null;
  const [, year, month, day] = dateMatch.map(Number);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || 0);
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) return null;
  return date.toISOString();
}

function parseCareLogCsv(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) throw new Error("This CSV file is empty.");
  const headings = rows[0].map(value => value.trim().toLowerCase());
  const column = name => headings.indexOf(name.toLowerCase());
  for (const required of ["Date", "Time", "Event"]) {
    if (column(required) < 0) throw new Error("This does not look like a Nurture Day care-log CSV file.");
  }
  const valueAt = (row, name) => {
    const index = column(name);
    return index < 0 ? "" : String(row[index] || "").trim();
  };
  const imported = {
    feedingHistory: [],
    feedingSessions: [],
    feedingDetails: {},
    diaperHistory: [],
    diaperDetails: {},
    headPositionHistory: [],
    headPositionDetails: {}
  };

  rows.slice(1).forEach((row, rowIndex) => {
    const eventName = valueAt(row, "Event").toLowerCase();
    if (!eventName) return;
    const startedAt = csvLocalDateTime(valueAt(row, "Date"), valueAt(row, "Time"));
    if (!startedAt) throw new Error(`Row ${rowIndex + 2} has an invalid date or time.`);

    if (eventName === "feeding") {
      imported.feedingHistory.push(startedAt);
      const typeValue = valueAt(row, "Feeding type").toLowerCase();
      const milkValue = valueAt(row, "Milk type").toLowerCase();
      const amountValue = Number(valueAt(row, "Amount"));
      const amountUnitValue = valueAt(row, "Amount unit").toLowerCase();
      const amountUnit = ["ml", "milliliter", "milliliters"].includes(amountUnitValue) ? "ml" : ["oz", "ounce", "ounces"].includes(amountUnitValue) ? "oz" : null;
      const amountMaximum = amountUnit === "oz" ? 12 : 360;
      const amount = amountUnit && amountValue > 0 && amountValue <= amountMaximum ? amountValue : null;
      let notes = valueAt(row, "Notes");
      if (/^'[=+\-@]/.test(notes)) notes = notes.slice(1);
      const details = {
        kind: typeValue === "planned" ? "planned" : ["top-off", "top off"].includes(typeValue) ? "top-off" : null,
        milk: milkValue === "formula" ? "formula" : milkValue === "breast milk" ? "breast-milk" : null,
        amount,
        amountUnit: amount ? amountUnit : null,
        notes: notes.slice(0, 500)
      };
      if (details.kind || details.milk || details.amount || details.notes) imported.feedingDetails[startedAt] = details;

      const sessionStatus = valueAt(row, "Session status").toLowerCase();
      if (sessionStatus === "completed") {
        const endedAt = csvLocalDateTime(valueAt(row, "End date"), valueAt(row, "End time"));
        if (!endedAt || new Date(endedAt) < new Date(startedAt)) throw new Error(`Row ${rowIndex + 2} has an invalid feeding end time.`);
        imported.feedingSessions.push({ startAt: startedAt, endAt: endedAt });
      } else if (sessionStatus === "in progress") {
        imported.feedingSessions.push({ startAt: startedAt, endAt: null });
      }
    } else if (eventName === "diaper change") {
      imported.diaperHistory.push(startedAt);
      const contents = valueAt(row, "Diaper contents").toLowerCase();
      const type = contents === "pee" ? "pee" : contents === "poo" ? "poo" : ["pee + poo", "pee and poo"].includes(contents) ? "both" : null;
      if (type) imported.diaperDetails[startedAt] = { type };
    } else if (eventName === "head position") {
      imported.headPositionHistory.push(startedAt);
      const positionValue = valueAt(row, "Head position").toLowerCase();
      const position = positionValue === "left" ? "left" : positionValue === "right" ? "right" : ["back", "center", "centered", "back / centered"].includes(positionValue) ? "back" : null;
      if (position) imported.headPositionDetails[startedAt] = { position };
    }
  });

  imported.feedingHistory = [...new Set(imported.feedingHistory)].sort((a, b) => new Date(a) - new Date(b));
  imported.diaperHistory = [...new Set(imported.diaperHistory)].sort((a, b) => new Date(a) - new Date(b));
  imported.headPositionHistory = [...new Set(imported.headPositionHistory)].sort((a, b) => new Date(a) - new Date(b));
  if (!imported.feedingHistory.length && !imported.diaperHistory.length && !imported.headPositionHistory.length) throw new Error("No feeding, diaper, or head-position records were found in this CSV file.");
  return imported;
}

function mergeImportedCareLog(imported) {
  feedingHistory = [...new Set([...feedingHistory, ...imported.feedingHistory])].sort((a, b) => new Date(a) - new Date(b));
  diaperHistory = [...new Set([...diaperHistory, ...imported.diaperHistory])].sort((a, b) => new Date(a) - new Date(b));
  headPositionHistory = [...new Set([...headPositionHistory, ...imported.headPositionHistory])].sort((a, b) => new Date(a) - new Date(b));

  const sessions = new Map(imported.feedingSessions.map(session => [session.startAt, session]));
  feedingSessions.forEach(session => {
    const candidate = sessions.get(session.startAt);
    if (!candidate || session.endAt || !candidate.endAt) sessions.set(session.startAt, session);
  });
  feedingSessions = [...sessions.values()].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  Object.entries(imported.feedingDetails).forEach(([startAt, details]) => {
    feedingDetails[startAt] = { ...details, ...(feedingDetails[startAt] || {}) };
  });
  Object.entries(imported.diaperDetails).forEach(([changedAt, details]) => {
    diaperDetails[changedAt] = diaperDetails[changedAt] || details;
  });
  Object.entries(imported.headPositionDetails).forEach(([loggedAt, details]) => {
    headPositionDetails[loggedAt] = headPositionDetails[loggedAt] || details;
  });
  lastFeeding = feedingHistory.length ? new Date(feedingHistory[feedingHistory.length - 1]) : null;
  lastAlarmedFor = null;
  save();
  render();
  void syncPushReminder();
}

async function importCareLog(file) {
  if (!file) return;
  importCareLogButton.disabled = true;
  importStatus.textContent = "Reading your backup…";
  try {
    const imported = parseCareLogCsv(await file.text());
    const feedingCount = imported.feedingHistory.length;
    const diaperCount = imported.diaperHistory.length;
    const headPositionCount = imported.headPositionHistory.length;
    const confirmed = window.confirm(`Restore ${feedingCount} ${feedingCount === 1 ? "feeding" : "feedings"}, ${diaperCount} ${diaperCount === 1 ? "diaper change" : "diaper changes"}, and ${headPositionCount} head-position ${headPositionCount === 1 ? "log" : "logs"}? Existing records will be kept.`);
    if (!confirmed) {
      importStatus.textContent = "Restore canceled. Your records are unchanged.";
      return;
    }
    mergeImportedCareLog(imported);
    importStatus.textContent = `Backup restored: ${feedingCount} ${feedingCount === 1 ? "feeding" : "feedings"}, ${diaperCount} ${diaperCount === 1 ? "diaper change" : "diaper changes"}, and ${headPositionCount} head-position ${headPositionCount === 1 ? "log" : "logs"}.`;
  } catch (error) {
    importStatus.textContent = error?.message || "Nurture Day couldn't read that CSV backup.";
  } finally {
    importCareLogButton.disabled = false;
    importCareLogFile.value = "";
  }
}

function renderHistory() {
  const feedings = feedingHistory.map(value => new Date(value)).filter(date => !Number.isNaN(date.getTime())).sort((a, b) => b - a);
  const todayKey = localDayKey(new Date());
  const todayCount = feedings.filter(date => localDayKey(date) === todayKey).length;
  $("#feeding-count").textContent = todayCount;
  $("#feeding-count-label").textContent = todayCount === 1 ? "feeding" : "feedings";
  $("#history-total").textContent = feedings.length ? `${feedings.length} total logged on this device` : "No feedings logged yet";
  $("#history-dialog-summary").textContent = `${todayCount} ${todayCount === 1 ? "feeding" : "feedings"} today · ${feedings.length} total`;
  updateExportAvailability();
  feedingTimetable.replaceChildren();

  if (!feedings.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Your logged feedings will appear here.";
    feedingTimetable.append(empty);
    return;
  }

  const groups = new Map();
  const sessionsByStart = new Map(feedingSessions.map(session => [session.startAt, session]));
  feedings.forEach((date, index) => {
    const key = localDayKey(date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ date, olderFeeding: feedings[index + 1] || null, session: sessionsByStart.get(date.toISOString()) || null });
  });

  groups.forEach((entries, key) => {
    const section = document.createElement("section");
    section.className = "timetable-day";
    const heading = document.createElement("h3");
    const dayLabel = key === todayKey ? "Today" : new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(entries[0].date);
    heading.textContent = dayLabel;
    const list = document.createElement("ol");
    list.className = "timetable-list";
    entries.forEach(({ date, olderFeeding, session }) => {
      const item = document.createElement("li");
      item.className = "timetable-item";
      const dot = document.createElement("span");
      dot.className = "timetable-dot";
      dot.setAttribute("aria-hidden", "true");
      const time = document.createElement("time");
      time.dateTime = date.toISOString();
      time.textContent = formatTime(date);
      const details = document.createElement("span");
      details.className = "timetable-details";
      const duration = document.createElement("strong");
      duration.className = "session-duration";
      if (!session) {
        duration.textContent = "Duration not tracked";
      } else if (session.endAt) {
        duration.textContent = `${formatSessionDuration(new Date(session.endAt) - new Date(session.startAt))} feeding`;
      } else {
        duration.textContent = `${formatElapsed(new Date() - new Date(session.startAt))} · In progress`;
      }
      const gap = document.createElement("span");
      gap.className = "timetable-gap";
      gap.textContent = olderFeeding ? formatGap(date - olderFeeding) : "First logged feeding";
      details.append(duration, gap);
      const feedingStart = date.toISOString();
      const metadata = feedingDetails[feedingStart];
      const amountLabel = feedingAmountLabel(metadata);
      if (metadata?.kind || metadata?.milk || amountLabel) {
        const tags = document.createElement("span");
        tags.className = "feeding-tags";
        [feedingKindLabel(metadata.kind), milkKindLabel(metadata.milk), amountLabel].filter(Boolean).forEach(label => {
          const tag = document.createElement("span");
          tag.textContent = label;
          tags.append(tag);
        });
        details.append(tags);
      }
      if (metadata?.notes) {
        const note = document.createElement("span");
        note.className = "feeding-note";
        note.textContent = metadata.notes;
        details.append(note);
      }
      const detailsButton = document.createElement("button");
      detailsButton.className = "feeding-details-button";
      detailsButton.type = "button";
      detailsButton.dataset.feedingStart = feedingStart;
      detailsButton.textContent = hasFeedingDetails(feedingStart) ? "Edit details" : "Add details";
      detailsButton.setAttribute("aria-label", `${detailsButton.textContent} for feeding at ${formatTime(date)}`);
      details.append(detailsButton);
      item.append(dot, time, details);
      list.append(item);
    });
    section.append(heading, list);
    feedingTimetable.append(section);
  });
}

function renderDiaperHistory() {
  const changes = diaperHistory.map(value => new Date(value)).filter(date => !Number.isNaN(date.getTime())).sort((a, b) => b - a);
  const todayKey = localDayKey(new Date());
  const todayCount = changes.filter(date => localDayKey(date) === todayKey).length;
  $("#diaper-count").textContent = todayCount;
  $("#diaper-count-label").textContent = todayCount === 1 ? "change today" : "changes today";
  const latestChangeType = changes.length ? diaperTypeLabel(diaperDetails[changes[0].toISOString()]?.type) : "";
  $("#last-diaper").textContent = changes.length ? `Last change: ${formatDateTime(changes[0])} · ${latestChangeType} · ${changes.length} total` : "No diaper changes logged yet";
  $("#diaper-dialog-summary").textContent = `${todayCount} ${todayCount === 1 ? "change" : "changes"} today · ${changes.length} total`;
  updateExportAvailability();
  undoDiaper.disabled = changes.length === 0;
  diaperTimetable.replaceChildren();

  if (!changes.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Your logged diaper changes will appear here.";
    diaperTimetable.append(empty);
    return;
  }

  const groups = new Map();
  changes.forEach((date, index) => {
    const key = localDayKey(date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ date, olderChange: changes[index + 1] || null, type: diaperDetails[date.toISOString()]?.type || null });
  });

  groups.forEach((entries, key) => {
    const section = document.createElement("section");
    section.className = "timetable-day diaper-day";
    const heading = document.createElement("h3");
    heading.textContent = key === todayKey ? "Today" : new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(entries[0].date);
    const list = document.createElement("ol");
    list.className = "timetable-list";
    entries.forEach(({ date, olderChange, type }) => {
      const item = document.createElement("li");
      item.className = "timetable-item";
      const dot = document.createElement("span");
      dot.className = "timetable-dot diaper-dot";
      dot.setAttribute("aria-hidden", "true");
      const time = document.createElement("time");
      time.dateTime = date.toISOString();
      time.textContent = formatTime(date);
      const details = document.createElement("span");
      details.className = "timetable-details";
      const typeLabel = document.createElement("strong");
      typeLabel.className = "diaper-type-label";
      typeLabel.textContent = diaperTypeLabel(type);
      const gap = document.createElement("span");
      gap.className = "timetable-gap";
      gap.textContent = olderChange ? formatGap(date - olderChange) : "First logged change";
      details.append(typeLabel, gap);
      item.append(dot, time, details);
      list.append(item);
    });
    section.append(heading, list);
    diaperTimetable.append(section);
  });
}

function renderHeadPositionHistory() {
  const positions = headPositionHistory.map(value => new Date(value)).filter(date => !Number.isNaN(date.getTime())).sort((a, b) => b - a);
  const todayKey = localDayKey(new Date());
  const todayCount = positions.filter(date => localDayKey(date) === todayKey).length;
  $("#head-position-count").textContent = todayCount;
  $("#head-position-count-label").textContent = todayCount === 1 ? "log today" : "logs today";
  const latestPosition = positions.length ? headPositionLabel(headPositionDetails[positions[0].toISOString()]?.position) : "";
  $("#last-head-position").textContent = positions.length ? `Last position: ${latestPosition} · ${formatDateTime(positions[0])} · ${positions.length} total` : "No head positions logged yet";
  $("#head-position-dialog-summary").textContent = `${todayCount} ${todayCount === 1 ? "log" : "logs"} today · ${positions.length} total`;
  updateExportAvailability();
  undoHeadPosition.disabled = positions.length === 0;
  headPositionTimetable.replaceChildren();

  if (!positions.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Your logged head positions will appear here.";
    headPositionTimetable.append(empty);
    return;
  }

  const groups = new Map();
  positions.forEach((date, index) => {
    const key = localDayKey(date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ date, olderPosition: positions[index + 1] || null, position: headPositionDetails[date.toISOString()]?.position || null });
  });

  groups.forEach((entries, key) => {
    const section = document.createElement("section");
    section.className = "timetable-day head-position-day";
    const heading = document.createElement("h3");
    heading.textContent = key === todayKey ? "Today" : new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(entries[0].date);
    const list = document.createElement("ol");
    list.className = "timetable-list";
    entries.forEach(({ date, olderPosition, position }) => {
      const item = document.createElement("li");
      item.className = "timetable-item";
      const dot = document.createElement("span");
      dot.className = "timetable-dot head-position-dot";
      dot.setAttribute("aria-hidden", "true");
      const time = document.createElement("time");
      time.dateTime = date.toISOString();
      time.textContent = formatTime(date);
      const details = document.createElement("span");
      details.className = "timetable-details";
      const positionLabel = document.createElement("strong");
      positionLabel.className = "head-position-label";
      positionLabel.textContent = headPositionLabel(position);
      const gap = document.createElement("span");
      gap.className = "timetable-gap";
      gap.textContent = olderPosition ? formatGap(date - olderPosition) : "First logged position";
      details.append(positionLabel, gap);
      item.append(dot, time, details);
      list.append(item);
    });
    section.append(heading, list);
    headPositionTimetable.append(section);
  });
}

function setGreeting() {
  const hour = new Date().getHours();
  $("#greeting").textContent = hour < 12 ? "GOOD MORNING" : hour < 18 ? "GOOD AFTERNOON" : "GOOD EVENING";
}

function updateAlarmUI(message = "") {
  alarmToggle.setAttribute("aria-checked", alarmEnabled);
  alarmToggle.textContent = alarmEnabled ? "On" : "Off";
  testAlarm.disabled = !alarmEnabled;
  if (message) {
    alarmStatus.textContent = message;
  } else if (!alarmEnabled) {
    alarmStatus.textContent = "Off · alerts work while Nurture Day is active";
  } else if (pushConnected) {
    alarmStatus.textContent = "On · background notification scheduled";
  } else if ("Notification" in window && Notification.permission === "granted") {
    alarmStatus.textContent = "On · chime and notification while active";
  } else {
    alarmStatus.textContent = "On · chime and vibration while Nurture Day is open";
  }
}

function refreshThemeChrome() {
  const themeColor = darkMode ? "#111a1b" : "#fffaf6";
  const themeMeta = $("meta[name='theme-color']");
  themeMeta.setAttribute("content", themeColor);
  $("meta[name='apple-mobile-web-app-status-bar-style']").setAttribute("content", darkMode ? "black" : "default");
  document.documentElement.style?.setProperty("color-scheme", darkMode ? "dark" : "light");
  void window.NURTURE_NATIVE?.setTheme(darkMode);

  // Some installed Android PWAs only repaint the native status bar when the
  // theme-color element itself changes in the document, not just its value.
  if (document.head && typeof themeMeta.remove === "function") {
    themeMeta.remove();
    document.head.append(themeMeta);
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = darkMode ? "dark" : "light";
  darkModeToggle.setAttribute("aria-checked", darkMode);
  darkModeToggle.textContent = darkMode ? "On" : "Off";
  refreshThemeChrome();
}

async function prepareAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!alarmAudioContext) alarmAudioContext = new AudioContext();
  if (alarmAudioContext.state === "suspended") await alarmAudioContext.resume();
  return alarmAudioContext;
}

async function playAlarmSound(isTest = false) {
  try {
    const context = await prepareAudio();
    if (!context) return;
    const start = context.currentTime;
    const offsets = isTest ? [0, 0.26] : [0, 0.3, 0.6, 1.15, 1.45, 1.75];
    const frequencies = [659, 784, 988];
    offsets.forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = start + offset;
      oscillator.type = "sine";
      oscillator.frequency.value = frequencies[index % frequencies.length];
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.22, noteStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.22);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.24);
    });
  } catch {
    updateAlarmUI("On · notification enabled; sound is unavailable on this device");
  }
}

async function showNotification(title, body, tag) {
  if (!("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: "./icons/icon-192.png?v=20",
      badge: "./icons/icon-192.png?v=20",
      tag,
      renotify: true,
      data: { url: "./" }
    });
  } catch {
    updateAlarmUI("On · chime and vibration; notification could not be shown");
  }
}

async function triggerFeedingAlarm(due) {
  const alarmKey = due.toISOString();
  if (lastAlarmedFor === alarmKey) return;
  lastAlarmedFor = alarmKey;
  save();
  void playAlarmSound();
  if ("vibrate" in navigator) navigator.vibrate([250, 120, 250, 120, 450]);
  await showNotification("It's feeding time", "The feeding timer has reached zero.", "nurture-feeding-alarm");
  updateAlarmUI(`Alarm sounded at ${formatTime(new Date())}`);
}

function render() {
  const activeSession = getActiveFeedingSession();
  const scheduleAnchor = getScheduleAnchorFeeding();
  const feedingInProgress = Boolean(activeSession);
  feedNow.disabled = feedingInProgress;
  feedButtonLabel.textContent = feedingInProgress ? "Feeding in progress" : "Log feeding now";
  feedingSessionControls.hidden = !feedingInProgress;
  if (activeSession) sessionElapsed.textContent = `${formatElapsed(new Date() - new Date(activeSession.startAt))} elapsed`;
  $("#interval-value").textContent = intervalHours % 1 ? intervalHours : Math.round(intervalHours);
  if (document.activeElement !== $("#custom-hours")) $("#custom-hours").value = [2, 3, 4, 5].includes(intervalHours) ? "" : intervalHours;
  document.querySelectorAll(".interval-option").forEach(button => {
    const active = Number(button.dataset.hours) === intervalHours;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", active);
  });
  latestFeedingDetails.hidden = !lastFeeding;
  if (lastFeeding) latestFeedingDetails.textContent = hasFeedingDetails(lastFeeding.toISOString()) ? "Edit feeding details" : "Add feeding details";
  if (!lastFeeding || Number.isNaN(lastFeeding.getTime()) || !scheduleAnchor || Number.isNaN(scheduleAnchor.getTime())) {
    countdownDuration.hidden = false;
    countdownMessage.hidden = true;
    countdownHours.textContent = "--";
    countdownMinutes.textContent = "--";
    countdown.setAttribute("aria-label", "No feeding scheduled");
    nextTime.textContent = "Set your first feeding";
    lastFed.textContent = "No feeding logged yet";
    timerLabel.textContent = "NEXT FEEDING IN";
    progressBar.style.width = "0%";
    progressCopy.textContent = "Ready when you are";
    return;
  }
  const now = new Date();
  const intervalMs = intervalHours * 3600000;
  const due = new Date(scheduleAnchor.getTime() + intervalMs);
  const remaining = due - now;
  const elapsed = now - scheduleAnchor;
  const latestIsTopOff = feedingDetails[lastFeeding.toISOString()]?.kind === "top-off";
  const scheduleUsesEarlierFeeding = latestIsTopOff && scheduleAnchor.getTime() !== lastFeeding.getTime();
  const anchorIsPlanned = feedingDetails[scheduleAnchor.toISOString()]?.kind === "planned";
  const anchorDescription = anchorIsPlanned ? "planned feeding" : "earlier feeding";
  if (alarmEnabled && remaining <= 0 && remaining > -15 * 60000) void triggerFeedingAlarm(due);
  lastFed.textContent = `Last feeding: ${formatDateTime(lastFeeding)}`;
  if (remaining <= 0) {
    showCountdownMessage("It's time");
    nextTime.textContent = scheduleUsesEarlierFeeding ? `Planned feeding was due at ${formatTime(due)}` : `Was due at ${formatTime(due)}`;
    timerLabel.textContent = scheduleUsesEarlierFeeding ? "NEXT PLANNED FEEDING" : "NEXT FEEDING";
    progressBar.style.width = "100%";
    progressCopy.textContent = scheduleUsesEarlierFeeding ? `Based on the ${formatTime(scheduleAnchor)} ${anchorDescription}` : "Whenever baby is ready";
  } else {
    showDuration(remaining, scheduleUsesEarlierFeeding ? "the next planned feeding" : "the next feeding");
    nextTime.textContent = scheduleUsesEarlierFeeding ? `Next planned feeding around ${formatTime(due)}` : `Next feeding around ${formatTime(due)}`;
    timerLabel.textContent = scheduleUsesEarlierFeeding ? "NEXT PLANNED FEEDING IN" : "NEXT FEEDING IN";
    progressBar.style.width = `${Math.min(100, Math.max(0, elapsed / intervalMs * 100))}%`;
    progressCopy.textContent = scheduleUsesEarlierFeeding ? `Based on the ${formatTime(scheduleAnchor)} ${anchorDescription} · ${Math.max(0, Math.round(remaining / 60000))} minutes remaining` : `${Math.max(0, Math.round(remaining / 60000))} minutes until the next feed`;
  }
}

function logFeeding(date = new Date(), replaceLatest = false) {
  const isoTime = date.toISOString();
  const previousLatest = feedingHistory[feedingHistory.length - 1] || null;
  if (replaceLatest && feedingHistory.length) {
    feedingHistory[feedingHistory.length - 1] = isoTime;
    const matchingSession = feedingSessions.find(session => session.startAt === previousLatest);
    if (matchingSession) {
      matchingSession.startAt = isoTime;
      if (matchingSession.endAt && new Date(matchingSession.endAt) < date) matchingSession.endAt = isoTime;
    }
    if (previousLatest && previousLatest !== isoTime && feedingDetails[previousLatest]) {
      feedingDetails[isoTime] = feedingDetails[previousLatest];
      delete feedingDetails[previousLatest];
    }
  } else {
    feedingHistory.push(isoTime);
    feedingSessions.push({ startAt: isoTime, endAt: null });
  }
  feedingHistory = [...new Set(feedingHistory)].sort((a, b) => new Date(a) - new Date(b));
  feedingSessions.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  lastFeeding = new Date(feedingHistory[feedingHistory.length - 1]);
  lastAlarmedFor = null;
  save();
  render();
  renderHistory();
  void syncPushReminder();
}

function stopFeeding() {
  const activeSession = getActiveFeedingSession();
  if (!activeSession) return;
  const start = new Date(activeSession.startAt);
  const now = new Date();
  activeSession.endAt = new Date(Math.max(start.getTime(), now.getTime())).toISOString();
  save();
  render();
  renderHistory();
}

function logDiaperChange(date = new Date(), type = null) {
  const changedAt = date.toISOString();
  diaperHistory.push(changedAt);
  if (["pee", "poo", "both"].includes(type)) diaperDetails[changedAt] = { type };
  diaperHistory = [...new Set(diaperHistory)].sort((a, b) => new Date(a) - new Date(b));
  save();
  renderDiaperHistory();
  $("#diaper-announcement").textContent = `Diaper change logged at ${formatTime(date)}.`;
}

function undoLastDiaperChange() {
  if (!diaperHistory.length) return;
  const removedAt = diaperHistory.pop();
  delete diaperDetails[removedAt];
  const removed = new Date(removedAt);
  save();
  renderDiaperHistory();
  $("#diaper-announcement").textContent = `Diaper change from ${formatTime(removed)} removed.`;
}

function logHeadPosition(date = new Date(), position = null) {
  if (!["left", "right", "back"].includes(position)) return;
  const loggedAt = date.toISOString();
  headPositionHistory.push(loggedAt);
  headPositionDetails[loggedAt] = { position };
  headPositionHistory = [...new Set(headPositionHistory)].sort((a, b) => new Date(a) - new Date(b));
  save();
  renderHeadPositionHistory();
  $("#head-position-announcement").textContent = `${headPositionLabel(position)} head position logged at ${formatTime(date)}.`;
}

function undoLastHeadPosition() {
  if (!headPositionHistory.length) return;
  const removedAt = headPositionHistory.pop();
  const removedPosition = headPositionLabel(headPositionDetails[removedAt]?.position);
  delete headPositionDetails[removedAt];
  const removed = new Date(removedAt);
  save();
  renderHeadPositionHistory();
  $("#head-position-announcement").textContent = `${removedPosition} head position from ${formatTime(removed)} removed.`;
}

function openTimeDialog() {
  editingExistingFeeding = feedingHistory.length > 0;
  const date = lastFeeding || new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  timeInput.value = local;
  dialog.showModal();
}

function openFeedingDetails(startAt) {
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return;
  selectedFeedingStart = date.toISOString();
  feedingDetailsForm.reset();
  const details = feedingDetails[selectedFeedingStart] || {};
  const recentAmount = findRecentFeedingAmount(selectedFeedingStart);
  if (details.kind) feedingDetailsForm.elements["feeding-kind"].value = details.kind;
  if (details.milk) feedingDetailsForm.elements["milk-kind"].value = details.milk;
  configureFeedingAmount(
    details.amountUnit || recentAmount?.amountUnit || amountUnitPreference,
    details.amount || recentAmount?.amount || 0,
  );
  $("#feeding-notes").value = details.notes || "";
  $("#feeding-details-time").textContent = `Feeding logged ${formatDateTime(date)}`;
  feedingDetailsDialog.showModal();
}

feedNow.addEventListener("click", () => logFeeding());
$("#stop-feeding").addEventListener("click", stopFeeding);
latestFeedingDetails.addEventListener("click", () => {
  if (lastFeeding) openFeedingDetails(lastFeeding.toISOString());
});
feedingTimetable.addEventListener("click", event => {
  const detailsButton = event.target.closest("[data-feeding-start]");
  if (detailsButton) openFeedingDetails(detailsButton.dataset.feedingStart);
});
feedingAmount.addEventListener("input", updateFeedingAmountReadout);
feedingAmount.addEventListener("change", normalizeFeedingAmountInput);
feedingAmountDecrease.addEventListener("click", () => adjustFeedingAmount(-1));
feedingAmountIncrease.addEventListener("click", () => adjustFeedingAmount(1));
feedingAmountClear.addEventListener("click", () => configureFeedingAmount(feedingAmountUnit, 0));
feedingAmountUnitButtons.forEach(button => button.addEventListener("click", () => changeFeedingAmountUnit(button.dataset.amountUnit)));
feedingDetailsForm.addEventListener("submit", event => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  if (!selectedFeedingStart) return;
  const formData = new FormData(feedingDetailsForm);
  const kind = formData.get("feeding-kind") || null;
  const milk = formData.get("milk-kind") || null;
  normalizeFeedingAmountInput();
  const amountValue = Number(feedingAmount.value);
  const amount = amountValue > 0 && amountValue <= Number(feedingAmount.max) ? amountValue : null;
  const amountUnit = amount ? feedingAmountUnit : null;
  amountUnitPreference = feedingAmountUnit;
  const notes = $("#feeding-notes").value.trim().slice(0, 500);
  if (kind || milk || amount || notes) {
    feedingDetails[selectedFeedingStart] = { kind, milk, amount, amountUnit, notes };
  } else {
    delete feedingDetails[selectedFeedingStart];
  }
  save();
  render();
  renderHistory();
  void syncPushReminder();
  feedingDetailsDialog.close();
});
feedingDetailsDialog.addEventListener("close", () => {
  selectedFeedingStart = null;
});
$("#log-diaper").addEventListener("click", () => {
  diaperLogForm.reset();
  diaperLogDialog.showModal();
});
diaperLogForm.addEventListener("submit", event => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const type = new FormData(diaperLogForm).get("diaper-type");
  if (!["pee", "poo", "both"].includes(type)) return;
  logDiaperChange(new Date(), type);
  diaperLogDialog.close();
});
undoDiaper.addEventListener("click", undoLastDiaperChange);
$("#view-diapers").addEventListener("click", () => {
  renderDiaperHistory();
  diaperHistoryDialog.showModal();
});
$("#close-diaper-history").addEventListener("click", () => diaperHistoryDialog.close());
$("#done-diaper-history").addEventListener("click", () => diaperHistoryDialog.close());
$("#log-head-position").addEventListener("click", () => {
  headPositionLogForm.reset();
  headPositionLogDialog.showModal();
});
headPositionLogForm.addEventListener("submit", event => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const position = new FormData(headPositionLogForm).get("head-position");
  if (!["left", "right", "back"].includes(position)) return;
  logHeadPosition(new Date(), position);
  headPositionLogDialog.close();
});
undoHeadPosition.addEventListener("click", undoLastHeadPosition);
$("#view-head-positions").addEventListener("click", () => {
  renderHeadPositionHistory();
  headPositionHistoryDialog.showModal();
});
$("#close-head-position-history").addEventListener("click", () => headPositionHistoryDialog.close());
$("#done-head-position-history").addEventListener("click", () => headPositionHistoryDialog.close());
$("#edit-time").addEventListener("click", openTimeDialog);
$("#time-form").addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const value = new Date(timeInput.value);
  if (!Number.isNaN(value.getTime())) logFeeding(value, editingExistingFeeding);
  editingExistingFeeding = false;
  dialog.close();
});
$("#view-timetable").addEventListener("click", () => {
  renderHistory();
  historyDialog.showModal();
});
$("#close-history").addEventListener("click", () => historyDialog.close());
$("#done-history").addEventListener("click", () => historyDialog.close());
exportCareLogButton.addEventListener("click", openExportOptions);
exportGoogleSheetsButton.addEventListener("click", () => void exportCareLog());
downloadCareLogButton.addEventListener("click", downloadCareLogCsv);
$("#close-export").addEventListener("click", () => exportDialog.close());
$("#cancel-export").addEventListener("click", () => exportDialog.close());
importCareLogButton.addEventListener("click", () => importCareLogFile.click());
importCareLogFile.addEventListener("change", event => void importCareLog(event.target.files?.[0]));
document.querySelectorAll(".interval-option").forEach(button => button.addEventListener("click", () => {
  intervalHours = Number(button.dataset.hours);
  lastAlarmedFor = null;
  save();
  render();
  void syncPushReminder();
}));
$("#custom-hours").addEventListener("change", (event) => {
  const value = Number(event.target.value);
  if (value >= 0.25 && value <= 24) {
    intervalHours = value;
    lastAlarmedFor = null;
    save();
    render();
    void syncPushReminder();
  } else render();
});

darkModeToggle.addEventListener("click", () => {
  darkMode = !darkMode;
  applyTheme();
  save();
  if (!window.NURTURE_NATIVE?.isNative && window.matchMedia?.("(display-mode: standalone)").matches) {
    // Reload once with the saved theme available to the head bootstrap. This
    // refreshes system bars on Android versions that ignore runtime updates.
    setTimeout(() => window.location.reload(), 80);
  }
});

alarmToggle.addEventListener("click", async () => {
  if (alarmEnabled) {
    alarmEnabled = false;
    save();
    void cancelPushReminder();
    updateAlarmUI();
    return;
  }
  alarmEnabled = true;
  save();
  updateAlarmUI("Turning on alerts…");
  const sound = playAlarmSound(true);
  if ("vibrate" in navigator) navigator.vibrate(100);
  if ("Notification" in window && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      // Sound and vibration still work while the app is running.
    }
  }
  await sound;
  updateAlarmUI();
  void syncPushReminder();
});

testAlarm.addEventListener("click", () => {
  if (window.NURTURE_NATIVE?.isNative) {
    void window.NURTURE_NATIVE.testReminder().then(scheduled => {
      updateAlarmUI(scheduled ? "Test notification scheduled" : "Allow notifications to test the alarm");
    });
    return;
  }
  void playAlarmSound();
  if ("vibrate" in navigator) navigator.vibrate([180, 90, 180]);
  void showNotification("Nurture Day alarm test", "Your feeding reminder is ready.", "nurture-alarm-test");
  updateAlarmUI("Test alarm played");
});

document.addEventListener("pointerdown", () => {
  if (alarmEnabled) void prepareAudio();
}, { once: true });

setGreeting();
applyTheme();
render();
renderHistory();
renderDiaperHistory();
renderHeadPositionHistory();
updateAlarmUI();
setInterval(render, 1000);
setInterval(renderHistory, 60000);
setInterval(renderDiaperHistory, 60000);
setInterval(renderHeadPositionHistory, 60000);

if (!window.NURTURE_NATIVE?.isNative && "serviceWorker" in navigator) {
  const controlledAtLoad = Boolean(navigator.serviceWorker.controller);
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!controlledAtLoad || reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });
  window.addEventListener("load", async () => {
    const registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
    try {
      await registration.update();
    } catch {
      // The current offline version keeps working until connectivity returns.
    }
    void syncPushReminder();
  });
}

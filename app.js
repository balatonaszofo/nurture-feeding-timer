const STORAGE_KEY = "nurture-feeding-state";
const PUSH_DEVICE_KEY = "nurture-push-device-id";
const PUSH_SERVER = String(window.NURTURE_PUSH_SERVER || "").replace(/\/$/, "");
const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
let intervalHours = Number(state.intervalHours) || 3;
const storedFeedings = Array.isArray(state.feedingHistory) ? state.feedingHistory : [];
let feedingHistory = [...new Set([...storedFeedings, state.lastFeeding].filter(value => {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}))].sort((a, b) => new Date(a) - new Date(b));
const storedDiapers = Array.isArray(state.diaperHistory) ? state.diaperHistory : [];
let diaperHistory = [...new Set(storedDiapers.filter(value => {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}))].sort((a, b) => new Date(a) - new Date(b));
let lastFeeding = feedingHistory.length ? new Date(feedingHistory[feedingHistory.length - 1]) : null;
let alarmEnabled = state.alarmEnabled === true;
let lastAlarmedFor = state.lastAlarmedFor || null;
let alarmAudioContext = null;
let editingExistingFeeding = false;
let pushConnected = false;

const $ = (selector) => document.querySelector(selector);
const countdown = $("#countdown");
const countdownDuration = $("#countdown-duration");
const countdownMessage = $("#countdown-message");
const countdownHours = $("#countdown-hours");
const countdownMinutes = $("#countdown-minutes");
const nextTime = $("#next-time");
const lastFed = $("#last-fed");
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
const diaperHistoryDialog = $("#diaper-history-dialog");
const diaperTimetable = $("#diaper-timetable");
const undoDiaper = $("#undo-diaper");

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    intervalHours,
    lastFeeding: lastFeeding?.toISOString() || null,
    feedingHistory,
    diaperHistory,
    alarmEnabled,
    lastAlarmedFor
  }));
}

function getDurationParts(ms) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

function showDuration(ms) {
  const { hours, minutes } = getDurationParts(ms);
  countdownDuration.hidden = false;
  countdownMessage.hidden = true;
  countdownHours.textContent = hours;
  countdownMinutes.textContent = String(minutes).padStart(2, "0");
  countdown.setAttribute("aria-label", `${hours} ${hours === 1 ? "hour" : "hours"} and ${minutes} ${minutes === 1 ? "minute" : "minutes"} until the next feeding`);
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
  if (!PUSH_SERVER) return;
  try {
    await fetch(`${PUSH_SERVER}/api/reminders/${getPushDeviceId()}`, { method: "DELETE" });
  } catch {
    // A stale reminder expires automatically on the server after its due time.
  }
  pushConnected = false;
}

async function syncPushReminder() {
  if (!PUSH_SERVER || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (!alarmEnabled || !lastFeeding) {
    await cancelPushReminder();
    return false;
  }
  const dueAt = new Date(lastFeeding.getTime() + intervalHours * 3600000);
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
    updateAlarmUI("On · background service unavailable; keep Nurture active");
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

function renderHistory() {
  const feedings = feedingHistory.map(value => new Date(value)).filter(date => !Number.isNaN(date.getTime())).sort((a, b) => b - a);
  const todayKey = localDayKey(new Date());
  const todayCount = feedings.filter(date => localDayKey(date) === todayKey).length;
  $("#feeding-count").textContent = todayCount;
  $("#feeding-count-label").textContent = todayCount === 1 ? "feeding" : "feedings";
  $("#history-total").textContent = feedings.length ? `${feedings.length} total logged on this device` : "No feedings logged yet";
  $("#history-dialog-summary").textContent = `${todayCount} ${todayCount === 1 ? "feeding" : "feedings"} today · ${feedings.length} total`;
  feedingTimetable.replaceChildren();

  if (!feedings.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Your logged feedings will appear here.";
    feedingTimetable.append(empty);
    return;
  }

  const groups = new Map();
  feedings.forEach((date, index) => {
    const key = localDayKey(date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ date, olderFeeding: feedings[index + 1] || null });
  });

  groups.forEach((entries, key) => {
    const section = document.createElement("section");
    section.className = "timetable-day";
    const heading = document.createElement("h3");
    const dayLabel = key === todayKey ? "Today" : new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(entries[0].date);
    heading.textContent = dayLabel;
    const list = document.createElement("ol");
    list.className = "timetable-list";
    entries.forEach(({ date, olderFeeding }) => {
      const item = document.createElement("li");
      item.className = "timetable-item";
      const dot = document.createElement("span");
      dot.className = "timetable-dot";
      dot.setAttribute("aria-hidden", "true");
      const time = document.createElement("time");
      time.dateTime = date.toISOString();
      time.textContent = formatTime(date);
      const gap = document.createElement("span");
      gap.className = "timetable-gap";
      gap.textContent = olderFeeding ? formatGap(date - olderFeeding) : "First logged feeding";
      item.append(dot, time, gap);
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
  $("#last-diaper").textContent = changes.length ? `Last change: ${formatDateTime(changes[0])} · ${changes.length} total` : "No diaper changes logged yet";
  $("#diaper-dialog-summary").textContent = `${todayCount} ${todayCount === 1 ? "change" : "changes"} today · ${changes.length} total`;
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
    groups.get(key).push({ date, olderChange: changes[index + 1] || null });
  });

  groups.forEach((entries, key) => {
    const section = document.createElement("section");
    section.className = "timetable-day diaper-day";
    const heading = document.createElement("h3");
    heading.textContent = key === todayKey ? "Today" : new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(entries[0].date);
    const list = document.createElement("ol");
    list.className = "timetable-list";
    entries.forEach(({ date, olderChange }) => {
      const item = document.createElement("li");
      item.className = "timetable-item";
      const dot = document.createElement("span");
      dot.className = "timetable-dot diaper-dot";
      dot.setAttribute("aria-hidden", "true");
      const time = document.createElement("time");
      time.dateTime = date.toISOString();
      time.textContent = formatTime(date);
      const detail = document.createElement("span");
      detail.className = "timetable-gap";
      detail.textContent = olderChange ? formatGap(date - olderChange) : "First logged change";
      item.append(dot, time, detail);
      list.append(item);
    });
    section.append(heading, list);
    diaperTimetable.append(section);
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
    alarmStatus.textContent = "Off · alerts work while Nurture is active";
  } else if (pushConnected) {
    alarmStatus.textContent = "On · background notification scheduled";
  } else if ("Notification" in window && Notification.permission === "granted") {
    alarmStatus.textContent = "On · chime and notification while active";
  } else {
    alarmStatus.textContent = "On · chime and vibration while Nurture is open";
  }
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
      icon: "./icon.svg",
      badge: "./icon.svg",
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
  $("#interval-value").textContent = intervalHours % 1 ? intervalHours : Math.round(intervalHours);
  if (document.activeElement !== $("#custom-hours")) $("#custom-hours").value = [2, 3, 4, 5].includes(intervalHours) ? "" : intervalHours;
  document.querySelectorAll(".interval-option").forEach(button => {
    const active = Number(button.dataset.hours) === intervalHours;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", active);
  });
  if (!lastFeeding || Number.isNaN(lastFeeding.getTime())) {
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
  const due = new Date(lastFeeding.getTime() + intervalMs);
  const remaining = due - now;
  const elapsed = now - lastFeeding;
  if (alarmEnabled && remaining <= 0 && remaining > -15 * 60000) void triggerFeedingAlarm(due);
  lastFed.textContent = `Last feeding: ${formatDateTime(lastFeeding)}`;
  if (remaining <= 0) {
    showCountdownMessage("It's time");
    nextTime.textContent = `Was due at ${formatTime(due)}`;
    timerLabel.textContent = "NEXT FEEDING";
    progressBar.style.width = "100%";
    progressCopy.textContent = "Whenever baby is ready";
  } else {
    showDuration(remaining);
    nextTime.textContent = `Next feeding around ${formatTime(due)}`;
    timerLabel.textContent = "NEXT FEEDING IN";
    progressBar.style.width = `${Math.min(100, Math.max(0, elapsed / intervalMs * 100))}%`;
    progressCopy.textContent = `${Math.max(0, Math.round(remaining / 60000))} minutes until the next feed`;
  }
}

function logFeeding(date = new Date(), replaceLatest = false) {
  const isoTime = date.toISOString();
  if (replaceLatest && feedingHistory.length) {
    feedingHistory[feedingHistory.length - 1] = isoTime;
  } else {
    feedingHistory.push(isoTime);
  }
  feedingHistory = [...new Set(feedingHistory)].sort((a, b) => new Date(a) - new Date(b));
  lastFeeding = new Date(feedingHistory[feedingHistory.length - 1]);
  lastAlarmedFor = null;
  save();
  render();
  renderHistory();
  void syncPushReminder();
}

function logDiaperChange(date = new Date()) {
  diaperHistory.push(date.toISOString());
  diaperHistory = [...new Set(diaperHistory)].sort((a, b) => new Date(a) - new Date(b));
  save();
  renderDiaperHistory();
  $("#diaper-announcement").textContent = `Diaper change logged at ${formatTime(date)}.`;
}

function undoLastDiaperChange() {
  if (!diaperHistory.length) return;
  const removed = new Date(diaperHistory.pop());
  save();
  renderDiaperHistory();
  $("#diaper-announcement").textContent = `Diaper change from ${formatTime(removed)} removed.`;
}

function openTimeDialog() {
  editingExistingFeeding = feedingHistory.length > 0;
  const date = lastFeeding || new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  timeInput.value = local;
  dialog.showModal();
}

$("#feed-now").addEventListener("click", () => logFeeding());
$("#log-diaper").addEventListener("click", () => logDiaperChange());
undoDiaper.addEventListener("click", undoLastDiaperChange);
$("#view-diapers").addEventListener("click", () => {
  renderDiaperHistory();
  diaperHistoryDialog.showModal();
});
$("#close-diaper-history").addEventListener("click", () => diaperHistoryDialog.close());
$("#done-diaper-history").addEventListener("click", () => diaperHistoryDialog.close());
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
  void playAlarmSound();
  if ("vibrate" in navigator) navigator.vibrate([180, 90, 180]);
  void showNotification("Nurture alarm test", "Your feeding reminder is ready.", "nurture-alarm-test");
  updateAlarmUI("Test alarm played");
});

document.addEventListener("pointerdown", () => {
  if (alarmEnabled) void prepareAudio();
}, { once: true });

setGreeting();
render();
renderHistory();
renderDiaperHistory();
updateAlarmUI();
setInterval(render, 1000);
setInterval(renderHistory, 60000);
setInterval(renderDiaperHistory, 60000);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    await navigator.serviceWorker.register("./sw.js");
    void syncPushReminder();
  });
}

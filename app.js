const STORAGE_KEY = "nurture-feeding-state";
const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
let intervalHours = Number(state.intervalHours) || 3;
let lastFeeding = state.lastFeeding ? new Date(state.lastFeeding) : null;
let alarmEnabled = state.alarmEnabled === true;
let lastAlarmedFor = state.lastAlarmedFor || null;
let alarmAudioContext = null;

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

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    intervalHours,
    lastFeeding: lastFeeding?.toISOString() || null,
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
    alarmStatus.textContent = "Off · turn on for an alert when time is up";
  } else if ("Notification" in window && Notification.permission === "granted") {
    alarmStatus.textContent = "On · chime, vibration and notification";
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

function logFeeding(date = new Date()) {
  lastFeeding = date;
  lastAlarmedFor = null;
  save();
  render();
}

function openTimeDialog() {
  const date = lastFeeding || new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  timeInput.value = local;
  dialog.showModal();
}

$("#feed-now").addEventListener("click", () => logFeeding());
$("#edit-time").addEventListener("click", openTimeDialog);
$("#time-form").addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const value = new Date(timeInput.value);
  if (!Number.isNaN(value.getTime())) logFeeding(value);
  dialog.close();
});
document.querySelectorAll(".interval-option").forEach(button => button.addEventListener("click", () => {
  intervalHours = Number(button.dataset.hours);
  lastAlarmedFor = null;
  save();
  render();
}));
$("#custom-hours").addEventListener("change", (event) => {
  const value = Number(event.target.value);
  if (value >= 0.25 && value <= 24) {
    intervalHours = value;
    lastAlarmedFor = null;
    save();
    render();
  } else render();
});

alarmToggle.addEventListener("click", async () => {
  if (alarmEnabled) {
    alarmEnabled = false;
    save();
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
updateAlarmUI();
setInterval(render, 1000);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

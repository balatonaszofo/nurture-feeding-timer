const STORAGE_KEY = "nurture-feeding-state";
const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
let intervalHours = Number(state.intervalHours) || 3;
let lastFeeding = state.lastFeeding ? new Date(state.lastFeeding) : null;

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
const installDialog = $("#install-dialog");
const installButton = $("#install-app");
let installPrompt = null;

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ intervalHours, lastFeeding: lastFeeding?.toISOString() || null }));
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
  save();
  render();
}));
$("#custom-hours").addEventListener("change", (event) => {
  const value = Number(event.target.value);
  if (value >= 0.25 && value <= 24) {
    intervalHours = value;
    save();
    render();
  } else render();
});

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function markInstalled() {
  installButton.textContent = "Added to Home Screen";
  installButton.disabled = true;
}

function showInstallInstructions() {
  const userAgent = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(userAgent);
  const steps = isIOS
    ? ["Open this page in <strong>Safari</strong>.", "Tap the <strong>Share</strong> button.", "Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>."]
    : isAndroid
      ? ["Open your browser menu (usually <strong>⋮</strong>).", "Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.", "Confirm by tapping <strong>Install</strong> or <strong>Add</strong>."]
      : ["Open this page on your phone.", "On iPhone, use Safari’s <strong>Share → Add to Home Screen</strong>.", "On Android, use the browser menu’s <strong>Install app</strong> option."];
  $("#install-steps").innerHTML = steps.map(step => `<li>${step}</li>`).join("");
  installDialog.showModal();
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  installButton.textContent = "Install app";
});

installButton.addEventListener("click", async () => {
  if (installPrompt) {
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") markInstalled();
    installPrompt = null;
    return;
  }
  showInstallInstructions();
});
$("#close-install-dialog").addEventListener("click", () => installDialog.close());
$("#got-it").addEventListener("click", () => installDialog.close());
window.addEventListener("appinstalled", markInstalled);

setGreeting();
render();
if (isStandalone()) markInstalled();
setInterval(render, 1000);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

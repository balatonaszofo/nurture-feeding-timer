import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import webpush from "web-push";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(currentDir, "data");
const dataFile = path.join(dataDir, "reminders.json");
const port = Number(process.env.PORT) || 8787;
const allowedOrigin = process.env.NURTURE_ALLOWED_ORIGIN || "https://balatonaszofo.github.io";
const vapidSubject = process.env.NURTURE_VAPID_SUBJECT;
const vapidPublicKey = process.env.NURTURE_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.NURTURE_VAPID_PRIVATE_KEY;

if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
  throw new Error("Missing VAPID configuration. Run `npm run setup`, then complete server/.env.");
}

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const app = express();
let reminders = {};
let persistQueue = Promise.resolve();
let checkingReminders = false;

async function loadReminders() {
  await mkdir(dataDir, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(dataFile, "utf8"));
    reminders = parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    reminders = {};
  }
}

function persistReminders() {
  persistQueue = persistQueue.then(async () => {
    const temporaryFile = `${dataFile}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(reminders, null, 2), "utf8");
    await rename(temporaryFile, dataFile);
  });
  return persistQueue;
}

function validDeviceId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{20,80}$/.test(value);
}

function validSubscription(subscription) {
  return subscription
    && typeof subscription.endpoint === "string"
    && subscription.endpoint.startsWith("https://")
    && typeof subscription.keys?.p256dh === "string"
    && typeof subscription.keys?.auth === "string";
}

function requireAllowedOrigin(request, response, next) {
  const origin = request.get("origin");
  if (origin !== allowedOrigin) return response.status(403).json({ error: "Origin not allowed" });
  next();
}

app.use((request, response, next) => {
  const origin = request.get("origin");
  if (origin === allowedOrigin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (request.method === "OPTIONS") return response.sendStatus(origin === allowedOrigin ? 204 : 403);
  next();
});
app.use(express.json({ limit: "24kb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true, reminders: Object.keys(reminders).length });
});

app.get("/api/config", (request, response) => {
  if (request.get("origin") !== allowedOrigin) return response.status(403).json({ error: "Origin not allowed" });
  response.json({ vapidPublicKey });
});

app.put("/api/reminders/:deviceId", requireAllowedOrigin, async (request, response) => {
  const { deviceId } = request.params;
  const { subscription, dueAt } = request.body || {};
  const dueTime = new Date(dueAt);
  const now = Date.now();
  if (!validDeviceId(deviceId) || !validSubscription(subscription) || Number.isNaN(dueTime.getTime())) {
    return response.status(400).json({ error: "Invalid reminder" });
  }
  if (dueTime.getTime() < now - 60000 || dueTime.getTime() > now + 48 * 3600000) {
    return response.status(400).json({ error: "Reminder must be within the next 48 hours" });
  }
  if (!(deviceId in reminders) && Object.keys(reminders).length >= 100) {
    return response.status(503).json({ error: "Reminder capacity reached" });
  }
  reminders[deviceId] = {
    subscription,
    dueAt: dueTime.toISOString(),
    updatedAt: new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: null
  };
  await persistReminders();
  response.json({ ok: true, dueAt: reminders[deviceId].dueAt });
});

app.delete("/api/reminders/:deviceId", requireAllowedOrigin, async (request, response) => {
  if (!validDeviceId(request.params.deviceId)) return response.status(400).json({ error: "Invalid device" });
  delete reminders[request.params.deviceId];
  await persistReminders();
  response.json({ ok: true });
});

async function deliverDueReminders() {
  if (checkingReminders) return;
  checkingReminders = true;
  try {
    const now = Date.now();
    let changed = false;
    for (const [deviceId, reminder] of Object.entries(reminders)) {
      const dueTime = new Date(reminder.dueAt).getTime();
      const nextAttempt = reminder.nextAttemptAt ? new Date(reminder.nextAttemptAt).getTime() : 0;
      if (Number.isNaN(dueTime) || now > dueTime + 15 * 60000) {
        delete reminders[deviceId];
        changed = true;
        continue;
      }
      if (dueTime > now || nextAttempt > now) continue;
      try {
        await webpush.sendNotification(reminder.subscription, JSON.stringify({
          title: "It's feeding time",
          body: "The feeding timer has reached zero.",
          tag: "nurture-feeding-alarm",
          url: "./"
        }), { TTL: 900, urgency: "high" });
        delete reminders[deviceId];
        changed = true;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          delete reminders[deviceId];
        } else {
          reminder.attempts = (reminder.attempts || 0) + 1;
          reminder.nextAttemptAt = new Date(now + Math.min(300000, reminder.attempts * 30000)).toISOString();
        }
        changed = true;
      }
    }
    if (changed) await persistReminders();
  } finally {
    checkingReminders = false;
  }
}

await loadReminders();
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Nurture push server listening on http://127.0.0.1:${port}`);
  console.log(`Accepting schedules from ${allowedOrigin}`);
});
const scheduler = setInterval(() => void deliverDueReminders(), 10000);
void deliverDueReminders();

function shutdown() {
  clearInterval(scheduler);
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

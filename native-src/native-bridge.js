import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { LocalNotifications } from "@capacitor/local-notifications";

const REMINDER_ID = 1401;
const TEST_REMINDER_ID = 1402;
const isNative = Capacitor.isNativePlatform();

async function setTheme(darkMode) {
  if (!isNative) return;
  document.documentElement.classList.add("native-app");
  await SystemBars.setStyle({ style: darkMode ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
}

async function signInWithGoogle() {
  if (!isNative) return null;
  const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
  return result.credential || null;
}

async function signOut() {
  if (!isNative) return;
  await FirebaseAuthentication.signOut();
}

async function ensureNotificationPermission() {
  if (!isNative) return false;
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display === "prompt" || permission.display === "prompt-with-rationale") {
    permission = await LocalNotifications.requestPermissions();
  }
  return permission.display === "granted";
}

async function cancelReminder() {
  if (!isNative) return;
  await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
}

async function scheduleReminder(dueAt) {
  if (!isNative || !(await ensureNotificationPermission())) return false;
  const at = new Date(dueAt);
  if (Number.isNaN(at.getTime()) || at <= new Date()) {
    await cancelReminder();
    return false;
  }
  await cancelReminder();
  await LocalNotifications.schedule({
    notifications: [{
      id: REMINDER_ID,
      title: "Time for the next feeding",
      body: "Nurture Day says your feeding interval is up.",
      schedule: { at, allowWhileIdle: true },
      autoCancel: true,
      foreground: true,
      extra: { destination: "feeding-timer" }
    }]
  });
  return true;
}

async function testReminder() {
  if (!isNative || !(await ensureNotificationPermission())) return false;
  await LocalNotifications.cancel({ notifications: [{ id: TEST_REMINDER_ID }] });
  await LocalNotifications.schedule({
    notifications: [{
      id: TEST_REMINDER_ID,
      title: "Nurture Day alarm test",
      body: "Your feeding reminder is ready.",
      schedule: { at: new Date(Date.now() + 1200) },
      autoCancel: true,
      foreground: true
    }]
  });
  return true;
}

window.NURTURE_NATIVE = {
  isNative,
  setTheme,
  signInWithGoogle,
  signOut,
  scheduleReminder,
  cancelReminder,
  testReminder
};

if (isNative) {
  document.documentElement.classList.add("native-app");
  void setTheme(document.documentElement.dataset.theme === "dark");
}

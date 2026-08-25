import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const auth = readFileSync(new URL("../auth.js", import.meta.url), "utf8");
const config = JSON.parse(readFileSync(new URL("../capacitor.config.json", import.meta.url), "utf8"));
const bridge = readFileSync(new URL("../native-src/native-bridge.js", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");

test("Android shell uses the Nurture Day identity and modern system bars", () => {
  assert.equal(config.appId, "com.nurtureday.app");
  assert.equal(config.appName, "Nurture Day");
  assert.equal(config.plugins.SystemBars.insetsHandling, "css");
  assert.match(bridge, /SystemBars\.setStyle/);
  assert.match(app, /NURTURE_NATIVE\?\.setTheme\(darkMode\)/);
});

test("native Google sign-in hands its credential to the Firebase web session", () => {
  assert.deepEqual(config.plugins.FirebaseAuthentication.providers, ["google.com"]);
  assert.equal(config.plugins.FirebaseAuthentication.skipNativeAuth, true);
  assert.match(bridge, /FirebaseAuthentication\.signInWithGoogle/);
  assert.match(auth, /GoogleAuthProvider\.credential\(nativeCredential\.idToken/);
  assert.match(auth, /signInWithCredential\(services\.auth, googleCredential\)/);
});

test("native feeding alarms use device-scheduled local notifications", () => {
  assert.match(bridge, /LocalNotifications\.schedule/);
  assert.match(bridge, /allowWhileIdle:\s*true/);
  assert.match(app, /NURTURE_NATIVE\.scheduleReminder/);
  assert.match(manifest, /android\.permission\.SCHEDULE_EXACT_ALARM/);
});

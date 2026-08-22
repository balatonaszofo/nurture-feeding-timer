import {
  ACTIVE_PROFILE_KEY,
  LEGACY_STORAGE_KEY,
  LEGACY_MIGRATED_KEY,
  createLocalProfileId,
  hasCareData,
  isFirebaseConfigured,
  mergeCareStates,
  migrateLegacyState,
  profileStorageKey,
  safeParseState
} from "./identity-core.js";

const FIREBASE_VERSION = "12.17.1";
const AUTH_CHOICE_KEY = "nurture-auth-choice";
const appShell = document.querySelector(".app-shell");
const authGate = document.querySelector("#auth-gate");
const welcomeStep = document.querySelector("#welcome-step");
const signInStep = document.querySelector("#signin-step");
const loadingStep = document.querySelector("#auth-loading-step");
const authMessage = document.querySelector("#auth-message");
const googleButton = document.querySelector("#google-login");
const guestButton = document.querySelector("#guest-login");
const accountButton = document.querySelector("#account-button");
const accountDialog = document.querySelector("#account-dialog");
const accountName = document.querySelector("#account-name");
const accountDetail = document.querySelector("#account-detail");
const accountSync = document.querySelector("#account-sync");
const accountGoogle = document.querySelector("#account-google");
const accountExit = document.querySelector("#account-exit");

let firebaseServices = null;
let activeIdentity = null;
let appLoaded = false;

function showStep(step) {
  [welcomeStep, signInStep, loadingStep].forEach(section => {
    section.hidden = section !== step;
  });
}

function setMessage(message = "", isError = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle("error", isError);
}

function setBusy(isBusy, message = "Preparing your private space…") {
  googleButton.disabled = isBusy;
  guestButton.disabled = isBusy;
  if (isBusy) {
    document.querySelector("#auth-loading-copy").textContent = message;
    showStep(loadingStep);
  }
}

function currentProfileState() {
  const activeProfile = localStorage.getItem(ACTIVE_PROFILE_KEY);
  if (activeProfile) return safeParseState(localStorage.getItem(profileStorageKey(activeProfile)));
  if (localStorage.getItem(LEGACY_MIGRATED_KEY)) return {};
  return safeParseState(localStorage.getItem(LEGACY_STORAGE_KEY));
}

function friendlyAuthError(error) {
  const code = String(error?.code || "");
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "Google sign-in was canceled. Your existing logs are unchanged.";
  if (code === "auth/popup-blocked") return "Your browser blocked the Google sign-in window. Allow pop-ups for Nurture and try again.";
  if (code === "auth/unauthorized-domain") return "This web address must be added to Firebase Authentication's authorized domains.";
  if (code === "auth/network-request-failed") return "Google sign-in needs an internet connection. You can continue privately for now.";
  if (code === "auth/operation-not-allowed") return "This sign-in option still needs to be enabled in Firebase Authentication.";
  return "We couldn't finish sign-in. You can try again or continue without Google.";
}

async function loadFirebase() {
  if (firebaseServices) return firebaseServices;
  const config = window.NURTURE_FIREBASE_CONFIG;
  if (!isFirebaseConfigured(config)) return null;
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`)
  ]);
  const firebaseApp = appSdk.initializeApp(config);
  const auth = authSdk.getAuth(firebaseApp);
  try {
    await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
  } catch {
    // Firebase still provides the best persistence available in this browser.
  }
  firebaseServices = { auth, authSdk, db: firestoreSdk.getFirestore(firebaseApp), firestoreSdk };
  return firebaseServices;
}

function waitForInitialUser(services) {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    unsubscribe = services.authSdk.onAuthStateChanged(services.auth, user => {
      unsubscribe();
      resolve(user);
    }, reject);
  });
}

function setSyncStatus(message, state = "") {
  accountSync.textContent = message;
  accountSync.dataset.state = state;
}

function createCloudController(user, services) {
  const reference = services.firestoreSdk.doc(services.db, "users", user.uid);
  let pendingState = null;
  let saveTimer = null;

  async function writeNow() {
    if (!pendingState) return;
    const stateToSave = pendingState;
    pendingState = null;
    setSyncStatus("Saving securely…", "saving");
    try {
      await services.firestoreSdk.setDoc(reference, {
        state: stateToSave,
        schemaVersion: 1,
        updatedAt: services.firestoreSdk.serverTimestamp()
      });
      setSyncStatus("Private cloud backup is up to date", "saved");
    } catch {
      pendingState = stateToSave;
      setSyncStatus("Saved on this device · cloud sync will retry", "offline");
    }
  }

  return {
    scheduleSave(state) {
      pendingState = state;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void writeNow(), 700);
    },
    async load(localState) {
      try {
        const snapshot = await services.firestoreSdk.getDoc(reference);
        const remoteState = snapshot.exists() ? snapshot.data()?.state : {};
        const merged = mergeCareStates(remoteState, localState);
        if (hasCareData(merged) && JSON.stringify(merged) !== JSON.stringify(remoteState)) {
          pendingState = merged;
          await writeNow();
        } else {
          setSyncStatus("Private cloud backup is up to date", "saved");
        }
        return merged;
      } catch {
        setSyncStatus("Using this device · cloud unavailable", "offline");
        return localState;
      }
    },
    flush() {
      clearTimeout(saveTimer);
      return writeNow();
    }
  };
}

function updateAccountUi(identity) {
  activeIdentity = identity;
  const googleUser = identity.kind === "google";
  const displayName = googleUser ? identity.user.displayName || "Google account" : "Private guest";
  const shortName = googleUser ? displayName.split(/\s+/)[0] : "Private";
  document.querySelector("#account-avatar").textContent = googleUser ? shortName.charAt(0).toUpperCase() : "♡";
  document.querySelector("#account-label").textContent = shortName;
  accountName.textContent = displayName;
  accountDetail.textContent = googleUser
    ? identity.user.email || "Signed in with Google"
    : identity.cloud
      ? "No Google account · recoverable only in this browser"
      : "Stored only in this browser on this device";
  accountGoogle.hidden = googleUser;
  accountExit.textContent = googleUser ? "Sign out" : "Return to welcome";
  if (!identity.cloud) setSyncStatus("On-device storage only", "local");
  accountButton.hidden = false;
}

async function openApp(identity, sourceState = {}) {
  const profileId = identity.profileId;
  const storageKey = profileStorageKey(profileId);
  localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
  const migrated = migrateLegacyState(localStorage, storageKey);
  let state = mergeCareStates(migrated, sourceState);
  let cloud = null;

  if (identity.user && firebaseServices) {
    cloud = createCloudController(identity.user, firebaseServices);
    state = await cloud.load(state);
  }

  localStorage.setItem(storageKey, JSON.stringify(state));
  window.NURTURE_STORAGE_KEY = storageKey;
  window.NURTURE_PROFILE_ID = profileId;
  window.NURTURE_CLOUD = cloud;
  window.NURTURE_IDENTITY = identity;
  if (appLoaded) {
    window.location.reload();
    return;
  }
  updateAccountUi({ ...identity, cloud: Boolean(cloud) });
  authGate.hidden = true;
  appShell.hidden = false;
  document.body.classList.remove("auth-open");
  if (!appLoaded) {
    appLoaded = true;
    await import("./app.js?v=16");
  }
}

async function openLocalGuest(sourceState = {}) {
  const profileId = createLocalProfileId(localStorage, crypto.randomUUID?.bind(crypto));
  localStorage.setItem(AUTH_CHOICE_KEY, "guest");
  await openApp({ kind: "guest", profileId, user: null }, sourceState);
}

async function openFirebaseUser(user, kind, sourceState = {}) {
  const profileId = `firebase-${user.uid}`;
  localStorage.setItem(AUTH_CHOICE_KEY, kind === "google" ? "google" : "guest");
  await openApp({ kind, profileId, user }, sourceState);
}

async function continueAsGuest() {
  const sourceState = currentProfileState();
  setBusy(true, "Creating a private guest profile…");
  try {
    const services = await loadFirebase();
    if (!services) {
      await openLocalGuest(sourceState);
      return;
    }
    const userCredential = services.auth.currentUser?.isAnonymous
      ? { user: services.auth.currentUser }
      : await services.authSdk.signInAnonymously(services.auth);
    await openFirebaseUser(userCredential.user, "guest", sourceState);
  } catch {
    await openLocalGuest(sourceState);
  }
}

async function continueWithGoogle(fromAccount = false) {
  const sourceState = currentProfileState();
  setMessage();
  if (fromAccount) {
    accountGoogle.disabled = true;
    setSyncStatus("Opening Google sign-in…", "saving");
  } else {
    setBusy(true, "Opening Google sign-in…");
  }
  try {
    const services = await loadFirebase();
    if (!services) {
      if (fromAccount) {
        setSyncStatus("Google sign-in needs the Firebase connection", "offline");
        accountGoogle.disabled = false;
        return;
      }
      showStep(signInStep);
      setMessage("Google sign-in needs the Firebase web configuration. Continue privately for now; your logs will stay safe on this device.", true);
      googleButton.disabled = false;
      guestButton.disabled = false;
      return;
    }
    const provider = new services.authSdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    let credential;
    if (services.auth.currentUser?.isAnonymous) {
      try {
        credential = await services.authSdk.linkWithPopup(services.auth.currentUser, provider);
      } catch (error) {
        const existingCredential = services.authSdk.GoogleAuthProvider.credentialFromError(error);
        if (!existingCredential || !["auth/credential-already-in-use", "auth/email-already-in-use"].includes(error?.code)) throw error;
        credential = await services.authSdk.signInWithCredential(services.auth, existingCredential);
      }
    } else {
      credential = await services.authSdk.signInWithPopup(services.auth, provider);
    }
    if (fromAccount) accountDialog.close();
    await openFirebaseUser(credential.user, "google", sourceState);
  } catch (error) {
    if (fromAccount) {
      setSyncStatus(friendlyAuthError(error), "offline");
      accountGoogle.disabled = false;
      return;
    }
    showStep(signInStep);
    setMessage(friendlyAuthError(error), true);
    googleButton.disabled = false;
    guestButton.disabled = false;
  }
}

async function start() {
  document.body.classList.add("auth-open");
  const configured = isFirebaseConfigured(window.NURTURE_FIREBASE_CONFIG);
  document.querySelector("#google-setup-note").hidden = configured;
  const choice = localStorage.getItem(AUTH_CHOICE_KEY);

  if (!choice) {
    if (configured) void loadFirebase().catch(() => {});
    showStep(welcomeStep);
    return;
  }

  setBusy(true);
  if (!configured) {
    if (choice === "guest") await openLocalGuest(currentProfileState());
    else {
      showStep(signInStep);
      googleButton.disabled = false;
      guestButton.disabled = false;
    }
    return;
  }

  try {
    const services = await loadFirebase();
    const user = await waitForInitialUser(services);
    if (user) {
      const kind = user.isAnonymous ? "guest" : "google";
      await openFirebaseUser(user, kind, currentProfileState());
    } else if (choice === "guest") {
      await continueAsGuest();
    } else {
      showStep(signInStep);
      googleButton.disabled = false;
      guestButton.disabled = false;
    }
  } catch {
    if (choice === "guest") await openLocalGuest(currentProfileState());
    else {
      showStep(signInStep);
      setMessage("Sign-in is temporarily unavailable. You can continue privately on this device.", true);
      googleButton.disabled = false;
      guestButton.disabled = false;
    }
  }
}

document.querySelector("#welcome-continue").addEventListener("click", () => showStep(signInStep));
document.querySelector("#signin-back").addEventListener("click", () => {
  setMessage();
  showStep(welcomeStep);
});
googleButton.addEventListener("click", () => void continueWithGoogle());
guestButton.addEventListener("click", () => void continueAsGuest());
accountButton.addEventListener("click", () => accountDialog.showModal());
document.querySelector("#close-account").addEventListener("click", () => accountDialog.close());
document.querySelector("#done-account").addEventListener("click", () => accountDialog.close());
accountGoogle.addEventListener("click", () => void continueWithGoogle(true));
accountExit.addEventListener("click", async () => {
  if (activeIdentity?.kind === "google" && firebaseServices?.auth.currentUser) {
    await firebaseServices.authSdk.signOut(firebaseServices.auth);
  }
  localStorage.removeItem(AUTH_CHOICE_KEY);
  localStorage.removeItem(ACTIVE_PROFILE_KEY);
  window.location.reload();
});
window.addEventListener("pagehide", () => void window.NURTURE_CLOUD?.flush());

void start();

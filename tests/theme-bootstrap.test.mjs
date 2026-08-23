import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const bootstrap = html.match(/<script data-theme-bootstrap>([\s\S]*?)<\/script>/)?.[1];

function runThemeBootstrap(savedState, activeProfile = null) {
  const themeMeta = {
    content: "#111a1b",
    setAttribute(name, value) {
      if (name === "content") this.content = value;
    }
  };
  const root = { dataset: {} };
  const context = {
    document: {
      documentElement: root,
      querySelector() { return themeMeta; }
    },
    localStorage: {
      getItem(key) {
        if (key === "nurture-active-profile") return activeProfile;
        if (activeProfile && key === `nurture-feeding-state:${activeProfile}`) return JSON.stringify(savedState);
        if (!activeProfile && key === "nurture-feeding-state") return JSON.stringify(savedState);
        return null;
      }
    }
  };
  vm.runInNewContext(bootstrap, context);
  return { root, themeMeta };
}

test("saved dark mode is applied before the app renders", () => {
  assert.ok(bootstrap, "theme bootstrap script is present in the document head");
  assert.match(html, /apple-mobile-web-app-status-bar-style" content="black"/);
  const { root, themeMeta } = runThemeBootstrap({ darkMode: true });
  assert.equal(root.dataset.theme, "dark");
  assert.equal(themeMeta.content, "#111a1b");
});

test("saved light mode keeps the status bar light", () => {
  assert.match(html, /meta name="theme-color" content="#111a1b"/);
  const { root, themeMeta } = runThemeBootstrap({ darkMode: false });
  assert.equal(root.dataset.theme, "light");
  assert.equal(themeMeta.content, "#fffaf6");
});

test("new profiles and the installed-app splash default to dark", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
  const { root, themeMeta } = runThemeBootstrap({});
  assert.equal(root.dataset.theme, "dark");
  assert.equal(themeMeta.content, "#111a1b");
  assert.equal(manifest.background_color, "#111a1b");
  assert.equal(manifest.theme_color, "#111a1b");
  assert.match(app, /let darkMode = state\.darkMode !== false/);
});

test("startup theme comes from the active private profile", () => {
  const { root, themeMeta } = runThemeBootstrap({ darkMode: true }, "firebase-user-a");
  assert.equal(root.dataset.theme, "dark");
  assert.equal(themeMeta.content, "#111a1b");
});

test("theme changes refresh installed-app system bars", () => {
  assert.match(html, /meta name="color-scheme" content="light dark"/);
  assert.match(app, /themeMeta\.remove\(\)/);
  assert.match(app, /display-mode: standalone/);
  assert.match(app, /window\.location\.reload\(\)/);
});

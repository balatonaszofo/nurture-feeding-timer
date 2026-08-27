import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootFile = name => new URL(`../${name}`, import.meta.url);

test("website and install metadata use the Nurture Day name", () => {
  const page = readFileSync(rootFile("index.html"), "utf8");
  const manifest = JSON.parse(readFileSync(rootFile("manifest.webmanifest"), "utf8"));

  assert.equal(manifest.name, "Nurture Day");
  assert.equal(manifest.short_name, "Nurture Day");
  assert.equal(manifest.theme_color, "#111a1b");
  assert.match(page, /<title>Nurture Day · Feeding Timer<\/title>/);
  assert.match(page, /apple-mobile-web-app-title" content="Nurture Day"/);
  assert.equal((page.match(/class="brand-daily">day/g) || []).length, 2);
});

test("launcher artwork supplies standard and maskable PNG icons", () => {
  const manifest = JSON.parse(readFileSync(rootFile("manifest.webmanifest"), "utf8"));
  assert.ok(manifest.icons.some(icon => icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(manifest.icons.some(icon => icon.sizes === "512x512" && icon.purpose === "maskable"));

  for (const size of [180, 192, 512]) {
    const png = readFileSync(rootFile(`icons/icon-${size}.png`));
    assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

test("the app icon uses the coral wordmark without a dark Android surround", () => {
  const icon = readFileSync(rootFile("icon.svg"), "utf8");
  assert.match(icon, /<rect width="512" height="512" fill="#fae1d4"/);
  assert.match(icon, /fill="#e98768"/);
  assert.doesNotMatch(icon, /#263a3c/);
  assert.equal((icon.match(/<rect x=/g) || []).length, 3);
});

test("export is a bottom-page sheet and CSV restore lives under the profile", () => {
  const page = readFileSync(rootFile("index.html"), "utf8");
  const historyCardEnd = page.indexOf("</section>", page.indexOf('class="history-card"'));
  const exportButton = page.indexOf('id="export-care-log"');
  const accountDialog = page.indexOf('id="account-dialog"');
  const importButton = page.indexOf('id="import-care-log"');

  assert.ok(exportButton > historyCardEnd);
  assert.ok(importButton > accountDialog);
  assert.match(page, /id="export-dialog"[^]*id="export-google-sheets"[^]*id="download-care-log"/);
});

test("head-position tracking offers left, centered, and right with history and safe-sleep context", () => {
  const page = readFileSync(rootFile("index.html"), "utf8");
  const app = readFileSync(rootFile("app.js"), "utf8");

  assert.match(page, /id="log-head-position"/);
  assert.match(page, /id="head-position-session-controls"[^]*id="stop-head-position"/);
  assert.match(page, /name="head-position" value="left"/);
  assert.match(page, /name="head-position" value="back"/);
  assert.match(page, /name="head-position" value="right"/);
  assert.match(page, /place baby on their back[^]*records head direction only/i);
  assert.match(page, /id="head-position-history-dialog"/);
  assert.match(app, /headPositionHistory/);
  assert.match(app, /headPositionDetails/);
  assert.match(app, /function stopHeadPosition/);
});

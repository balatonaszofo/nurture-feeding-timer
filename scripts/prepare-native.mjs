import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import "./build-native-bridge.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const nativeWebRoot = resolve(projectRoot, "www");
if (!nativeWebRoot.startsWith(`${projectRoot}\\`) && !nativeWebRoot.startsWith(`${projectRoot}/`)) {
  throw new Error("Refusing to prepare native assets outside this project.");
}

await rm(nativeWebRoot, { recursive: true, force: true });
await mkdir(nativeWebRoot, { recursive: true });

const files = [
  "index.html", "styles.css", "app.js", "auth.js", "identity-core.js",
  "firebase-config.js", "push-config.js", "manifest.webmanifest", "sw.js",
  "icon.svg", "native-bridge.js"
];
for (const file of files) await cp(resolve(projectRoot, file), resolve(nativeWebRoot, file));
await cp(resolve(projectRoot, "icons"), resolve(nativeWebRoot, "icons"), { recursive: true });

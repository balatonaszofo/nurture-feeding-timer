import { build } from "esbuild";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");

await build({
  absWorkingDir: projectRoot,
  entryPoints: [resolve(projectRoot, "native-src/native-bridge.js")],
  outfile: resolve(projectRoot, "native-bridge.js"),
  bundle: true,
  format: "esm",
  minify: true,
  sourcemap: false,
  target: ["es2022"]
});

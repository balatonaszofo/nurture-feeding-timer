import { access, writeFile } from "node:fs/promises";
import webpush from "web-push";

const envPath = new URL(".env", import.meta.url);

try {
  await access(envPath);
  console.error("server/.env already exists; setup left it unchanged.");
  process.exitCode = 1;
} catch {
  const keys = webpush.generateVAPIDKeys();
  const env = [
    "PORT=8787",
    "NURTURE_ALLOWED_ORIGIN=https://balatonaszofo.github.io",
    "NURTURE_VAPID_SUBJECT=mailto:replace-with-your-email@example.com",
    `NURTURE_VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `NURTURE_VAPID_PRIVATE_KEY=${keys.privateKey}`,
    ""
  ].join("\n");
  await writeFile(envPath, env, { encoding: "utf8", flag: "wx" });
  console.log("Created server/.env with fresh VAPID keys.");
  console.log("Replace NURTURE_VAPID_SUBJECT with an email address before starting the server.");
}

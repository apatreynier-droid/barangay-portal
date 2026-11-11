/**
 * (Re)create the local HTTPS certificate for this computer's current
 * addresses, so phones on the same Wi-Fi/hotspot can open the portal.
 *
 *   npm run cert        (FRONTEND TERMINAL, in barangay_portal_system)
 *
 * Covers localhost, 127.0.0.1, ::1 and every private IPv4 address of this
 * computer (Wi-Fi, hotspot, Ethernet). Run it again whenever the IP changes
 * (another network), then restart both servers. Needs mkcert (HTTPS_SETUP.md).
 * The files go to certs/ (git-ignored); the private key never leaves this PC.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const certDir = join(root, "certs");

/** 10.x, 172.16-31.x, 192.168.x and 100.64-127.x (carrier/ISP shared space). */
const isPrivateIPv4 = (address) => {
  const [a, b] = address.split(".").map(Number);
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
};

const lanAddresses = [
  ...new Set(
    Object.values(networkInterfaces())
      .flat()
      .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
      .map((entry) => entry.address)
      .filter(isPrivateIPv4),
  ),
];

const names = ["localhost", "127.0.0.1", "::1", ...lanAddresses];
mkdirSync(certDir, { recursive: true });

try {
  execFileSync(
    "mkcert",
    [
      "-cert-file",
      join(certDir, "localhost.pem"),
      "-key-file",
      join(certDir, "localhost-key.pem"),
      ...names,
    ],
    { stdio: "inherit" },
  );
} catch (error) {
  console.error(
    error.code === "ENOENT"
      ? "\nmkcert was not found. Install it (winget install FiloSottile.mkcert),\nreopen the terminal, then run `npm run cert` again."
      : "\nmkcert failed (see the message above).",
  );
  process.exit(1);
}

console.log("\nCertificate covers:", names.join(", "));
if (lanAddresses.length === 0) {
  console.log("No Wi-Fi/LAN address found: only this computer can open the portal.");
} else {
  console.log("\nOn your phone (same Wi-Fi or hotspot), open:");
  for (const address of lanAddresses) {
    console.log(`  https://${address}:5173`);
  }
}
console.log("\nRestart both servers (npm run dev / python run_https.py) to use it.");

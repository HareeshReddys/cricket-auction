// Creates synthetic records only on the loopback API. No production credentials.
import fs from "node:fs/promises";
const base = "http://127.0.0.1:8787/api";
async function call(path, body, token) {
  const r = await fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  return d;
}
let auth;
try {
  auth = await call("/auth/bootstrap", {
    email: "demo@boundary.test",
    password: "Local-demo-password-123",
    setupToken: "local-preview-only-setup",
  });
} catch {
  auth = await call("/auth/login", {
    email: "demo@boundary.test",
    password: "Local-demo-password-123",
  });
}
const t = await call(
  "/tournaments",
  {
    name: "Friends XI Premier League",
    settings: {
      fee: 0,
      date: "2026-12-12",
      venue: "Hyderabad Cricket Ground",
      registrationOpen: true,
      liveEnabled: true,
    },
  },
  auth.token,
);
const invitation = await call(
  "/tournaments/" + t.id + "/invites",
  { email: "owner@boundary.test" },
  auth.token,
);
await fs.mkdir("outputs", { recursive: true });
await fs.writeFile(
  "outputs/local-preview.json",
  JSON.stringify({ tournamentId: t.id, invite: invitation.token }),
);
console.log(
  "Local preview tournament created; fixture references saved under ignored outputs/.",
);

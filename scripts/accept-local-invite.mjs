import fs from "node:fs/promises";
const fixture = JSON.parse(
  await fs.readFile("outputs/local-preview.json", "utf8"),
);
const r = await fetch("http://127.0.0.1:8787/api/auth/accept-invite", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    token: fixture.invite,
    email: "owner@boundary.test",
    password: "Local-owner-password-123",
  }),
});
if (!r.ok) throw new Error("Local invite failed: " + (await r.text()));
console.log("Synthetic local owner account accepted its scoped invitation.");

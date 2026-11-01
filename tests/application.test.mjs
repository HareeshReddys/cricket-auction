import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs/promises";
import worker from "../backend/src/index.ts";
import { assetStorage } from "../backend/src/storage.ts";
import { drainSync } from "../backend/src/sheets.ts";
class DB {
  constructor(sqlite) {
    this.db = sqlite;
  }
  prepare(sql) {
    const db = this.db;
    return {
      params: [],
      bind(...params) {
        this.params = params;
        return this;
      },
      async first() {
        return db.prepare(sql).get(...this.params) || null;
      },
      async all() {
        return { results: db.prepare(sql).all(...this.params) };
      },
      sync() {
        const r = db.prepare(sql).run(...this.params);
        return { meta: { changes: Number(r.changes) } };
      },
      async run() {
        return this.sync();
      },
    };
  }
  async batch(statements) {
    this.db.exec("BEGIN");
    try {
      const r = statements.map((s) => s.sync());
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
class Bucket {
  files = new Map();
  async put(key, bytes, metadata) {
    this.files.set(key, {
      bytes: new Uint8Array(await new Response(bytes).arrayBuffer()),
      ...metadata,
    });
  }
  async get(key) {
    const f = this.files.get(key);
    return f ? { ...f, body: f.bytes } : null;
  }
  async delete(key) {
    this.files.delete(key);
  }
}
async function fixture(databaseAssets = false) {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of ["0001_tournaments.sql", "0002_accounts_and_sync.sql", "0003_database_assets.sql"])
    sqlite.exec(
      await fs.readFile(
        new URL("../backend/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  const env = {
    DB: new DB(sqlite),
    ...(databaseAssets ? {} : { BUCKET: new Bucket() }),
    FRONTEND_ORIGIN: "https://example.github.io",
    ADMIN_EMAIL: "admin@example.test",
    ADMIN_SETUP_TOKEN: "local-test-setup-token",
    ASSET_SIGNING_KEY: "local-test-asset-signing-key-32-bytes-long",
  };
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  async function call(
    path,
    body,
    token,
    method = body ? "POST" : "GET",
    status = 200,
  ) {
    const r = await worker.fetch(
      new Request("https://api.example.test/api" + path, {
        method,
        headers: {
          Origin: env.FRONTEND_ORIGIN,
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...(body && !(body instanceof FormData)
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(body
          ? { body: body instanceof FormData ? body : JSON.stringify(body) }
          : {}),
      }),
      env,
      ctx,
    );
    const d = await r.json();
    await Promise.all(waits.splice(0));
    assert.equal(r.status, status, JSON.stringify(d));
    return d;
  }
  const admin = await call("/auth/bootstrap", {
    email: env.ADMIN_EMAIL,
    password: "test-admin-password-123",
    setupToken: env.ADMIN_SETUP_TOKEN,
  });
  return { env, sqlite, call, admin, waits };
}
const image = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1cAAAAASUVORK5CYII=",
    "base64",
  ),
);
const registration = {
  name: "Arjun O'Neil",
  phone: "9876500011",
  cricHeroesNum: "CH-01",
  playerType: "Batsman",
  address: "Test address",
  availability: "Full tournament",
  agreed: true,
};
const settings = { fee: 0, registrationOpen: true, liveEnabled: true };
test("independent login, administrator creation rights, scoped one-time owner invitations", async () => {
  const { call, admin, sqlite } = await fixture();
  await call(
    "/auth/bootstrap",
    {
      email: "admin@example.test",
      password: "test-password-again",
      setupToken: "local-test-setup-token",
    },
    null,
    "POST",
    409,
  );
  await call(
    "/auth/login",
    { email: "admin@example.test", password: "incorrect" },
    null,
    "POST",
    401,
  );
  const session = await call("/auth/login", {
    email: "admin@example.test",
    password: "test-admin-password-123",
  });
  assert.ok(session.token);
  const a = await call(
      "/tournaments",
      { name: "Tournament A", settings },
      admin.token,
      "POST",
      201,
    ),
    b = await call(
      "/tournaments",
      { name: "Tournament B", settings },
      admin.token,
      "POST",
      201,
    );
  const invite = await call(
    "/tournaments/" + a.id + "/invites",
    { email: "owner@example.test" },
    admin.token,
  );
  const owner = await call("/auth/accept-invite", {
    email: "owner@example.test",
    password: "owner-test-password-123",
    token: invite.token,
  });
  assert.equal(owner.tournamentId, a.id);
  await call(
    "/auth/accept-invite",
    { email: "owner@example.test", token: invite.token },
    owner.token,
    "POST",
    410,
  );
  const list = await call("/tournaments", null, owner.token);
  assert.deepEqual(
    list.tournaments.map((t) => t.id),
    [a.id],
  );
  await call(
    "/tournaments",
    { name: "Unauthorized tournament", settings },
    owner.token,
    "POST",
    403,
  );
  await call(
    "/tournaments/" + b.id + "/snapshot",
    null,
    owner.token,
    "GET",
    403,
  );
  await call(
    "/tournaments/" + b.id + "/legacy?action=getAll",
    null,
    owner.token,
    "GET",
    403,
  );
  await call(
    "/tournaments/" + a.id + "/invites",
    { email: "outsider@example.test" },
    owner.token,
    "POST",
    403,
  );
  await call("/tournaments/" + a.id + "/snapshot", null, null, "GET", 401);
  const me = await call("/auth/session", null, owner.token);
  assert.equal(me.role, "organizer");
  assert.equal(me.admin, false);
  await call("/auth/logout", {}, owner.token);
  await call(
    "/tournaments/" + a.id + "/snapshot",
    null,
    owner.token,
    "GET",
    401,
  );
  const rows = sqlite.prepare("SELECT password_hash FROM users").all();
  assert.ok(rows.every((r) => r.password_hash.length === 64));
});
for (const databaseAssets of [false, true]) {
test(`public registration preserves original bytes and privacy (${databaseAssets ? "database" : "R2"} storage)`, async () => {
  const { env, call, admin } = await fixture(databaseAssets);
  const a = await call(
    "/tournaments",
    {
      name: "Original-quality test",
      settings: { ...settings, fee: 222, paymentPhone: "9999900000" },
    },
    admin.token,
    "POST",
    201,
  );
  const root = "/tournaments/" + a.id;
  const form = new FormData();
  for (const [k, v] of Object.entries({ ...registration, utr: "QA-UTR-1234" }))
    form.set(k, String(v));
  form.set(
    "photoURL",
    new File([image], "original.png", { type: "image/png" }),
  );
  form.set(
    "photoThumbURL",
    new File([image], "preview.png", { type: "image/png" }),
  );
  form.set(
    "payScreenshotURL",
    new File([image], "receipt.png", { type: "image/png" }),
  );
  const p = await call(root + "/register", form, null, "POST", 201);
  let snap = await call(root + "/snapshot", null, admin.token);
  assert.equal(snap.players.length, 1);
  assert.ok(!JSON.stringify(snap).includes("base64"));
  const original = snap.players[0].PhotoURL,
    receipt = snap.players[0].PayScreenshotURL;
  const key = new URL(original).pathname.split("/").pop();
  assert.deepEqual(new Uint8Array(await new Response((await assetStorage(env).get(key)).body).arrayBuffer()), image);
  assert.notEqual(snap.players[0].PhotoThumbURL, original);
  let imageResponse = await worker.fetch(new Request(original), env, {
    waitUntil() {},
  });
  assert.equal(imageResponse.status, 200);
  assert.deepEqual(new Uint8Array(await imageResponse.arrayBuffer()), image);
  imageResponse = await worker.fetch(new Request(receipt.split("?")[0]), env, {
    waitUntil() {},
  });
  assert.equal(imageResponse.status, 403);
  const teams = [
      { id: "t1", name: "Green XI", color: "#34D399", initialBudget: 100000 },
    ],
    state = [
      {
        id: p.regId,
        status: "sold",
        soldTo: "t1",
        soldPrice: 5500,
        basePrice: 3000,
      },
    ];
  await call(
    root + "/legacy",
    { action: "saveAuction", teams, auctState: state, revision: snap.revision },
    admin.token,
    "POST",
    400,
  );
  await call(
    root + "/legacy",
    { action: "updateStatus", regId: p.regId, status: "Verified" },
    admin.token,
  );
  snap = await call(root + "/snapshot", null, admin.token);
  await call(
    root + "/legacy",
    { action: "saveAuction", teams, auctState: state, revision: snap.revision },
    admin.token,
  );
  await call(
    root + "/legacy",
    { action: "saveAuction", teams, auctState: state, revision: snap.revision },
    admin.token,
    "POST",
    409,
  );
  snap = await call(root + "/snapshot", null, admin.token);
  assert.equal(snap.teams[0].budget, 94500);
  await call(
    root + "/legacy",
    {
      action: "saveAuction",
      teams,
      auctState: [{ ...state[0], soldPrice: 100001 }],
      revision: snap.revision,
    },
    admin.token,
    "POST",
    400,
  );
  const live = await call(root + "/live");
  assert.ok(!JSON.stringify(live).includes(registration.phone));
  assert.ok(!JSON.stringify(live).includes("QA-UTR"));
  await call(
    root + "/legacy",
    { action: "deletePlayer", regId: p.regId },
    admin.token,
    "POST",
    400,
  );
  const sync = await call(root + "/sync", null, admin.token);
  assert.equal(sync.sync.status, "not_configured");
});
}
test("Google Sheets automatically creates one workbook per tournament, batches updates and retries failures", async () => {
  const { env, call, admin } = await fixture();
  env.GOOGLE_OAUTH_CLIENT_ID = "test-client";
  env.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret";
  env.GOOGLE_OAUTH_REFRESH_TOKEN = "test-refresh";
  const actualFetch = globalThis.fetch;
  const calls = [];
  let created = 0,
    fail = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, body: init.body });
    let d = {};
    if (url.includes("oauth2.googleapis.com"))
      d = { access_token: "test-google-access-token", expires_in: 3600 };
    else if (url.includes("/drive/v3/files?q=")) d = { files: [] };
    else if (url.includes("/drive/v3/files?"))
      d = { id: "spreadsheet-" + ++created };
    else if (url.includes("?fields=sheets.properties")) d = { sheets: [] };
    if (fail && url.includes("/values:batchUpdate"))
      return Response.json(
        { error: { message: "Simulated quota limit" } },
        { status: 429 },
      );
    return Response.json(d);
  };
  try {
    const a = await call(
      "/tournaments",
      { name: "Auto Sheet A", settings },
      admin.token,
      "POST",
      201,
    );
    await drainSync(env);
    let sync = (await call("/tournaments/" + a.id + "/sync", null, admin.token))
      .sync;
    assert.equal(sync.status, "synced", JSON.stringify(sync));
    assert.equal(created, 1);
    assert.match(sync.url, /spreadsheet-1/);
    await call("/tournaments/" + a.id + "/sync", {}, admin.token);
    await drainSync(env);
    assert.equal(created, 1, "Updating a tournament reuses its existing Sheet");
    fail = true;
    const b = await call(
      "/tournaments",
      { name: "Auto Sheet B", settings },
      admin.token,
      "POST",
      201,
    );
    await drainSync(env);
    sync = (await call("/tournaments/" + b.id + "/sync", null, admin.token))
      .sync;
    assert.equal(sync.status, "error");
    assert.match(sync.last_error, /quota/);
    fail = false;
    await drainSync(env);
    sync = (await call("/tournaments/" + b.id + "/sync", null, admin.token))
      .sync;
    assert.equal(sync.status, "synced");
    assert.equal(created, 2, "Retries never create a second workbook");
    assert.ok(
      calls.some(
        (c) =>
          c.url.includes("/values:batchUpdate") &&
          JSON.parse(c.body).valueInputOption === "RAW",
      ),
    );
  } finally {
    globalThis.fetch = actualFetch;
  }
});

test("database images span chunks without altering bytes and delete completely", async () => {
  const { env, sqlite } = await fixture(true);
  const storage = assetStorage(env);
  const bytes = new Uint8Array(800000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  await storage.put("large", bytes, {httpMetadata: {contentType: "image/png"}, customMetadata: {kind: "payment", tid: "test"}});
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM asset_chunks").get().n, 4);
  const file = await storage.get("large");
  assert.deepEqual(file.body, bytes);
  assert.equal(file.customMetadata.kind, "payment");
  await storage.delete("large");
  assert.equal(await storage.get("large"), null);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM asset_chunks").get().n, 0);
});

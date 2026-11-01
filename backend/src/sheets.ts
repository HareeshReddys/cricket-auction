import type { Env } from "./types.ts";
const encoder = new TextEncoder();
let cachedToken: { token: string; expires: number } | null = null;
const base64url = (s: string) =>
  btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
function configured(env: Env) {
  return !!(
    (env.GOOGLE_SHEETS_WEBHOOK_URL && env.GOOGLE_SHEETS_WEBHOOK_SECRET) ||
    (env.GOOGLE_OAUTH_CLIENT_ID &&
      env.GOOGLE_OAUTH_CLIENT_SECRET &&
      env.GOOGLE_OAUTH_REFRESH_TOKEN) ||
    env.GOOGLE_SERVICE_ACCOUNT_JSON
  );
}
async function googleToken(env: Env) {
  if (cachedToken && cachedToken.expires > Date.now() + 60000)
    return cachedToken.token;
  let body: URLSearchParams;
  if (env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
    });
  } else {
    const account = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON!);
    const now = Math.floor(Date.now() / 1000);
    const head = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(
      JSON.stringify({
        iss: account.client_email,
        scope:
          "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
    const pem = account.private_key.replace(/-----[^-]+-----|\s/g, "");
    const bytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      "pkcs8",
      bytes,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        encoder.encode(head + "." + claims),
      ),
    );
    const assertion =
      head + "." + claims + "." + base64url(String.fromCharCode(...signature));
    body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    });
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body,
  });
  const d = (await response.json()) as any;
  if (!response.ok || !d.access_token)
    throw new Error(
      "Google authentication failed. Check the backend Google credentials.",
    );
  cachedToken = {
    token: d.access_token,
    expires: Date.now() + d.expires_in * 1000,
  };
  return cachedToken.token;
}
async function google(
  env: Env,
  url: string,
  body?: unknown,
  method = body ? "POST" : "GET",
) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + (await googleToken(env)),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = (await response.json()) as any;
  if (!response.ok) {
    if (response.status === 401) cachedToken = null;
    throw new Error(d.error?.message || "Google Sheets update failed.");
  }
  return d;
}
export async function enqueueSync(env: Env, id: string) {
  await env.DB.prepare(
    "INSERT INTO sheet_sync(tournament_id,status) VALUES(?,?) ON CONFLICT(tournament_id) DO UPDATE SET status=excluded.status",
  )
    .bind(id, configured(env) ? "pending" : "not_configured")
    .run();
}
async function findOrCreate(env: Env, t: any) {
  const query =
    "trashed=false and appProperties has { key='boundaryTournament' and value='" +
    t.id +
    "' }";
  const found = await google(
    env,
    "https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent(query) +
      "&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true",
  );
  let id = found.files?.[0]?.id;
  if (!id) {
    const created = await google(
      env,
      "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id",
      {
        name: t.name + " · Boundary",
        mimeType: "application/vnd.google-apps.spreadsheet",
        appProperties: { boundaryTournament: t.id },
        ...(env.GOOGLE_DRIVE_FOLDER_ID
          ? { parents: [env.GOOGLE_DRIVE_FOLDER_ID] }
          : {}),
      },
    );
    id = created.id;
  }
  const metadata = await google(
    env,
    "https://sheets.googleapis.com/v4/spreadsheets/" +
      id +
      "?fields=sheets.properties",
  );
  const names = new Set(metadata.sheets.map((s: any) => s.properties.title));
  const add = ["Registrations", "Teams", "Auction", "Settings"]
    .filter((n) => !names.has(n))
    .map((title) => ({
      addSheet: {
        properties: {
          title,
          gridProperties: { rowCount: 10000, columnCount: 24 },
        },
      },
    }));
  if (add.length)
    await google(
      env,
      "https://sheets.googleapis.com/v4/spreadsheets/" + id + ":batchUpdate",
      { requests: add },
    );
  if (env.GOOGLE_SHEET_SHARE_EMAIL) {
    const permissions = await google(
      env,
      "https://www.googleapis.com/drive/v3/files/" +
        id +
        "/permissions?fields=permissions(emailAddress,role)&supportsAllDrives=true",
    );
    if (
      !permissions.permissions?.some(
        (p: any) =>
          p.emailAddress?.toLowerCase() ===
          env.GOOGLE_SHEET_SHARE_EMAIL!.toLowerCase(),
      )
    )
      await google(
        env,
        "https://www.googleapis.com/drive/v3/files/" +
          id +
          "/permissions?supportsAllDrives=true&sendNotificationEmail=false",
        {
          type: "user",
          role: "writer",
          emailAddress: env.GOOGLE_SHEET_SHARE_EMAIL,
        },
      );
  }
  return id as string;
}
export async function drainSync(env: Env) {
  if (!configured(env)) return;
  const token = crypto.randomUUID();
  const lock = await env.DB.prepare(
    "INSERT INTO sync_lock(id,token,expires_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE expires_at<?",
  )
    .bind(token, Date.now() + 120000, Date.now())
    .run();
  if (!lock.meta.changes) return;
  try {
    const queue = await env.DB.prepare(
      "SELECT * FROM sheet_sync WHERE status IN ('pending','error') ORDER BY COALESCE(updated_at,'') ASC LIMIT 1",
    ).first<any>();
    if (!queue) return;
    try {
      const t = await env.DB.prepare("SELECT * FROM tournaments WHERE id=?")
        .bind(queue.tournament_id)
        .first<any>();
      if (!t) return;
      let id = queue.spreadsheet_id,
        url = queue.url;
      if (!env.GOOGLE_SHEETS_WEBHOOK_URL) {
        id = id || (await findOrCreate(env, t));
        url = "https://docs.google.com/spreadsheets/d/" + id + "/edit";
      }
      if (id)
        await env.DB.prepare(
          "UPDATE sheet_sync SET spreadsheet_id=?,url=? WHERE tournament_id=?",
        )
          .bind(id, url, t.id)
          .run();
      const rows = await env.DB.prepare(
        "SELECT data FROM players WHERE tournament_id=? ORDER BY rowid",
      )
        .bind(t.id)
        .all<any>();
      const players = rows.results.map((r) => JSON.parse(r.data));
      const auction = await env.DB.prepare(
        "SELECT teams,state FROM auctions WHERE tournament_id=?",
      )
        .bind(t.id)
        .first<any>();
      const teams = JSON.parse(auction?.teams || "[]"),
        state = JSON.parse(auction?.state || "[]");
      const pkeys = [
        "RegID",
        "Name",
        "CricHeroesNum",
        "Phone",
        "AltPhone",
        "PlayerType",
        "Address",
        "Availability",
        "UTR",
        "Status",
        "Timestamp",
        "RejectionReason",
        "PhotoURL",
        "PayScreenshotURL",
        "CricHeroesProfileURL",
      ];
      const tkeys = ["id", "name", "initialBudget", "budget", "color"];
      const akeys = [
        "id",
        "name",
        "role",
        "status",
        "soldTo",
        "soldPrice",
        "basePrice",
        "isFree",
        "comment",
      ];
      const settings = JSON.parse(t.settings);
      const data = [
        {
          range: "Registrations!A1",
          values: [pkeys, ...players.map((p) => pkeys.map((k) => p[k] ?? ""))],
        },
        {
          range: "Teams!A1",
          values: [
            tkeys,
            ...teams.map((p: any) => tkeys.map((k) => p[k] ?? "")),
          ],
        },
        {
          range: "Auction!A1",
          values: [
            akeys,
            ...state.map((p: any) => akeys.map((k) => p[k] ?? "")),
          ],
        },
        {
          range: "Settings!A1",
          values: [
            ["Setting", "Value"],
            ["Tournament ID", t.id],
            ["Tournament name", t.name],
            ...Object.entries(settings).map(([k, v]) => [k, String(v ?? "")]),
            ["Synced version", String(t.version)],
          ],
        },
      ];
      if (env.GOOGLE_SHEETS_WEBHOOK_URL) {
        const response = await fetch(env.GOOGLE_SHEETS_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            secret: env.GOOGLE_SHEETS_WEBHOOK_SECRET,
            tournamentId: t.id,
            name: t.name,
            version: t.version,
            data,
          }),
        });
        const result = (await response.json()) as any;
        if (!response.ok || !result.success)
          throw new Error(result.error || "Google Sheets bridge failed.");
        id = result.spreadsheetId;
        url = result.url;
        await env.DB.prepare(
          "UPDATE sheet_sync SET spreadsheet_id=?,url=? WHERE tournament_id=?",
        )
          .bind(id, url, t.id)
          .run();
      } else {
        await google(
          env,
          "https://sheets.googleapis.com/v4/spreadsheets/" +
            id +
            "/values:batchClear",
          {
            ranges: [
              "Registrations!A:N",
              "Teams!A:E",
              "Auction!A:I",
              "Settings!A:B",
            ],
          },
        );
        await google(
          env,
          "https://sheets.googleapis.com/v4/spreadsheets/" +
            id +
            "/values:batchUpdate",
          { valueInputOption: "RAW", data },
        );
      }
      await env.DB.prepare(
        "UPDATE sheet_sync SET last_version=?,status=CASE WHEN (SELECT version FROM tournaments WHERE id=?)=? THEN 'synced' ELSE 'pending' END,last_error=NULL,updated_at=? WHERE tournament_id=?",
      )
        .bind(t.version, t.id, t.version, new Date().toISOString(), t.id)
        .run();
    } catch (e) {
      await env.DB.prepare(
        "UPDATE sheet_sync SET status='error',last_error=?,updated_at=? WHERE tournament_id=?",
      )
        .bind(
          e instanceof Error ? e.message : "Google update failed.",
          new Date().toISOString(),
          queue.tournament_id,
        )
        .run();
    }
  } finally {
    await env.DB.prepare("DELETE FROM sync_lock WHERE id=1 AND token=?")
      .bind(token)
      .run();
  }
}

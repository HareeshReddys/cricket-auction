import { AppError } from "./domain.ts";
import type { Context, Env, User } from "./types.ts";
const encoder = new TextEncoder();
let assetKey: { secret: string; key: Promise<CryptoKey> } | null = null;
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export const randomToken = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
export const digest = async (s: string) =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: encoder.encode(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
}
function equal(a: string, b: string) {
  let n = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    n |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return n === 0;
}
function emailOf(v: unknown) {
  const email = String(v || "")
    .trim()
    .toLowerCase();
  if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))
    throw new AppError("Enter a valid email address.");
  return email;
}
function passwordOf(v: unknown) {
  const password = String(v || "");
  if (password.length < 12 || password.length > 128)
    throw new AppError("Use a password with 12–128 characters.");
  return password;
}
export async function authenticate(req: Request, env: Env) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { user: null };
  const hash = await digest(token);
  const row = await env.DB.prepare(
    "SELECT u.id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
  )
    .bind(hash, Date.now())
    .first<User>();
  return { user: row || null, sessionHash: hash };
}
export function requireUser(ctx: Context) {
  if (!ctx.user) throw new AppError("Sign in to continue.", 401);
  return ctx.user;
}
export function requireAdmin(ctx: Context) {
  const user = requireUser(ctx);
  if (user.role !== "admin")
    throw new AppError("Only the administrator can perform this action.", 403);
  return user;
}
export async function canManage(ctx: Context, tid: string) {
  if (!ctx.user) return false;
  if (ctx.user.role === "admin") return true;
  return !!(await ctx.env.DB.prepare(
    "SELECT 1 FROM memberships WHERE tournament_id=? AND user_id=?",
  )
    .bind(tid, ctx.user.id)
    .first());
}
export async function requireTournament(ctx: Context, tid: string) {
  requireUser(ctx);
  if (!(await canManage(ctx, tid)))
    throw new AppError("You do not have access to this tournament.", 403);
}
async function issueSession(env: Env, user: User) {
  const token = randomToken();
  await env.DB.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  )
    .bind(await digest(token), user.id, Date.now() + 8 * 60 * 60 * 1000)
    .run();
  return { token, user };
}
export async function authRoute(req: Request, parts: string[], ctx: Context) {
  const { env } = ctx;
  const action = parts[1];
  if (action === "session")
    return {
      user: ctx.user,
      admin: ctx.user?.role === "admin",
      canManage: !!ctx.user,
      signedIn: !!ctx.user,
      email: ctx.user?.email || "",
      role: ctx.user?.role || null,
      configured: !!(await env.DB.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first()),
    };
  if (req.method !== "POST") throw new AppError("Not found.", 404);
  const b = (await req.json()) as any;
  if (action === "logout") {
    if (ctx.sessionHash)
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(ctx.sessionHash)
        .run();
    return { success: true };
  }
  if (action === "bootstrap") {
    if (
      !env.ADMIN_SETUP_TOKEN ||
      !equal(String(b.setupToken || ""), env.ADMIN_SETUP_TOKEN)
    )
      throw new AppError("Invalid setup token.", 403);
    const email = emailOf(b.email);
    if (email !== env.ADMIN_EMAIL.toLowerCase())
      throw new AppError("Use the configured administrator email.", 403);
    const password = passwordOf(b.password),
      salt = randomToken(),
      id = crypto.randomUUID(),
      hash = await passwordHash(password, salt);
    const r = await env.DB.prepare(
      "INSERT INTO users(id,email,password_hash,salt,role,created_at) SELECT ?,?,?,?,'admin',? WHERE NOT EXISTS (SELECT 1 FROM users WHERE role='admin')",
    )
      .bind(id, email, hash, salt, new Date().toISOString())
      .run();
    if (!r.meta.changes)
      throw new AppError(
        "Administrator is already configured. Sign in instead.",
        409,
      );
    return issueSession(env, { id, email, role: "admin" });
  }
  if (action === "login") {
    const email = emailOf(b.email),
      ip = req.headers.get("CF-Connecting-IP") || "local";
    const keys = await Promise.all([
      digest("email:" + email),
      digest("ip:" + ip),
    ]);
    for (const key of keys) {
      const a = await env.DB.prepare(
        "SELECT failures,window_start FROM login_attempts WHERE key=?",
      )
        .bind(key)
        .first<any>();
      if (a && Date.now() - a.window_start < 900000 && a.failures >= 10)
        throw new AppError("Too many attempts. Try again in 15 minutes.", 429);
    }
    const row = await env.DB.prepare("SELECT * FROM users WHERE email=?")
      .bind(email)
      .first<any>();
    const hash = await passwordHash(
      String(b.password || ""),
      row?.salt || "unknown-user-constant-padding-salt",
    );
    if (!row || !equal(hash, row.password_hash)) {
      await env.DB.batch(
        keys.map((key) =>
          env.DB.prepare(
            "INSERT INTO login_attempts(key,failures,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET failures=CASE WHEN window_start<? THEN 1 ELSE failures+1 END,window_start=CASE WHEN window_start<? THEN ? ELSE window_start END",
          ).bind(
            key,
            Date.now(),
            Date.now() - 900000,
            Date.now() - 900000,
            Date.now(),
          ),
        ),
      );
      throw new AppError("Incorrect email or password.", 401);
    }
    await env.DB.prepare("DELETE FROM login_attempts WHERE key=?")
      .bind(keys[0])
      .run();
    return issueSession(env, { id: row.id, email: row.email, role: row.role });
  }
  if (action === "accept-invite") {
    const tokenHash = await digest(String(b.token || ""));
    const invite = await env.DB.prepare(
      "SELECT * FROM invites WHERE token_hash=? AND accepted_at IS NULL AND expires_at>?",
    )
      .bind(tokenHash, Date.now())
      .first<any>();
    if (!invite)
      throw new AppError("This invite has expired or was already used.", 410);
    const email = emailOf(b.email);
    if (email !== invite.email.toLowerCase())
      throw new AppError("Use the email address this invite was issued to.");
    let user = await env.DB.prepare(
      "SELECT id,email,role FROM users WHERE email=?",
    )
      .bind(email)
      .first<User>();
    if (user) {
      if (!ctx.user || ctx.user.id !== user.id)
        throw new AppError(
          "This email already has an account. Sign in first, then reopen the invite.",
          409,
        );
    } else {
      const password = passwordOf(b.password),
        salt = randomToken(),
        id = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO users(id,email,password_hash,salt,role,created_at) VALUES(?,?,?,?,'organizer',?)",
      )
        .bind(
          id,
          email,
          await passwordHash(password, salt),
          salt,
          new Date().toISOString(),
        )
        .run();
      user = { id, email, role: "organizer" };
    }
    // Membership is created only while this exact unexpired invite is still unused.
    const results = await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO memberships(tournament_id,user_id) SELECT tournament_id,? FROM invites WHERE token_hash=? AND accepted_at IS NULL AND expires_at>?",
      ).bind(user.id, tokenHash, Date.now()),
      env.DB.prepare(
        "UPDATE invites SET accepted_at=? WHERE token_hash=? AND accepted_at IS NULL AND expires_at>?",
      ).bind(Date.now(), tokenHash, Date.now()),
    ]);
    if (!results[1].meta.changes)
      throw new AppError("This invite was already used.", 410);
    return {
      ...(await issueSession(env, user)),
      tournamentId: invite.tournament_id,
    };
  }
  throw new AppError("Not found.", 404);
}
export async function createInvite(req: Request, ctx: Context, tid: string) {
  requireAdmin(ctx);
  const b = (await req.json()) as any,
    email = emailOf(b.email),
    token = randomToken();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      "DELETE FROM invites WHERE tournament_id=? AND email=? AND accepted_at IS NULL",
    ).bind(tid, email),
    ctx.env.DB.prepare(
      "INSERT INTO invites(token_hash,tournament_id,email,expires_at) VALUES(?,?,?,?)",
    ).bind(await digest(token), tid, email, Date.now() + 7 * 86400000),
  ]);
  return { token, email, expiresInDays: 7 };
}
export async function signAsset(env: Env, key: string, expiry: number) {
  if (!env.ASSET_SIGNING_KEY || env.ASSET_SIGNING_KEY.length < 32)
    throw new AppError("Image signing key is not configured.", 503);
  if (assetKey?.secret !== env.ASSET_SIGNING_KEY)
    assetKey = {
      secret: env.ASSET_SIGNING_KEY,
      key: crypto.subtle.importKey(
        "raw",
        encoder.encode(env.ASSET_SIGNING_KEY),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      ),
    };
  const secret = await assetKey!.key;
  return hex(
    await crypto.subtle.sign(
      "HMAC",
      secret,
      encoder.encode(key + ":" + expiry),
    ),
  );
}
export async function assetUrl(req: Request, ctx: Context, path: string) {
  if (!path) return "";
  const key = path.split("/").pop()!;
  const expires = Date.now() + 30 * 60 * 1000;
  return new URL(
    "/api/assets/" +
      key +
      "?expires=" +
      expires +
      "&signature=" +
      (await signAsset(ctx.env, key, expires)),
    req.url,
  ).href;
}
export async function assetAllowed(req: Request, ctx: Context, key: string) {
  const u = new URL(req.url),
    expiry = Number(u.searchParams.get("expires")),
    signature = u.searchParams.get("signature") || "";
  return (
    Number.isSafeInteger(expiry) &&
    expiry > Date.now() &&
    expiry < Date.now() + 31 * 60 * 1000 &&
    equal(signature, await signAsset(ctx.env, key, expiry))
  );
}

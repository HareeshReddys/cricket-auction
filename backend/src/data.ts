import {
  AppError,
  amount,
  normalizeAuction,
  roles,
  settingsOf,
  text,
} from "./domain.ts";
import type { Context } from "./types.ts";
import {
  requireUser,
  requireAdmin,
  requireTournament,
  canManage,
  createInvite,
  assetUrl,
  assetAllowed,
} from "./auth.ts";
import { enqueueSync } from "./sheets.ts";
import { assetStorage } from "./storage.ts";

export async function dataApi(req: Request, parts: string[], ctx: Context) {
  const env = ctx.env;
  const storage = assetStorage(env);
  const bindings = () => env;
  const db = () => {
    if (!bindings().DB) throw new AppError("Database is not configured.", 503);
    return bindings().DB!;
  };
  function organizer() {
    return !!ctx.user;
  }
  function requireOrganizer(_req: Request) {
    requireUser(ctx);
  }
  function json(value: any, status = 200) {
    return Response.json(value, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  async function tournament(id: string) {
    const t = await db()
      .prepare("SELECT * FROM tournaments WHERE id=?")
      .bind(id)
      .first<any>();
    if (!t) throw new AppError("Tournament not found.", 404);
    return { ...t, settings: JSON.parse(t.settings) };
  }
  async function registrations(id: string) {
    const r = await db()
      .prepare(
        "SELECT data FROM players WHERE tournament_id=? ORDER BY rowid DESC",
      )
      .bind(id)
      .all<any>();
    return r.results.map((r) => JSON.parse(r.data));
  }
  async function auction(id: string) {
    const a = await db()
      .prepare("SELECT * FROM auctions WHERE tournament_id=?")
      .bind(id)
      .first<any>();
    return {
      teams: JSON.parse(a?.teams || "[]"),
      auctState: JSON.parse(a?.state || "[]"),
      revision: a?.revision || 0,
    };
  }
  async function image(value: any, kind: string, tid: string) {
    let bytes: Uint8Array | ReadableStream, mime: string;
    if (value instanceof File) {
      if (value.size > 12 * 1024 * 1024 || value.size < 20)
        throw new AppError("Choose an image under 12 MB.");
      mime = value.type;
      const head = new Uint8Array(await value.slice(0, 16).arrayBuffer());
      validateImage(head, mime);
      bytes = value.stream();
    } else {
      const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
        String(value),
      );
      if (!m || m[2].length > 17000000)
        throw new AppError("Choose a JPEG, PNG or WebP under 12 MB.");
      const raw = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
      mime = "image/" + m[1];
      validateImage(raw, mime);
      bytes = raw;
    }
    const key = crypto.randomUUID();
    await storage.put(key, bytes, {
      httpMetadata: { contentType: mime },
      customMetadata: { kind, tid },
    });
    return "/api/assets/" + key;
  }
  function validateImage(raw: Uint8Array, mime: string) {
    const valid =
      (mime === "image/jpeg" && raw[0] === 255 && raw[1] === 216) ||
      (mime === "image/png" && raw[0] === 137 && raw[1] === 80) ||
      (mime === "image/webp" &&
        String.fromCharCode(...raw.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...raw.slice(8, 12)) === "WEBP");
    if (!valid) throw new AppError("Invalid image.");
  }
  async function signedPlayers(players: any[]) {
    return Promise.all(
      players.map(async (p) => ({
        ...p,
        PhotoURL: await assetUrl(req, ctx, p.PhotoURL),
        PhotoThumbURL: await assetUrl(req, ctx, p.PhotoThumbURL || p.PhotoURL),
        PayScreenshotURL: await assetUrl(req, ctx, p.PayScreenshotURL),
      })),
    );
  }
  async function body() {
    if (req.headers.get("Content-Type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const b: any = Object.fromEntries(form);
      b.agreed = b.agreed === "true";
      return b;
    }
    return (await req.json()) as any;
  }
  async function handle(req: Request, parts: string[]) {
    const url = new URL(req.url);
    const method = req.method;
    if (parts[0] === "assets" && method === "GET") {
      const file = await storage.get(parts[1]);
      if (!file) throw new AppError("Image not found.", 404);
      let cache = "private, max-age=86400";
      if (!(await canManage(ctx, file.customMetadata?.tid || ""))) {
        if (await assetAllowed(req, ctx, parts[1]))
          return new Response(file.body, {
            headers: {
              "Content-Type": file.httpMetadata?.contentType || "image/jpeg",
              "Cache-Control": "private, max-age=1800",
              "X-Content-Type-Options": "nosniff",
            },
          });
        if (file.customMetadata?.kind === "payment")
          throw new AppError("Organizer access required.", 403);
        const t = await tournament(file.customMetadata?.tid || "");
        if (file.customMetadata?.kind === "photo") {
          if (!t.settings.liveEnabled)
            throw new AppError("Image is private.", 403);
          const p = await db()
            .prepare(
              "SELECT id FROM players WHERE tournament_id=? AND (json_extract(data,'$.PhotoURL')=? OR json_extract(data,'$.PhotoThumbURL')=?) AND json_extract(data,'$.Status')='Verified'",
            )
            .bind(t.id, "/api/assets/" + parts[1], "/api/assets/" + parts[1])
            .first();
          if (!p) throw new AppError("Image is private.", 403);
        }
        cache = "public, max-age=60";
      }
      return new Response(file.body, {
        headers: {
          "Content-Type": file.httpMetadata?.contentType || "image/jpeg",
          "Cache-Control": cache,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (parts[0] === "open-tournaments" && method === "GET") {
      const rows = await db()
        .prepare(
          "SELECT id,name,settings FROM tournaments WHERE json_extract(settings,'$.registrationOpen')=1 AND json_extract(settings,'$.archived')=0 ORDER BY created_at DESC",
        )
        .all<any>();
      return json({
        tournaments: rows.results.map((t) => {
          const s = JSON.parse(t.settings);
          return {
            id: t.id,
            name: t.name,
            date: s.date,
            venue: s.venue,
            fee: s.fee,
          };
        }),
      });
    }
    if (parts[0] !== "tournaments") throw new AppError("Not found.", 404);
    if (parts.length === 1) {
      requireOrganizer(req);
      if (method === "GET") {
        const rows = await db()
          .prepare(
            "SELECT t.*, (SELECT COUNT(*) FROM players p WHERE p.tournament_id=t.id) AS total, (SELECT COUNT(*) FROM players p WHERE p.tournament_id=t.id AND json_extract(p.data,'$.Status')='Pending') AS pending FROM tournaments t WHERE (?=1 OR EXISTS (SELECT 1 FROM memberships m WHERE m.tournament_id=t.id AND m.user_id=?)) ORDER BY t.created_at DESC",
          )
          .bind(ctx.user?.role === "admin" ? 1 : 0, ctx.user?.id || "")
          .all<any>();
        return json({
          tournaments: rows.results.map((t) => ({
            ...t,
            settings: JSON.parse(t.settings),
          })),
        });
      }
      if (method === "POST") {
        requireAdmin(ctx);
        const b = (await req.json()) as any;
        const id = crypto.randomUUID(),
          name = text(b.name, 100, true),
          settings = settingsOf(b.settings);
        await db().batch([
          db()
            .prepare(
              "INSERT INTO tournaments(id,name,settings,created_at) VALUES(?,?,?,?)",
            )
            .bind(id, name, JSON.stringify(settings), new Date().toISOString()),
          db()
            .prepare("INSERT INTO auctions(tournament_id) VALUES(?)")
            .bind(id),
        ]);
        await enqueueSync(env, id);
        return json({ id }, 201);
      }
    }
    const t = await tournament(parts[1]);
    const id = t.id;
    if (parts[2] && !["register", "live"].includes(parts[2]))
      await requireTournament(ctx, id);
    if (parts[2] === "invites" && method === "POST")
      return json(await createInvite(req, ctx, id));
    if (parts[2] === "members" && method === "DELETE") {
      requireAdmin(ctx);
      const b = (await req.json()) as any;
      await env.DB.batch([
        env.DB.prepare(
          "DELETE FROM memberships WHERE tournament_id=? AND user_id=?",
        ).bind(id, b.userId),
        env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(b.userId),
      ]);
      return json({ success: true });
    }
    if (parts[2] === "members" && method === "GET") {
      requireAdmin(ctx);
      const rows = await env.DB.prepare(
        "SELECT u.id,u.email FROM memberships m JOIN users u ON m.user_id=u.id WHERE m.tournament_id=?",
      )
        .bind(id)
        .all();
      return json({ members: rows.results });
    }
    if (parts[2] === "sync" && method === "POST") {
      requireAdmin(ctx);
      await enqueueSync(env, id);
      return json({ success: true });
    }
    if (parts[2] === "sync" && method === "GET") {
      return json({
        sync: await env.DB.prepare(
          "SELECT * FROM sheet_sync WHERE tournament_id=?",
        )
          .bind(id)
          .first(),
      });
    }
    if (parts.length === 2) {
      if (method === "GET")
        return json({
          tournament: {
            ...t,
            settings: {
              ...t.settings,
              qr: t.settings.qr ? new URL(t.settings.qr, req.url).href : "",
              banner: t.settings.banner
                ? new URL(t.settings.banner, req.url).href
                : "",
            },
          },
        });
      await requireTournament(ctx, id);
      if (method === "PATCH") {
        const b = (await req.json()) as any;
        const settings = settingsOf(b.settings),
          name = text(b.name, 100, true);
        const r = await db()
          .prepare(
            "UPDATE tournaments SET name=?,settings=?,version=version+1 WHERE id=? AND version=?",
          )
          .bind(name, JSON.stringify(settings), id, amount(b.version))
          .run();
        if (!r.meta.changes)
          throw new AppError(
            "Settings changed on another screen. Refresh before saving.",
            409,
          );
        return json({ success: true });
      }
    }
    if (["qr", "banner"].includes(parts[2]) && method === "POST") {
      const b = await body();
      return json({ url: await image(b.image, parts[2], id) });
    }
    if (parts[2] === "version") {
      requireOrganizer(req);
      return json({ version: t.version });
    }
    if (parts[2] === "snapshot") {
      requireOrganizer(req);
      return json({
        tournament: t,
        players: await signedPlayers(await registrations(id)),
        ...(await auction(id)),
      });
    }
    if (parts[2] === "live") {
      if (!t.settings.liveEnabled)
        throw new AppError(
          "Live results are not public for this tournament.",
          403,
        );
      if (url.searchParams.get("version") === String(t.version))
        return json({ unchanged: true, version: t.version });
      const a = await auction(id);
      const ps = await registrations(id);
      return json({
        version: t.version,
        teams: a.teams,
        players: ps
          .filter((p) => p.Status === "Verified")
          .map((p) => {
            const s = a.auctState.find((s: any) => s.id === p.RegID);
            return {
              id: p.RegID,
              name: p.Name,
              role: p.PlayerType,
              photo: new URL(p.PhotoThumbURL || p.PhotoURL, req.url).href,
              originalPhoto: new URL(p.PhotoURL, req.url).href,
              status: s?.status || "pending",
              soldTo: s?.soldTo || null,
              soldPrice: s?.soldPrice || 0,
            };
          }),
      });
    }
    if (parts[2] === "register" && method === "POST") {
      if (!t.settings.registrationOpen || t.settings.archived)
        throw new AppError("Registration is closed.");
      const b = await body();
      const name = text(b.name, 100, true),
        phone = text(b.phone, 10, true),
        ch = text(b.cricHeroesNum, 80, true),
        address = text(b.address, 1000, true),
        availability = text(b.availability, 200, true);
      if (!/^\d{10}$/.test(phone) || !roles.includes(b.playerType))
        throw new AppError("Enter a valid phone and player role.");
      const altPhone = text(b.altPhone, 10);
      if (altPhone && !/^\d{10}$/.test(altPhone))
        throw new AppError("Invalid alternate phone.");
      if (b.agreed !== true)
        throw new AppError("Accept the tournament terms to register.");
      const utr =
        t.settings.fee > 0 ? text(b.utr, 100, true) : crypto.randomUUID();
      const duplicate = await db()
        .prepare(
          "SELECT id FROM players WHERE tournament_id=? AND (phone=? OR utr=?)",
        )
        .bind(id, phone, utr)
        .first();
      if (duplicate)
        throw new AppError(
          "This phone or payment reference is already registered. Contact the organizer.",
          409,
        );
      const uploaded: string[] = [];
      try {
        const photo = await image(b.photoURL, "photo", id);
        uploaded.push(photo.split("/").pop()!);
        const thumb = b.photoThumbURL
          ? await image(b.photoThumbURL, "photo", id)
          : photo;
        if (thumb !== photo) uploaded.push(thumb.split("/").pop()!);
        const pay =
          t.settings.fee > 0
            ? await image(b.payScreenshotURL, "payment", id)
            : "";
        if (pay) uploaded.push(pay.split("/").pop()!);
        const regId = "REG-" + crypto.randomUUID().slice(0, 13).toUpperCase();
        const p = {
          RegID: regId,
          Name: name,
          Phone: phone,
          AltPhone: altPhone,
          CricHeroesNum: ch,
          PlayerType: b.playerType,
          Address: address,
          Availability: availability,
          UTR: t.settings.fee > 0 ? utr : "",
          PhotoURL: photo,
          PhotoThumbURL: thumb,
          PayScreenshotURL: pay,
          Status: "Pending",
          Timestamp: new Date().toISOString(),
          RejectionReason: "",
        };
        await db().batch([
          db()
            .prepare(
              "INSERT INTO players(id,tournament_id,phone,utr,data) VALUES(?,?,?,?,?)",
            )
            .bind(regId, id, phone, utr, JSON.stringify(p)),
          db()
            .prepare("UPDATE tournaments SET version=version+1 WHERE id=?")
            .bind(id),
        ]);
        return json({ success: true, regId }, 201);
      } catch (e) {
        await Promise.all(uploaded.map((k) => storage.delete(k)));
        if (String(e).includes("UNIQUE"))
          throw new AppError("Already registered. Contact the organizer.", 409);
        throw e;
      }
    }
    if (parts[2] === "legacy") {
      requireOrganizer(req);
      const b = method === "POST" ? ((await req.json()) as any) : {};
      const action = b.action || url.searchParams.get("action");
      if (method === "GET") {
        if (action === "getAll")
          return json({
            success: true,
            data: await signedPlayers(await registrations(id)),
            hasMore: false,
          });
        if (action === "loadAuction")
          return json({ success: true, ...(await auction(id)) });
        if (action === "getPayment") {
          const p = (await registrations(id)).find(
            (p) => p.RegID === url.searchParams.get("regId"),
          );
          if (!p) throw new AppError("Player not found.", 404);
          return json({
            success: true,
            payScreenshotURL: await assetUrl(req, ctx, p.PayScreenshotURL),
            utr: p.UTR,
          });
        }
      }
      if (t.settings.archived)
        throw new AppError(
          "This tournament is archived. Restore it in settings before making changes.",
        );
      if (method === "POST") {
        if (action === "saveAuction") {
          const regs = await registrations(id);
          const a = normalizeAuction(b.teams, b.auctState, regs);
          const result = await db().batch([
            db()
              .prepare(
                "UPDATE auctions SET teams=?,state=?,revision=revision+1 WHERE tournament_id=? AND revision=? AND NOT EXISTS (SELECT 1 FROM json_each(?) s LEFT JOIN players p ON p.id=json_extract(s.value,'$.id') AND p.tournament_id=? WHERE p.id IS NULL OR (json_extract(s.value,'$.status')='sold' AND json_extract(p.data,'$.Status')!='Verified'))",
              )
              .bind(
                JSON.stringify(a.teams),
                JSON.stringify(a.state),
                id,
                amount(b.revision),
                JSON.stringify(a.state),
                id,
              ),
            db()
              .prepare("UPDATE tournaments SET version=version+1 WHERE id=?")
              .bind(id),
          ]);
          if (!result[0].meta.changes)
            throw new AppError(
              "Auction changed on another screen. Your changes were not saved. Refresh and retry.",
              409,
            );
          return json({ success: true, revision: b.revision + 1 });
        }
        const regId = text(b.regId, 80, true);
        const row = await db()
          .prepare("SELECT data FROM players WHERE id=? AND tournament_id=?")
          .bind(regId, id)
          .first<any>();
        if (!row) throw new AppError("Player not found.", 404);
        const p = JSON.parse(row.data);
        const a = await auction(id);
        if (
          a.auctState.some((s: any) => s.id === regId && s.status === "sold") &&
          (action === "deletePlayer" || b.status !== "Verified")
        )
          throw new AppError(
            "Reset this player in the auction before deleting or changing verification.",
          );
        if (action === "updateStatus") {
          if (
            !["Pending", "Verified", "Rejected", "Cancelled"].includes(b.status)
          )
            throw new AppError("Invalid registration status.");
          p.Status = b.status;
          p.RejectionReason = text(b.reason, 1000);
          p.VerifiedBy = ctx.user?.email;
          const changed = await db().batch([
            db()
              .prepare(
                "UPDATE players SET data=? WHERE id=? AND tournament_id=? AND data=? AND (?='Verified' OR NOT EXISTS (SELECT 1 FROM auctions a,json_each(a.state) s WHERE a.tournament_id=? AND json_extract(s.value,'$.id')=? AND json_extract(s.value,'$.status')='sold'))",
              )
              .bind(
                JSON.stringify(p),
                regId,
                id,
                row.data,
                b.status,
                id,
                regId,
              ),
            db()
              .prepare("UPDATE tournaments SET version=version+1 WHERE id=?")
              .bind(id),
          ]);
          if (!changed[0].meta.changes)
            throw new AppError(
              "Player changed on another screen. Refresh and retry.",
              409,
            );
          return json({ success: true });
        }
        if (action === "deletePlayer") {
          const changed = await db().batch([
            db()
              .prepare(
                "DELETE FROM players WHERE id=? AND tournament_id=? AND NOT EXISTS (SELECT 1 FROM auctions a,json_each(a.state) s WHERE a.tournament_id=? AND json_extract(s.value,'$.id')=? AND json_extract(s.value,'$.status')='sold')",
              )
              .bind(regId, id, id, regId),
            db()
              .prepare(
                "UPDATE auctions SET state=(SELECT COALESCE(json_group_array(json(value)), '[]') FROM json_each(auctions.state) WHERE json_extract(value,'$.id')!=?),revision=revision+1 WHERE tournament_id=? AND NOT EXISTS (SELECT 1 FROM players WHERE id=? AND tournament_id=?)",
              )
              .bind(regId, id, regId, id),
            db()
              .prepare("UPDATE tournaments SET version=version+1 WHERE id=?")
              .bind(id),
          ]);
          if (!changed[0].meta.changes)
            throw new AppError(
              "Player was sold on another screen. Reset the auction result before deleting.",
              409,
            );
          await Promise.all(
            [p.PhotoURL, p.PhotoThumbURL, p.PayScreenshotURL]
              .filter(Boolean)
              .map((url: string) =>
                storage.delete(url.split("/").pop()!),
              ),
          );
          return json({ success: true });
        }
      }
    }
    throw new AppError("Unsupported action.", 400);
  }
  try {
    const response = await handle(req, parts);
    if (
      req.method !== "GET" &&
      response.ok &&
      parts[0] === "tournaments" &&
      parts[1]
    )
      await enqueueSync(env, parts[1]);
    return response;
  } catch (e) {
    if (e instanceof AppError)
      return json({ success: false, error: e.message }, e.status);
    console.error("API failure", e);
    return json(
      {
        success: false,
        error: "Could not complete the request. Please retry.",
      },
      500,
    );
  }
}

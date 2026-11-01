import type { Env, Context } from "./types.ts";
import { authenticate, authRoute } from "./auth.ts";
import { dataApi } from "./data.ts";
import { AppError } from "./domain.ts";
import { drainSync } from "./sheets.ts";
export default {
  async fetch(req: Request, env: Env, execution: ExecutionContext) {
    const origin = req.headers.get("Origin"),
      allowed = env.FRONTEND_ORIGIN.split(",").map((s) => s.trim());
    const cors: Record<string, string> = {
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      Vary: "Origin",
      "X-Content-Type-Options": "nosniff",
    };
    if (origin && allowed.includes(origin))
      cors["Access-Control-Allow-Origin"] = origin;
    if (origin && !allowed.includes(origin))
      return Response.json(
        { error: "This website is not allowed to use the API." },
        { status: 403, headers: cors },
      );
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url),
      parts = url.pathname
        .replace(/^\/api\//, "")
        .split("/")
        .filter(Boolean);
    const ctx: Context = {
      env,
      ...(await authenticate(req, env)),
      waitUntil: (p) => execution.waitUntil(p),
    };
    let result: Response;
    try {
      if (!url.pathname.startsWith("/api/"))
        result = Response.json({
          service: "Boundary Cricket API",
          healthy: true,
        });
      else if (parts[0] === "auth")
        result = Response.json(await authRoute(req, parts, ctx), {
          headers: { "Cache-Control": "no-store" },
        });
      else result = await dataApi(req, parts, ctx);
    } catch (e) {
      if (!(e instanceof AppError)) console.error("API failure", e);
      const error =
        e instanceof AppError
          ? e
          : new AppError("Could not complete the request.", 500);
      result = Response.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    const headers = new Headers(result.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    if (req.method !== "GET" && result.ok) execution.waitUntil(drainSync(env));
    return new Response(result.body, { status: result.status, headers });
  },
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(drainSync(env));
    ctx.waitUntil(
      env.DB.batch([
        env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(
          Date.now(),
        ),
        env.DB.prepare("DELETE FROM invites WHERE expires_at<?").bind(
          Date.now() - 86400000,
        ),
        env.DB.prepare("DELETE FROM login_attempts WHERE window_start<?").bind(
          Date.now() - 86400000,
        ),
      ]),
    );
  },
};

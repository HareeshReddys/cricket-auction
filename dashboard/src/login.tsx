import { useEffect, useState } from "react";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { request, saveSession, route } from "./client";
import { Field } from "./studio";
export default function Login({
  mode = "login",
  token = "",
  returnTo = "/",
}: {
  mode?: string;
  token?: string;
  returnTo?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [existing, setExisting] = useState(false);
  useEffect(() => {
    if (mode === "invite")
      request("/api/auth/session").then((s) => setExisting(s.signedIn));
  }, [mode]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const b = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const d = await request(
        "/api/auth/" +
          (mode === "invite"
            ? "accept-invite"
            : mode === "setup"
              ? "bootstrap"
              : "login"),
        { method: "POST", body: JSON.stringify({ ...b, token }) },
      );
      saveSession(d.token);
      location.hash = d.tournamentId ? "/auction/" + d.tournamentId : returnTo;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      <a className="logo" href={route("/")}>
        <span className="logo-mark">b.</span>boundary
      </a>
      <div className="auth-card panel">
        <ShieldCheck size={32} />
        <span className="eyebrow">YOUR TOURNAMENT. YOUR WORKSPACE.</span>
        <h1>
          {mode === "invite"
            ? "Your next season awaits."
            : mode === "setup"
              ? "Set up your admin account."
              : "Welcome back."}
        </h1>
        <p>
          {mode === "invite"
            ? "Accept your private invitation to manage this tournament."
            : mode === "setup"
              ? "One-time setup for the platform administrator."
              : "Sign in to your cricket tournament dashboard."}
        </p>
        <form onSubmit={submit}>
          <Field
            label="Email address"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
          {(!existing || mode !== "invite") && (
            <Field
              label={
                mode === "login"
                  ? "Password"
                  : "Set your password (at least 12 characters)"
              }
              name="password"
              type="password"
              minLength={mode === "login" ? 1 : 12}
              maxLength={128}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
            />
          )}
          {mode === "setup" && (
            <Field
              label="Admin setup token"
              name="setupToken"
              type="password"
              required
            />
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <ArrowRight size={16} />
            )}{" "}
            {mode === "invite"
              ? "Accept invitation"
              : mode === "setup"
                ? "Create administrator"
                : "Sign in"}
          </button>
        </form>
        {mode === "invite" && !existing && (
          <p>
            Already have an account?{" "}
            <a
              href={route(
                "/login?returnTo=" +
                  encodeURIComponent("/invite?token=" + token),
              )}
            >
              Sign in first
            </a>
            , then reopen your invite.
          </p>
        )}
        <a className="auth-public" href={route("/register")}>
          Looking to play? Player registration is public ↗
        </a>
      </div>
      <p className="auth-caption">Made for the love of the game.</p>
    </div>
  );
}

"use client";
import { useEffect, useState, useRef } from "react";
import { route } from "./client";
import { request, money } from "./studio";
export default function Live({ id }: { id: string }) {
  const [t, setT] = useState<any>(null),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [last, setLast] = useState("");
  const revision = useRef(-1);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        if (document.visibilityState === "visible") {
          const d = await request(
            "/api/tournaments/" + id + "/live?version=" + revision.current,
          );
          if (cancelled) return;
          if (!d.unchanged) {
            revision.current = d.version;
            setData(d);
          }
          setLast(new Date().toLocaleTimeString());
          setError("");
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) timer = setTimeout(tick, 3000);
      }
    }
    request("/api/tournaments/" + id)
      .then((d) => {
        if (!cancelled) setT(d.tournament);
      })
      .catch((e) => setError(e.message));
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);
  return (
    <div className="public-shell">
      <header className="public-top">
        <a className="logo" href="#/">
          <span className="logo-mark">b.</span>boundary
        </a>
        {t?.settings.registrationOpen && (
          <a href={route("/register/" + id)}>Player registration ↗</a>
        )}
      </header>
      <section className="public-hero">
        <span className="eyebrow">THE AUCTION. AS IT HAPPENS.</span>
        <h1>{t?.name || "Live auction"}</h1>
        <p>
          {t?.settings.venue} · {t?.settings.date}
        </p>
      </section>
      {error && (
        <div className="error" role="alert">
          {error}
          {data && " · Showing last received results."}
        </div>
      )}
      {data ? (
        <>
          <div className="connection">
            <i />
            {error ? "Reconnecting…" : "Auto-updates every 3 seconds"} · Last
            checked {last}
          </div>
          <div className="stats-row">
            <div className="stat panel">
              <div>
                <strong>{data.players.length}</strong>
                <p>Verified players</p>
              </div>
            </div>
            <div className="stat panel">
              <div>
                <strong>{data.teams.length}</strong>
                <p>Teams</p>
              </div>
            </div>
            <div className="stat panel">
              <div>
                <strong>
                  {data.players.filter((p: any) => p.status === "sold").length}
                </strong>
                <p>Players sold</p>
              </div>
            </div>
            <div className="stat panel">
              <div>
                <strong>
                  {
                    data.players.filter((p: any) => p.status === "unsold")
                      .length
                  }
                </strong>
                <p>Unsold</p>
              </div>
            </div>
          </div>
          <div className="live-teams">
            {data.teams.map((team: any) => (
              <section
                className="live-team panel"
                style={{ borderTopColor: team.color }}
                key={team.id}
              >
                <h2>{team.name}</h2>
                <p>
                  {money(team.budget)} remaining ·{" "}
                  {money(team.initialBudget - team.budget)} spent
                </p>
                {data.players
                  .filter((p: any) => p.soldTo === team.id)
                  .map((p: any) => (
                    <Player p={p} key={p.id} />
                  ))}
                {!data.players.some((p: any) => p.soldTo === team.id) && (
                  <p>Waiting for the first winning bid.</p>
                )}
              </section>
            ))}
          </div>
          {!data.teams.length && (
            <div className="empty-state">
              Teams will appear here when the organizer adds them.
            </div>
          )}
          <section className="unsold-list panel">
            <h2>Available players</h2>
            {data.players
              .filter((p: any) => p.status !== "sold")
              .map((p: any) => (
                <Player p={p} key={p.id} />
              ))}
          </section>
        </>
      ) : (
        !error && <div className="empty-state">Connecting to live results…</div>
      )}
      <footer>
        MADE FOR THE LOVE OF THE GAME.
        <span>boundary · Cricket Auction Studio</span>
      </footer>
    </div>
  );
}
function Player({ p }: any) {
  return (
    <div className="live-player">
      {p.photo ? (
        <a href={p.originalPhoto || p.photo} target="_blank" rel="noreferrer">
          <img src={p.photo} loading="lazy" alt={p.name} />
        </a>
      ) : (
        <span className="player-initial">{p.name[0]}</span>
      )}
      <div>
        <strong>{p.name}</strong>
        <small>{p.role}</small>
      </div>
      <b>
        {p.status === "sold"
          ? money(p.soldPrice)
          : p.status === "unsold"
            ? "Unsold"
            : "Awaiting bid"}
      </b>
    </div>
  );
}

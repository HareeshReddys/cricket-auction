"use client";
import { useEffect, useState } from "react";
import { request, money } from "./studio";
export default function Page() {
  const [items, setItems] = useState<any[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    request("/api/open-tournaments")
      .then((d) => setItems(d.tournaments))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="public-shell">
      <header className="public-top">
        <a className="logo" href="#/">
          <span className="logo-mark">b.</span>boundary
        </a>
        <a href="#/">Organizer workspace ↗</a>
      </header>
      <section className="public-hero">
        <span className="eyebrow">YOUR NEXT INNINGS</span>
        <h1>Find your tournament.</h1>
        <p>Choose a tournament below to register as a player.</p>
      </section>
      {error && <div className="error">{error}</div>}
      <div className="live-teams">
        {items?.map((t) => (
          <a className="panel live-team" href={"#/register/" + t.id} key={t.id}>
            <h2>{t.name}</h2>
            <p>
              {t.date || "Date to be announced"} ·{" "}
              {t.venue || "Venue to be announced"}
            </p>
            <b>{money(t.fee)} entry · Register now ↗</b>
          </a>
        ))}
      </div>
      {!items && !error && (
        <div className="empty-state">Loading tournaments…</div>
      )}
      {items?.length === 0 && (
        <div className="empty-state">
          No tournaments are open for registration yet. Check back soon.
        </div>
      )}
      <footer>
        MADE FOR THE LOVE OF THE GAME.
        <span>boundary · Cricket Auction Studio</span>
      </footer>
    </div>
  );
}

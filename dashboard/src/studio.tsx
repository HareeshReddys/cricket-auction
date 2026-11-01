"use client";
import { useEffect, useState, useCallback } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  Plus,
  Search,
  Trophy,
  Users,
  LayoutDashboard,
  Settings,
  ExternalLink,
  Copy,
  Check,
  X,
  MapPin,
  CalendarDays,
  ArrowRight,
  LogOut,
  Download,
  Radio,
  Archive,
  LoaderCircle,
  Wallet,
  Link as LinkIcon,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import {
  defaults,
  type Settings as TournamentSettings,
} from "../../backend/src/domain";
import { request, route, logout, originalImage, API } from "./client";
export { request } from "./client";
export const money = (n: number) =>
  "₹" + Number(n || 0).toLocaleString("en-IN");
type Tournament = {
  id: string;
  name: string;
  settings: TournamentSettings;
  version: number;
  total: number;
  pending: number;
};
export default function Studio() {
  const [session, setSession] = useState<any>(null),
    [items, setItems] = useState<Tournament[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [tab, setTab] = useState("active"),
    [editing, setEditing] = useState<Tournament | null | undefined>(undefined),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [accessFor, setAccessFor] = useState<Tournament | null>(null);
  const note = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 3500);
  };
  const load = useCallback(async () => {
    try {
      const s = await request("/api/auth/session");
      setSession(s);
      if (s.canManage)
        setItems((await request("/api/tournaments")).tournaments);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 10000);
    return () => clearInterval(timer);
  }, [load]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const data = Object.fromEntries(f);
    try {
      const settings = {
        ...defaults,
        ...editing?.settings,
        ...data,
        fee: Number(data.fee),
        basePrice: Number(data.basePrice),
        teamBudget: Number(data.teamBudget),
        registrationOpen: f.get("registrationOpen") === "on",
        liveEnabled: f.get("liveEnabled") === "on",
        archived: editing?.settings.archived || false,
      };
      const res = await request(
        editing ? "/api/tournaments/" + editing.id : "/api/tournaments",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify({
            name: data.name,
            settings,
            version: editing?.version,
          }),
        },
      );
      setEditing(undefined);
      await load();
      note(
        editing
          ? "Tournament updated"
          : "Tournament created. Add your teams to get started.",
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function archive(t: Tournament) {
    if (
      !confirm(
        t.settings.archived
          ? "Restore this tournament?"
          : "Archive this tournament? Registration will close; all results will be kept.",
      )
    )
      return;
    try {
      await request("/api/tournaments/" + t.id, {
        method: "PATCH",
        body: JSON.stringify({
          name: t.name,
          version: t.version,
          settings: {
            ...t.settings,
            archived: !t.settings.archived,
            registrationOpen: false,
          },
        }),
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function copy(path: string) {
    try {
      await navigator.clipboard.writeText(location.origin + route(path));
      note("Link copied");
    } catch {
      note("Could not copy. Open the link and copy it from your address bar.");
    }
  }
  async function backup(t: Tournament) {
    try {
      const d = await request("/api/tournaments/" + t.id + "/snapshot");
      const u = URL.createObjectURL(
        new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = u;
      a.download = t.name.replace(/[^a-z0-9]/gi, "-") + "-backup.json";
      a.click();
      URL.revokeObjectURL(u);
    } catch (e: any) {
      setError(e.message);
    }
  }
  const filtered = items.filter(
    (t) =>
      t.settings.archived === (tab === "archived") &&
      t.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="studio">
      <aside className="sidebar">
        <a className="logo" href="#/">
          <span className="logo-mark">b.</span>boundary
          <span className="logo-dot">®</span>
        </a>
        <div className="workspace-label">ORGANIZER WORKSPACE</div>
        <button
          className={"side-nav " + (tab === "active" ? "selected" : "")}
          onClick={() => setTab("active")}
        >
          <LayoutDashboard size={18} />
          Tournaments{" "}
          <span>{items.filter((t) => !t.settings.archived).length}</span>
        </button>
        <button
          className={"side-nav " + (tab === "archived" ? "selected" : "")}
          onClick={() => setTab("archived")}
        >
          <Archive size={18} />
          Archive
        </button>
        <div className="sidebar-note">
          <div className="small-ball" />
          <h3>
            Big moments.
            <br />
            Beautifully organized.
          </h3>
          <p>
            From the first registration
            <br />
            to the final winning bid.
          </p>
        </div>
        <div className="sidebar-bottom">
          <div className="avatar">
            {(session?.email || "Organizer")[0].toUpperCase()}
          </div>
          <div>
            <strong>
              {session?.role === "admin"
                ? "Administrator"
                : session?.canManage
                  ? "Tournament owner"
                  : "Your workspace"}
            </strong>
            <small>{session?.email || "Cricket Auction Studio"}</small>
          </div>
          {session?.signedIn && (
            <a
              aria-label="Sign out"
              href="#/login"
              onClick={(e) => {
                e.preventDefault();
                logout();
              }}
            >
              <LogOut size={16} />
            </a>
          )}
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} />
            <b>{tab === "active" ? "Tournaments" : "Archive"}</b>
          </span>
          <span className="system-status">
            <i /> Shared tournament workspace
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR GAME. YOUR WAY.</div>
              <h1>
                Every season starts here<span>.</span>
              </h1>
              <p>A little less organizing. A lot more cricket.</p>
            </div>
            {session?.role === "admin" && (
              <button
                className="button primary"
                onClick={() => {
                  setError("");
                  setEditing(null);
                }}
              >
                <Plus size={18} /> New tournament
              </button>
            )}
          </div>
          <section className="hero">
            <div className="hero-copy">
              <span className="hero-tag">
                <span /> THE HOME OF YOUR NEXT BIG GAME
              </span>
              <h2>
                Build the team.
                <br />
                Make the moment.
              </h2>
              <p>
                Registrations, squads, and auction night.
                <br />
                One place to bring it all together.
              </p>
              <button
                className="hero-link"
                onClick={() =>
                  session?.role === "admin"
                    ? setEditing(null)
                    : session?.canManage && items[0]
                      ? location.assign(route("/auction/" + items[0].id))
                      : location.assign(route("/login"))
                }
              >
                {session?.role === "admin"
                  ? "Create your next tournament"
                  : session?.canManage
                    ? "Open your tournament"
                    : "Organizer sign in"}
                <ArrowUpRight size={18} />
              </button>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="orbit orbit1" />
              <div className="orbit orbit2" />
              <div className="pitch">
                <div className="pitch-line" />
                <div className="stumps">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="cricket-ball" />
              <div className="hero-art-label">
                PLAY TOGETHER.
                <br />
                <strong>WIN TOGETHER.</strong>
              </div>
              <div className="spark">✳</div>
            </div>
          </section>
          {error && (
            <div className="error" role="alert">
              {error}
              <button
                onClick={() => {
                  setError("");
                  load();
                }}
              >
                Retry
              </button>
            </div>
          )}
          {loading ? (
            <div className="empty-state">
              <LoaderCircle className="spin" />
              Opening your workspace…
            </div>
          ) : !session?.canManage ? (
            <section className="welcome panel">
              <ShieldCheck size={32} />
              <h2>Your tournament control room</h2>
              <p>
                {!session?.configured
                  ? "Organizer access needs to be configured before the first tournament can be created."
                  : session?.signedIn
                    ? "This account does not have organizer access. Sign in with your tournament account."
                    : "Sign in to create tournaments and manage registrations. Players can register using a tournament’s shared link."}
              </p>
              <a className="button primary" href="#/login">
                Sign in <ArrowRight size={16} />
              </a>
              <p style={{ marginTop: 20, marginBottom: 0 }}>
                <a href="#/register">
                  Looking to play? Browse open tournaments ↗
                </a>
              </p>
            </section>
          ) : (
            <>
              <div className="stats-row">
                <Stat
                  icon={<Trophy />}
                  value={items.filter((t) => !t.settings.archived).length}
                  label="Active tournaments"
                />
                <Stat
                  icon={<Users />}
                  value={items.reduce((s, t) => s + t.total, 0)}
                  label="Player registrations"
                />
                <Stat
                  icon={<Wallet />}
                  value={items.reduce((s, t) => s + t.pending, 0)}
                  label="Awaiting verification"
                />
                <Stat
                  icon={<Radio />}
                  value={
                    items.filter((t) => t.settings.registrationOpen).length
                  }
                  label="Open for registration"
                />
              </div>
              <section className="tournament-section">
                <div className="section-heading">
                  <div>
                    <h2>
                      {tab === "active"
                        ? "Your tournaments"
                        : "Tournament archive"}{" "}
                      <span className="count">{filtered.length}</span>
                    </h2>
                    <p>
                      {tab === "active"
                        ? "Every tournament, ready for its next chapter."
                        : "Past seasons, with every result preserved."}
                    </p>
                  </div>
                  <label className="search">
                    <Search size={17} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Find a tournament…"
                      aria-label="Find a tournament"
                    />
                  </label>
                </div>
                <div className="tournament-grid">
                  {filtered.map((t, i) => (
                    <article className="tournament-card" key={t.id}>
                      <div className={"card-banner banner-" + (i % 3)}>
                        <span className="mini-brand">
                          BOUNDARY / TOURNAMENT {String(i + 1).padStart(2, "0")}
                        </span>
                        <Trophy size={83} strokeWidth={1} />
                        <span className="status-pill">
                          <i />
                          {t.settings.archived
                            ? "Archived"
                            : t.settings.registrationOpen
                              ? "Registration open"
                              : "Registration closed"}
                        </span>
                      </div>
                      <div className="card-body">
                        <div className="card-title-row">
                          <h3>{t.name}</h3>
                          <button
                            className="icon-button"
                            title="Tournament settings"
                            onClick={() => {
                              setError("");
                              setEditing(t);
                            }}
                          >
                            <Settings size={18} />
                          </button>
                        </div>
                        <div className="meta">
                          <CalendarDays size={14} />
                          {t.settings.date || "Date to be announced"}
                          <span>•</span>
                          <MapPin size={14} />
                          {t.settings.venue || "Venue to be announced"}
                        </div>
                        <div className="card-metrics">
                          <div>
                            <b>{t.total}</b>
                            <small>REGISTERED</small>
                          </div>
                          <div>
                            <b>{t.pending}</b>
                            <small>TO VERIFY</small>
                          </div>
                          <div>
                            <b>{money(t.settings.fee)}</b>
                            <small>ENTRY FEE</small>
                          </div>
                        </div>
                        <a
                          className="manage-link"
                          href={route("/auction/" + t.id)}
                        >
                          Open dashboard <ArrowUpRight size={17} />
                        </a>
                        <SheetStatus
                          id={t.id}
                          admin={session?.role === "admin"}
                        />
                        <div className="card-tools">
                          {session?.role === "admin" && (
                            <button onClick={() => setAccessFor(t)}>
                              <Users size={13} /> Invite owner
                            </button>
                          )}
                          <button onClick={() => copy("/register/" + t.id)}>
                            <Copy size={13} /> Registration link
                          </button>
                          {t.settings.liveEnabled && (
                            <a
                              href={route("/live/" + t.id)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Radio size={13} />
                              Live
                            </a>
                          )}
                          <button
                            onClick={() => backup(t)}
                            title="Download tournament backup"
                            aria-label={"Download " + t.name + " backup"}
                          >
                            <Download size={15} />
                          </button>
                          <button
                            onClick={() => archive(t)}
                            title={t.settings.archived ? "Restore" : "Archive"}
                            aria-label={
                              t.settings.archived
                                ? "Restore tournament"
                                : "Archive tournament"
                            }
                          >
                            <Archive size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {session?.role === "admin" && tab === "active" && !query && (
                    <button
                      className="create-card"
                      onClick={() => {
                        setError("");
                        setEditing(null);
                      }}
                    >
                      <span className="plus-circle">
                        <Plus size={26} />
                      </span>
                      <h3>
                        {items.length
                          ? "The next great season"
                          : "Your first tournament"}
                      </h3>
                      <p>
                        New teams. New possibilities.
                        <br />
                        All the tools you need, ready to go.
                      </p>
                      <strong>
                        Create tournament <ArrowRight size={15} />
                      </strong>
                    </button>
                  )}
                </div>
                {!filtered.length && query && (
                  <div className="empty-state">
                    No tournaments match “{query}”.
                  </div>
                )}
                {!filtered.length && tab === "archived" && !query && (
                  <div className="empty-state">
                    Archived tournaments will appear here.
                  </div>
                )}
              </section>
              <div className="help-strip">
                <span className="help-icon">
                  <LinkIcon size={20} />
                </span>
                <div>
                  <b>One link. Everyone in.</b>
                  <p>
                    {session?.role === "admin"
                      ? "Create a tournament, add payment details, and share your registration link. No spreadsheets to set up."
                      : "Share your registration link with players, review their registrations, and run your tournament from one dashboard."}
                  </p>
                </div>
                <span className="help-decor">↗</span>
              </div>
            </>
          )}
          <footer>
            MADE FOR THE LOVE OF THE GAME.
            <span>boundary · Cricket Auction Studio</span>
          </footer>
        </div>
      </main>
      {editing !== undefined && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modalTitle"
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">LET’S MAKE IT HAPPEN</span>
                <h2 id="modalTitle">
                  {editing ? "Tournament settings" : "A new season awaits."}
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setEditing(undefined)}
                aria-label="Close"
              >
                <X />
              </button>
            </div>
            <form onSubmit={save}>
              <div className="form-grid">
                <Field
                  label="Tournament name"
                  name="name"
                  defaultValue={editing?.name}
                  required
                  placeholder="e.g. Friends XI Premier League"
                  className="full"
                />
                <Field
                  label="Tournament date"
                  name="date"
                  type="date"
                  defaultValue={editing?.settings.date}
                />
                <Field
                  label="Venue"
                  name="venue"
                  defaultValue={editing?.settings.venue}
                  placeholder="Ground / city"
                />
                <Field
                  label="Entry fee (₹)"
                  name="fee"
                  type="number"
                  min="0"
                  defaultValue={editing?.settings.fee ?? 222}
                />
                <Field
                  label="Default team budget (₹)"
                  name="teamBudget"
                  type="number"
                  min="1"
                  defaultValue={editing?.settings.teamBudget ?? 100000}
                />
                <Field
                  label="Player base price (₹)"
                  name="basePrice"
                  type="number"
                  min="0"
                  defaultValue={editing?.settings.basePrice ?? 3000}
                />
                <Field
                  label="Payment recipient name"
                  name="paymentName"
                  defaultValue={editing?.settings.paymentName}
                />
                <Field
                  label="Payment phone"
                  name="paymentPhone"
                  defaultValue={editing?.settings.paymentPhone}
                />
                <Field
                  label="UPI ID"
                  name="upi"
                  defaultValue={editing?.settings.upi}
                  placeholder="yourname@bank"
                />
                <Field
                  label="Availability choices (comma-separated)"
                  name="availability"
                  className="full"
                  defaultValue={
                    editing?.settings.availability ?? defaults.availability
                  }
                />
                <label className="field full">
                  Tournament terms
                  <textarea
                    name="terms"
                    rows={3}
                    defaultValue={editing?.settings.terms ?? defaults.terms}
                  />
                </label>
                {editing && (
                  <label className="field full">
                    Payment QR image
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setBusy(true);
                        try {
                          const image = await originalImage(file);
                          const d = await request(
                            "/api/tournaments/" + editing.id + "/qr",
                            { method: "POST", body: JSON.stringify({ image }) },
                          );
                          setEditing({
                            ...editing,
                            settings: { ...editing.settings, qr: d.url },
                          });
                          note("QR uploaded. Save settings to apply.");
                        } catch (e: any) {
                          setError(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                    <input
                      type="hidden"
                      name="qr"
                      value={editing.settings.qr}
                    />
                    <input
                      type="hidden"
                      name="banner"
                      value={editing.settings.banner || ""}
                    />
                    {editing.settings.qr && (
                      <img
                        src={API + editing.settings.qr}
                        width="100"
                        alt="Payment QR"
                      />
                    )}
                  </label>
                )}
                {editing && (
                  <label className="field full">
                    Tournament banner / cover (optional)
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setBusy(true);
                        try {
                          const image = await originalImage(file);
                          const d = await request(
                            "/api/tournaments/" + editing.id + "/banner",
                            { method: "POST", body: JSON.stringify({ image }) },
                          );
                          setEditing({
                            ...editing,
                            settings: { ...editing.settings, banner: d.url },
                          });
                          note("Banner uploaded. Save settings to apply.");
                        } catch (e: any) {
                          setError(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                    {editing.settings.banner && (
                      <img
                        src={API + editing.settings.banner}
                        alt="Tournament cover"
                        style={{
                          width: "100%",
                          maxHeight: 130,
                          objectFit: "cover",
                        }}
                      />
                    )}
                  </label>
                )}
                <label className="check-field full">
                  <input
                    type="checkbox"
                    name="registrationOpen"
                    defaultChecked={editing?.settings.registrationOpen}
                  />
                  Open player registration
                </label>
                <label className="check-field full">
                  <input
                    type="checkbox"
                    name="liveEnabled"
                    defaultChecked={editing?.settings.liveEnabled}
                  />
                  Publish live results (player names, photos, teams and prices)
                </label>
              </div>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <div className="modal-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setEditing(undefined)}
                >
                  Cancel
                </button>
                <button className="button primary" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Check size={17} />
                  )}{" "}
                  {editing ? "Save changes" : "Create tournament"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {accessFor && (
        <OwnerAccess tournament={accessFor} close={() => setAccessFor(null)} />
      )}{" "}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
export function Field({ label, className = "", ...props }: any) {
  return (
    <label className={"field " + className}>
      {label}
      <input {...props} />
    </label>
  );
}
function Stat({ icon, value, label }: any) {
  return (
    <div className="stat panel">
      <span className="stat-icon">{icon}</span>
      <div>
        <strong>{value}</strong>
        <p>{label}</p>
      </div>
    </div>
  );
}
export async function resizeImage(file: File, max = 600): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 12000000
  )
    throw new Error("Choose a JPEG, PNG or WebP under 12 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

function SheetStatus({ id, admin }: { id: string; admin: boolean }) {
  const [status, setStatus] = useState<any>(null);
  useEffect(() => {
    let active = true;
    const load = () =>
      request("/api/tournaments/" + id + "/sync")
        .then((d) => {
          if (active) setStatus(d.sync);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [id]);
  if (!status) return null;
  return (
    <div className="sheet-status">
      <span>
        Google Sheets:{" "}
        {status.status === "synced"
          ? "Up to date"
          : status.status === "not_configured"
            ? "Not connected"
            : status.status === "error"
              ? "Sync needs attention"
              : "Sync pending"}
      </span>
      {status.url && (
        <a href={status.url} target="_blank" rel="noreferrer">
          Open ↗
        </a>
      )}
      {admin && status.status === "error" && (
        <button
          onClick={() =>
            request("/api/tournaments/" + id + "/sync", {
              method: "POST",
              body: "{}",
            }).then(() => setStatus({ ...status, status: "pending" }))
          }
        >
          Retry
        </button>
      )}
      {status.last_error && <small>{status.last_error}</small>}
    </div>
  );
}

function OwnerAccess({
  tournament,
  close,
}: {
  tournament: Tournament;
  close: () => void;
}) {
  const [members, setMembers] = useState<any[]>([]),
    [link, setLink] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    request("/api/tournaments/" + tournament.id + "/members")
      .then((d) => setMembers(d.members))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [tournament.id]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get("email");
    setBusy(true);
    setError("");
    try {
      const d = await request(
        "/api/tournaments/" + tournament.id + "/invites",
        { method: "POST", body: JSON.stringify({ email }) },
      );
      setLink(
        location.origin + route("/invite?token=" + encodeURIComponent(d.token)),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(user: any) {
    if (!confirm("Revoke " + user.email + "’s access to this tournament?"))
      return;
    try {
      await request("/api/tournaments/" + tournament.id + "/members", {
        method: "DELETE",
        body: JSON.stringify({ userId: user.id }),
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="accessTitle"
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">TOURNAMENT OWNER ACCESS</span>
            <h2 id="accessTitle">{tournament.name}</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close">
            <X />
          </button>
        </div>
        <p
          style={{
            fontSize: 12,
            color: "#839078",
            lineHeight: 1.8,
            marginBottom: 20,
          }}
        >
          Invite an owner to manage this tournament. They will set their own
          password. Each invitation is valid for 7 days and can be used once.
        </p>
        <form onSubmit={submit}>
          <Field
            label="Owner email address"
            name="email"
            type="email"
            required
          />
          <button
            className="button primary"
            style={{ marginTop: 15 }}
            disabled={busy}
          >
            {busy ? "Creating…" : "Create invitation link"}
          </button>
        </form>
        {link && (
          <div className="invite-result">
            <label className="field">
              Share this link privately
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
            </label>
            <button
              className="button secondary"
              onClick={() =>
                navigator.clipboard
                  .writeText(link)
                  .then(() => setError("Link copied."))
                  .catch(() =>
                    setError("Select and copy the invitation link above."),
                  )
              }
            >
              Copy invite link
            </button>
          </div>
        )}
        {error && (
          <div className="error" role="status">
            {error}
          </div>
        )}
        <h3 style={{ fontSize: 14, marginTop: 27 }}>Current owners</h3>
        {members.map((m) => (
          <div className="owner-row" key={m.id}>
            <span>{m.email}</span>
            <button onClick={() => revoke(m)}>Revoke access</button>
          </div>
        ))}
        {!members.length && (
          <p style={{ fontSize: 12, color: "#91a087", marginTop: 12 }}>
            No owner has accepted an invitation yet.
          </p>
        )}
      </section>
    </div>
  );
}

"use client";
import { useState, useEffect, useRef } from "react";
import {
  CheckCircle2,
  ArrowUpRight,
  ShieldCheck,
  LoaderCircle,
  ArrowRight,
} from "lucide-react";
import { Field, money, request, resizeImage } from "./studio";
import { route, originalImage } from "./client";
import { roles } from "../../backend/src/domain";
export default function Registration({ id }: { id: string }) {
  const [t, setT] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [regId, setRegId] = useState(""),
    [photo, setPhoto] = useState(""),
    [pay, setPay] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null),
    [payFile, setPayFile] = useState<File | null>(null);
  const [source, setSource] = useState<ImageBitmap | null>(null),
    [zoom, setZoom] = useState(1),
    [pos, setPos] = useState({ x: 0, y: 0 });
  const canvas = useRef<HTMLCanvasElement>(null),
    drag = useRef<any>(null);
  useEffect(() => {
    request("/api/tournaments/" + id)
      .then((d) => setT(d.tournament))
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => () => source?.close(), [source]);
  useEffect(() => {
    if (!source || !canvas.current) return;
    const c = canvas.current,
      ctx = c.getContext("2d")!;
    const scale =
      Math.max(c.width / source.width, c.height / source.height) * zoom;
    const w = source.width * scale,
      h = source.height * scale;
    const x = Math.max(c.width - w, Math.min(0, (c.width - w) / 2 + pos.x));
    const y = Math.max(c.height - h, Math.min(0, (c.height - h) / 2 + pos.y));
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(source, x, y, w, h);
    setPhoto(c.toDataURL("image/jpeg", 0.85));
  }, [source, zoom, pos]);
  async function upload(file: File | undefined, kind: string) {
    if (!file) return;
    try {
      setError("");
      if (kind === "photo") {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 12000000
        )
          throw new Error("Choose a JPEG, PNG or WebP under 12 MB.");
        const bitmap = await createImageBitmap(file);
        setPhotoFile(file);
        setSource(bitmap);
        setZoom(1);
        setPos({ x: 0, y: 0 });
      } else {
        setPayFile(file);
        setPay(await originalImage(file));
      }
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!photo) {
      setError("Upload your player photo.");
      return;
    }
    if (t.settings.fee > 0 && !pay) {
      setError("Upload your payment screenshot.");
      return;
    }
    setBusy(true);
    const f = new FormData(e.currentTarget);
    f.set("agreed", String(f.get("agreed") === "on"));
    f.set("photoURL", photoFile!);
    const thumb = await (await fetch(photo)).blob();
    f.set("photoThumbURL", thumb, "preview.jpg");
    if (payFile) f.set("payScreenshotURL", payFile);
    try {
      const d = await request("/api/tournaments/" + id + "/register", {
        method: "POST",
        body: f,
      });
      setRegId(d.regId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const s = t?.settings;
  return (
    <div className="public-shell">
      <header className="public-top">
        <a className="logo" href="#/">
          <span className="logo-mark">b.</span>boundary
        </a>
        {s?.liveEnabled && (
          <a href={route("/live/" + id)}>
            Follow the auction <ArrowUpRight size={13} />
          </a>
        )}
      </header>
      {!t ? (
        <div className={error ? "error" : "empty-state"}>
          {error || "Loading tournament…"}
        </div>
      ) : (
        <>
          <section
            className={"public-hero " + (s.banner ? "has-banner" : "")}
            style={
              s.banner
                ? {
                    backgroundImage: `linear-gradient(90deg,rgba(13,40,29,.88),rgba(13,40,29,.25)),url("${s.banner}")`,
                  }
                : undefined
            }
          >
            <div className="eyebrow">YOUR NEXT INNINGS STARTS HERE</div>
            <h1>{t.name}</h1>
            <p>
              {s.date || "Date to be announced"}
              {s.venue ? " · " + s.venue : ""}
            </p>
            <p>Player registration · {money(s.fee)} entry fee</p>
          </section>
          {regId ? (
            <section className="success panel" role="status">
              <CheckCircle2 />
              <h2>You’re on the list!</h2>
              <p>
                Keep your registration ID safe.
                <br />
                Your payment and details will be reviewed by the organizer.
              </p>
              <strong>{regId}</strong>
              <p>Registration status: Pending verification</p>
            </section>
          ) : !s.registrationOpen ? (
            <section className="success panel">
              <ShieldCheck />
              <h2>Registration is closed</h2>
              <p>Contact the tournament organizer for the next opening.</p>
            </section>
          ) : (
            <>
              <div className="payment-panel">
                <div>
                  <p>REGISTRATION FEE · NON-REFUNDABLE</p>
                  <h2>{money(s.fee)}</h2>
                  <p>
                    {s.fee > 0 ? (
                      <>
                        Pay to {s.paymentName || "the tournament organizer"}
                        <br />
                        {s.upi || s.paymentPhone}
                      </>
                    ) : (
                      "No payment required for this tournament."
                    )}
                  </p>
                  {s.upi && (
                    <a
                      className="button secondary"
                      href={
                        "upi://pay?pa=" +
                        encodeURIComponent(s.upi) +
                        "&pn=" +
                        encodeURIComponent(s.paymentName) +
                        "&am=" +
                        s.fee +
                        "&cu=INR"
                      }
                    >
                      Open UPI app <ArrowUpRight size={13} />
                    </a>
                  )}
                </div>
                {s.qr && (
                  <a href={s.qr} target="_blank" rel="noreferrer">
                    <img src={s.qr} alt="Scan to pay tournament fee" />
                  </a>
                )}
              </div>
              <form className="registration-form panel" onSubmit={submit}>
                <h2 className="form-section">
                  <span className="section-number">01</span> The player behind
                  the game
                </h2>
                <div className="form-grid">
                  <Field
                    label="Full name *"
                    name="name"
                    required
                    maxLength={100}
                    autoComplete="name"
                  />
                  <Field
                    label="Cric Heroes number *"
                    name="cricHeroesNum"
                    required
                    maxLength={80}
                  />
                  <Field
                    label="Phone number *"
                    name="phone"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    autoComplete="tel"
                  />
                  <Field
                    label="Alternate phone"
                    name="altPhone"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    maxLength={10}
                  />
                  <Field
                    label="Address *"
                    name="address"
                    required
                    maxLength={1000}
                    className="full"
                  />
                  <label className="field">
                    Player role *
                    <select name="playerType" required>
                      <option value="">Select your role</option>
                      {roles.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Availability *
                    <select name="availability" required>
                      <option value="">Select availability</option>
                      {s.availability
                        .split(",")
                        .map((x: string) => x.trim())
                        .filter(Boolean)
                        .map((v: string) => (
                          <option key={v}>{v}</option>
                        ))}
                    </select>
                  </label>
                </div>
                <h2 className="form-section">
                  <span className="section-number">02</span> Put a face to the
                  name
                </h2>
                <label className="field">
                  Player photo *
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => upload(e.target.files?.[0], "photo")}
                  />
                </label>
                {source && (
                  <div className="crop-panel">
                    <canvas
                      className="crop-canvas"
                      ref={canvas}
                      width="400"
                      height="500"
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        drag.current = {
                          x: e.clientX,
                          y: e.clientY,
                          px: pos.x,
                          py: pos.y,
                        };
                      }}
                      onPointerMove={(e) => {
                        if (drag.current)
                          setPos({
                            x:
                              drag.current.px +
                              ((e.clientX - drag.current.x) * 400) /
                                e.currentTarget.clientWidth,
                            y:
                              drag.current.py +
                              ((e.clientY - drag.current.y) * 500) /
                                e.currentTarget.clientHeight,
                          });
                      }}
                      onPointerUp={() => (drag.current = null)}
                      onPointerCancel={() => (drag.current = null)}
                    />
                    <span className="crop-help">
                      Drag to position your photo · Zoom below
                    </span>
                    <input
                      aria-label="Photo zoom"
                      type="range"
                      min="1"
                      max="3"
                      step=".01"
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                    />
                  </div>
                )}
                {s.fee > 0 && (
                  <>
                    <h2 className="form-section">
                      <span className="section-number">03</span> Payment
                      confirmation
                    </h2>
                    <div className="form-grid">
                      <Field
                        label="UTR / transaction ID *"
                        name="utr"
                        required
                        minLength={4}
                        maxLength={100}
                      />
                      <label className="field">
                        Payment screenshot *
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) =>
                            upload(e.target.files?.[0], "payment")
                          }
                        />
                      </label>
                      {pay && (
                        <img
                          className="photo-preview"
                          src={pay}
                          alt="Your payment screenshot"
                        />
                      )}
                    </div>
                  </>
                )}
                <div className="terms">{s.terms}</div>
                <label className="check-field">
                  <input type="checkbox" name="agreed" required />I agree to the
                  tournament terms. My player name, photo, role, and auction
                  result may be shown on the public live page when enabled by
                  the organizer.
                </label>
                {error && (
                  <div className="error" role="alert">
                    {error}
                  </div>
                )}
                <div className="submit-row">
                  <p>
                    <ShieldCheck size={12} /> Payment details are visible only
                    to organizers.
                    <br />
                    Review your information before submitting.
                  </p>
                  <button className="button primary" disabled={busy}>
                    {busy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <ArrowRight size={16} />
                    )}{" "}
                    {busy
                      ? "Submitting registration…"
                      : "Register for the tournament"}
                  </button>
                </div>
              </form>
            </>
          )}
        </>
      )}
      <footer>
        MADE FOR THE LOVE OF THE GAME.
        <span>boundary · Cricket Auction Studio</span>
      </footer>
    </div>
  );
}

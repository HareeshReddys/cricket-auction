import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Studio from "./studio";
import Registration from "./registration";
import Live from "./results";
import Directory from "./register-directory";
import Login from "./login";
import { API } from "./client";
import "./styles.css";
function App() {
  const [hash, setHash] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const update = () => setHash(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const url = new URL(hash, "https://app.local"),
    parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "register" && parts[1])
    return <Registration id={parts[1]} />;
  if (parts[0] === "live" && parts[1]) return <Live id={parts[1]} />;
  if (parts[0] === "register") return <Directory />;
  if (["login", "invite", "setup"].includes(parts[0]))
    return (
      <Login
        key={parts[0]}
        mode={parts[0]}
        token={url.searchParams.get("token") || ""}
        returnTo={url.searchParams.get("returnTo") || "/"}
      />
    );
  if (parts[0] === "auction" && parts[1])
    return (
      <iframe
        title="Tournament auction dashboard"
        className="auction-frame"
        src={
          import.meta.env.BASE_URL +
          "auction.html?t=" +
          encodeURIComponent(parts[1])
        }
      />
    );
  return <Studio />;
}
sessionStorage.setItem("boundary_api_url", API);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker
    .register(import.meta.env.BASE_URL + "sw.js")
    .catch(() => {});

import fs from "node:fs/promises";
let s = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");
s = s
  .replace(/var SCRIPT_URL=.*?;/, 'var SCRIPT_URL="";')
  .replace(/var ADMIN_PASS=.*?;/, "");
s = s.replace(
  /\/\/ LOGIN[\s\S]*?\/\/ NAVIGATION/,
  "// LOGIN\nfunction doLogin(){loadData();}\n// NAVIGATION",
);
s = s.replace(/<!-- LOGIN -->[\s\S]*?<!-- APP -->/, "<!-- APP -->");
s = s
  .replace(/([a-zA-Z.]+)\.startsWith\("data:"\)/g, "isPhotoURL($1)")
  .replace(/&&p\.PhotoURL\.length>1000/g, "")
  .replace("src.length>5000", "isPhotoURL(src)");
s = s
  .replaceAll("+p.Name+", "+escJs(p.Name)+")
  .replaceAll("+p.name+", "+escJs(p.name)+")
  .replaceAll("+bidPlayer.name+", "+escJs(bidPlayer.name)+");
s = s.replaceAll("<img ", '<img loading="lazy" ');
s = s
  .replaceAll("Friend's 11 Tournament 2026", "Tournament dashboard")
  .replaceAll("Friends11_", "Tournament_");
s = s.replace(
  "</head>",
  '<link rel="stylesheet" href="auction-theme.css"/></head>',
);
s = s.replace(
  "<body>",
  '<body><div class="workspace-bar"><a href="./#/" target="_top">← boundary / Tournaments</a><strong id="tournamentName">Loading tournament…</strong><span id="saveIndicator" role="status">Connecting…</span><a id="registrationLink" target="_blank">Registration ↗</a></div><div id="saveBlocker" hidden><div>Saving changes…</div></div><div id="persistentError" hidden role="alert"></div>',
);
s = s.replace("</body>", '<script src="auction-runtime.js"></script></body>');
s = s
  .replaceAll('String(c||"").replace', "csvSafe(c).replace")
  .replaceAll('String(p[k]||"").replace', "csvSafe(p[k]).replace");
// Use previews in lists before the browser starts any original-image requests.
for (const value of ["p.PhotoURL", "p.photo", "bidPlayer.photo"]) {
  s = s.replaceAll(`src="'+${value}+'"`, `src="'+previewURL(${value})+'"`);
}
s=s.replaceAll('img.src=p.PhotoURL;', 'img.src=previewURL(p.PhotoURL);');
await fs.writeFile(
  new URL("../dashboard/public/auction.html", import.meta.url),
  s,
);

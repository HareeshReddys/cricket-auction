# Boundary · independent cricket tournament dashboard

A GitHub Pages frontend with an independent API. No ChatGPT account or ChatGPT sign-in is required. The original `index.html` auction controls are retained in the standalone dashboard; the original HTML files and their Apps Script endpoints remain unchanged for the existing deployment.

## Access model

| Person | Access |
| --- | --- |
| Platform administrator | Creates tournaments, sees every tournament, invites and revokes tournament owners |
| Invited tournament owner | Sets their own password and manages only their assigned tournament(s) |
| Player | Registers through a public tournament URL; no login |
| Spectator | Views public live results when the owner enables them; no login |

The administrator clicks **New tournament**, opens **Invite owner**, enters the owner's email and shares the one-time invitation privately. The owner sets a password; future visits use the ordinary login URL. Invitations expire after seven days. Reissuing an unused invitation for the same owner invalidates the older invitation.

Example URLs after GitHub Pages deployment:

- Platform / login: `https://hareeshreddys.github.io/cricket-auction/#/login`
- Tournament dashboard: `https://hareeshreddys.github.io/cricket-auction/#/auction/<tournament-id>`
- Public registration: `https://hareeshreddys.github.io/cricket-auction/#/register/<tournament-id>`
- Public results: `https://hareeshreddys.github.io/cricket-auction/#/live/<tournament-id>`

These are the expected URL shapes, not a claim that the new implementation is already live. The Pages workflow requires the deployed API URL before replacing a working Pages deployment.

## Speed and image quality

The dashboard reads a metadata-only database snapshot instead of waiting for sequential Apps Script responses containing every base64 photo. List views use separate preview images. Clicking a player photo opens the **original uploaded bytes**, without recompression or downscaling. The registration form sends the original image and its cropped preview separately. Original-image preservation is tested byte for byte.

Photos and private payment receipts are kept in the D1 database by default, with original bytes split into small rows. No R2 subscription or payment method is required. The free database limit is 500 MB including image storage (base64 adds approximately one-third overhead); this configuration is intended for small tournaments. R2 remains optional for larger deployments. Private image URLs are signed for 30 minutes. Public results include only verified player names, roles, photos, teams and prices; contact details and receipts require tournament authorization.

The visible auction checks a small version endpoint every three seconds. Player data is fetched again only when the version changes. A cached metadata snapshot is available in the same browser tab during an interruption; auction writes are disabled offline. Browser shell files are cached by a service worker after a first successful visit. Shared registration, login and auction updates require internet access. There is no measured production latency guarantee.

Registration has a clean default design and supports an optional tournament banner in **Tournament settings**. The banner is independent of player photos and payment QR images.

## One-time hosting setup

GitHub Pages serves static files. The API runs in your own Cloudflare account with D1 for records and original images. This repository includes the Worker and its deployment workflow; it is independent of the earlier ChatGPT Sites prototype.

1. Run `npm ci --ignore-scripts` with Node 24.
2. Sign into your own Cloudflare account: `npx wrangler login`.
3. Create the database: `npx wrangler d1 create boundary-cricket`. Put the returned database ID into `backend/wrangler.jsonc` **once**.
4. Image storage uses D1 automatically. No R2 setup is required. For a larger deployment, optionally create an R2 bucket and configure a `BUCKET` binding.
5. Check `ADMIN_EMAIL` and `FRONTEND_ORIGIN` in `backend/wrangler.jsonc`. Origins include only scheme and host, not the GitHub repository path. You may list multiple origins separated by commas.
6. Generate separate strong random values, for example with `openssl rand -hex 32`, and enter them through Wrangler's secret prompt:
   - `npx wrangler secret put ADMIN_SETUP_TOKEN --config backend/wrangler.jsonc`
   - `npx wrangler secret put ASSET_SIGNING_KEY --config backend/wrangler.jsonc`
7. Run `npm run db:remote` and `npm run deploy:api`. Keep the printed Worker URL.
8. In the GitHub repository, set Actions variable **BOUNDARY_API_URL** to that Worker URL (without a trailing slash). Set Pages source to **GitHub Actions**. Push to `main` or run **Publish dashboard to GitHub Pages** manually.
9. Visit the frontend `#/setup` once. Use the configured admin email and setup token to choose your own password. Administrator creation is locked after the first successful setup. Remove the bootstrap secret afterward if desired.

For subsequent API deployments, the optional `backend.yml` workflow uses repository secret `CLOUDFLARE_API_TOKEN` and variable `CLOUDFLARE_ACCOUNT_ID`. Scope the token to the Worker, D1 and R2 resources it deploys. Provider credentials and secrets must never be committed or placed in `VITE_*` variables.

Only this initial infrastructure setup requires provider configuration. Creating another tournament, adding teams, inviting its owner or updating payment details does not require a code edit, deployment, spreadsheet ID or additional backend.

## Automatic Google Sheets (one-time connection)

The fast database serves dashboard reads. Google Sheets is an automatically maintained mirror; manual edits made directly in a mirror are not imported into the database.

The simplest connection uses your existing Google account:

1. Create a separate Apps Script project and copy [google-sheets/Code.gs](google-sheets/Code.gs) into it. This does **not** replace the existing live registration/auction script.
2. In Script Properties, add **BOUNDARY_WEBHOOK_SECRET** with a strong random value of at least 32 characters.
3. Deploy it once as a web app, **execute as you**, with access **Anyone**. Writes still require the server-to-server secret. Google will require authorization to create and edit your spreadsheets.
4. Set backend variable **GOOGLE_SHEETS_WEBHOOK_URL** to that deployed `/exec` URL, and backend secret **GOOGLE_SHEETS_WEBHOOK_SECRET** to the matching value. For example use `wrangler secret put ... --config backend/wrangler.jsonc`; keep the webhook URL in Worker configuration or its dashboard variables. Redeploy the API after adding configuration variables.

Now **New tournament** queues a new Google workbook automatically. Each workbook has `Registrations`, `Teams`, `Auction` and `Settings` tabs. Later changes update that same workbook using batch operations. The dashboard shows sync state and an **Open** link. Failures remain visible and retry on the next update or the five-minute scheduled job. The script and Worker both prevent duplicate workbooks on normal retries and stale versions from replacing newer data.

OAuth refresh-token and shared-drive service-account paths are also supported by `backend/src/sheets.ts` if you prefer direct Google API access. Use `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, or `GOOGLE_SERVICE_ACCOUNT_JSON` plus a suitable `GOOGLE_DRIVE_FOLDER_ID`. Service accounts generally need a shared-drive destination because they cannot own ordinary Drive files. Optional `GOOGLE_SHEET_SHARE_EMAIL` grants a human account writer access to workbooks created through the direct API path.

Existing Google Sheets registrations and auction results have not been migrated. Connecting the mirror does not import or overwrite the old Sheets.

## Local development

1. Copy `backend/.dev.vars.example` to `backend/.dev.vars`. Use local values for the setup and image-signing secrets, and `http://127.0.0.1:5173` as the origin.
2. Run `npm run db:local`.
3. Run `npm run dev:api` and `npm run dev` in separate terminals.
4. Open `http://127.0.0.1:5173/#/setup` for the initial local administrator.

Local and hosted databases are separate. Local preview data and secrets are ignored by Git. `scripts/local-preview.mjs` and `scripts/accept-local-invite.mjs` create synthetic loopback-only QA records; they do not operate against production.

## Verification

- `npm run check` — frontend and backend TypeScript.
- `npm test` — independent login, admin-only creation, one-use invitations, tournament isolation, original photo bytes, signed/private images, public data privacy, auction budgets, concurrent revisions, Google sync retry/idempotency, and the Apps Script bridge.
- `npm run build` — GitHub Pages assets, auction adapter and offline shell.

The earlier Sites prototype remains in the ignored local `tournament-studio/` folder. It is not used by the independent build or included in the GitHub Pages artifact.

## CricHeroes player statistics

Registration accepts an optional full CricHeroes player profile link in addition to the registered number. Auction cards, the bidding window and registration details offer **View CricHeroes stats** when a link is available. Organizers can add, edit or remove links for existing players. A mobile number alone is never guessed as a player profile ID.

Profiles open on CricHeroes in a separate tab using the visitor's own CricHeroes session. Basic public statistics and any Pro-only insights remain controlled by CricHeroes; this dashboard does not import statistics or share/store CricHeroes credentials. Sign in again if CricHeroes expires the session. Use the full `https://cricheroes.com/player-profile/...` link, rather than a shortened sharing URL.

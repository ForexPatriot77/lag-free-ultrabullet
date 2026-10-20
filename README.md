# Speedchess

A small Lichess-inspired speed-chess experiment: minimal interface, offline-first local play, and a starter matchmaking service.

## Current prototype includes
- Hyperbullet 30s, Ultrabullet 15s, Nanobullet 7.5s, plus experimental 3s and 1s controls.
- Local two-player chess with legal move selection, check/checkmate/stalemate, castling, en passant, and queen promotion.
- A service worker that caches the app shell for offline use after the first successful visit.
- Optional Cloudflare Worker + Durable Object WebSocket matchmaking code.
- No accounts, no saved user profiles, no persistent game history.

## Important limitations
This is a prototype, not a production chess server. The online Worker currently relays client moves but does not validate chess rules or clocks on the server. A modified client could cheat or send invalid moves. Do not use it for ratings or serious competitive play until server-side validation, clock enforcement, reconnection handling, abuse controls, and tests are added.

Offline local play works after the page is cached, but online PvP always needs internet and a deployed WebSocket service. A `file://` double-click can be used for local practice, but service workers require HTTPS or localhost, so offline caching is enabled once hosted on GitHub Pages (HTTPS) or run from localhost.

## Test locally
For a quick local board test, double-click `index.html`. To test the offline service worker, use a local HTTP server:
```bash
python3 -m http.server 8000
```
Then visit `http://localhost:8000`.

## Publish frontend to GitHub Pages
1. Create a public repository named `speedchess`.
2. Upload `index.html`, `style.css`, `config.js`, `chess.js`, `app.js`, `manifest.webmanifest`, and `sw.js` to the repository root.
3. In Settings → Pages, publish the `main` branch from `/(root)`.
4. Visit `https://YOUR-USERNAME.github.io/speedchess/`.
5. Open it once online, then test by disabling the network and reloading.

## Deploy the temporary matchmaking Worker
Cloudflare's dashboard labels may change, so verify the current UI when deploying.
1. Create a Cloudflare account and open Workers & Pages.
2. Create a Worker project. The simplest reproducible path is to use Wrangler from a terminal with Node.js installed.
3. Put `worker.js` and `wrangler.toml` in a separate directory.
4. Run `npx wrangler login`, then `npx wrangler deploy`.
5. Copy the deployed Worker URL and add `/ws` to it. It should look like `wss://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/ws`.
6. Paste that URL into `config.js` as `websocketUrl`.
7. Commit the updated `config.js` to GitHub and reload the Pages site.

### Development status
- [x] Static frontend and chessboard
- [x] Local two-player chess prototype
- [x] Offline app-shell caching
- [x] Temporary matchmaking / move-relay Worker scaffold
- [ ] Server-authoritative chess rules and clocks
- [ ] Reconnection and disconnect grace period
- [ ] Spectator mode, ratings, profiles, and history (intentionally postponed)

## License note
This is an original prototype inspired by the general idea of a clean speed-chess interface; it is not the Lichess source code and does not use Lichess branding or assets. If you later reuse Lichess code or Chessground, follow the relevant licenses and attribution requirements.

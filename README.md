# Lag-Free Ultrabullet

An independent, fast-chess web application with eight no-increment time controls, player profiles, separate rating pools, open challenges, and live game viewing.

**Live site:** https://forexpatriot77.github.io/lag-free-ultrabullet/

## Current release status

This is a **release candidate**, not yet a fully verified public release. The frontend build and automated tests run in GitHub Actions. The Supabase game and Lichess authentication functions are deployed. The database now supports all eight rating pools.

A true release still requires two-account end-to-end tests (Lichess sign-in, challenge creation/joining, move legality, clocks, terminal results, rating changes, spectators, and reconnects). Online moves are currently submitted to the Supabase Edge Function for validation and persistence; peer-to-peer WebRTC move transport is **not implemented**. The ultra-short controls are therefore particularly sensitive to network latency.

## Time controls and rating pools

All controls use zero increment and have independent Elo ratings:

| Initial time | Name / pool |
|---:|---|
| 30 seconds | Hyperbullet |
| 15 seconds | Ultrabullet |
| 7.5 seconds | Ultrazerk |
| 3.25 seconds | Psycho |
| 1.625 seconds | Psycho |
| 0.8125 seconds | Psycho |
| 0.40625 seconds | Psycho |
| 0.203125 seconds | Psycho |

The five Psycho clocks share the Psycho name but have separate rating pools. Lichess Bullet is imported once as the initial Hyperbullet rating; Lichess Ultrabullet is imported once as the initial 15-second rating. Re-authenticating with Lichess refreshes the linked account metadata without resetting locally earned ratings.

## Features currently implemented

- Lichess OAuth 2.0 authorization-code flow with PKCE and email-read permission, including safe linking to an existing matching-email Lag-Free account.
- Existing email/password sign-in, registration, password recovery, and Lichess connection management from profile settings.
- Player profiles with editable username, display name, and bio.
- Eight no-increment challenge time controls.
- Quick matchmaking by exact time control (abandoned queue entries expire after two minutes), plus open challenges, shareable invite links, joining, cancellation, and 24-hour challenge expiry.
- Chessground board with legal moves checked by chess.js on the server.
- Server-maintained clocks, move history, checkmate, stalemate, draw, resignation, and timeout handling.
- Separate Elo pools for all eight exact time controls.
- Rating history snapshots for games completed after the rating-history migration.
- Time-control leaderboard, recent games, and live-game viewing.

## Stack

- React 19, TypeScript, Vite 8
- Chessground for board rendering
- chess.js for chess rules
- Supabase Auth, Postgres, Realtime, and Edge Functions
- GitHub Pages for the static frontend

## Local development

Requirements: Node.js 24+ and npm.

1. Clone this repository.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Copy `.env.example` to `.env`. The checked-in browser values are public publishable credentials; never add a Supabase secret or service-role key to frontend files.
4. Start the development server:

   ```sh
   npm run dev
   ```

5. Run automated tests and a production build:

   ```sh
   npm test
   npm run build
   ```

## Supabase setup

The timestamped SQL migrations in `supabase/migrations` evolve the database. For a brand-new Supabase project, first run `supabase/bootstrap.sql` in the SQL editor, then apply every migration in ascending timestamp order. **Do not run the bootstrap file against the existing populated project.**

Deploy the Edge Functions from their source directories:

- `supabase/functions/ultrabullet` — requires JWT verification.
- `supabase/functions/lichess-auth` — public OAuth callback; performs its own PKCE/code validation and strict redirect allow-listing.

Configure Supabase Auth's site URL and redirect allow-list for the production GitHub Pages URL and the local Vite URL. Lichess OAuth must be registered with the matching production redirect URI. Keep Supabase secret/service-role credentials only in Supabase's server-side function environment.

## Licensing and attribution

This repository includes Lila frontend stylesheet source under `ui/lib/css`, `ui/lobby/css`, and `ui/round/css`. Those files are from Lichess Lila and are distributed under AGPL-3.0-or-later; see `LILA-COPYING.md`. The Chessground dependency is GPL-3.0-or-later. This combined application is distributed under AGPL-3.0-or-later; see `LICENSE`.

The current repository does not include the non-free Lila assets listed in the upstream copying notice. Third-party asset and dependency notices must be checked again before adding any upstream Lila images, fonts, sounds, or piece sets. The interface is independent and is not affiliated with or endorsed by Lichess.

The site footer links to the source and license. The public source repository is the Corresponding Source for the deployed frontend.

## Known limitations before formal release

- No WebRTC peer-to-peer move channel yet; moves still make a server round-trip.
- No in-game chat, draw offers, rematch flow, or moderation/reporting tools.
- No automated two-browser integration test suite; live two-player behavior still needs manual verification.
- Rating history starts at the deployment of the rating-history migration; older games were not backfilled.
- The frontend is hosted on GitHub Pages; the Scala Lila backend is not part of this deployment.

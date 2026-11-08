# Lag-Free Ultrabullet

An independent chess platform built from scratch. The interface takes inspiration from the usability of online chess sites, while the application, backend, and product identity are our own.

**This project does not modify, fork, or depend on the Lichess application.** It uses the separately published Chessground board library.

## Stack

- React + TypeScript + Vite
- [Chessground](https://github.com/lichess-org/chessground) for board rendering and interaction
- [chess.js](https://github.com/jhlywa/chess.js) for legal chess moves and game state
- Supabase Auth, Postgres, Realtime, and Edge Functions

## Requirements

- Node.js 24+
- npm

## Local development

1. Clone this repository.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Copy `.env.example` to `.env` and set the Supabase project URL and publishable key.
4. Start the dev server:

   ```sh
   npm run dev
   ```

5. Create a production build:

   ```sh
   npm run build
   ```

## Supabase configuration

The browser application uses the project's publishable key. The deployed Edge Function uses Supabase's `@supabase/server` authentication context and server-side credentials supplied by the Supabase runtime.

Never put a Supabase secret key or service-role key in frontend code, GitHub Pages build variables, or any public repository file.

The connected Supabase project currently contains these tables:

- `profiles` — player usernames, display names, and bios
- `games` — authoritative 15-second ultrabullet game state and clocks
- `game_moves` — server-accepted move history
- `player_ratings` — server-maintained ultrabullet Elo ratings and records

All exposed tables use Row Level Security. Game creation, joining, move commits, game completion, and rating changes are performed through server-controlled database functions called by the authenticated Edge Function. Clients cannot write game state or rating values directly.

The `ultrabullet` Edge Function validates the user's session, checks legal moves with `chess.js`, maintains the authoritative clock state, and returns game snapshots. Supabase Realtime publishes game updates to participants and signed-in spectators.

## Current implementation

- Email/password registration and sign-in
- Editable player username, display name, and bio
- Local Chessground practice board
- 15-second online ultrabullet challenges and invite links
- Open challenge lobby and live-game spectator list
- Server-validated legal moves and promotion-to-queen
- Server-authoritative clocks, timeout, resignation, checkmate, and draw handling
- Realtime game updates
- Completed-game history and move review
- Initial Elo rating system and ultrabullet leaderboard

## Still in development

This is an early playable foundation, not a finished Lichess-scale platform. Matchmaking queues, puzzles, deeper analysis tools, chat, teams, moderation, account recovery polish, and broader testing remain to be built. Online play also needs end-to-end testing with real signed-in players.

## Chessground license

Chessground is distributed under **GPL-3.0-or-later**. Because it is part of this web application, this project is also distributed under GPL-3.0-or-later. Source code for the combined application must be made available to users. See the [GNU GPL v3 text](https://www.gnu.org/licenses/gpl-3.0.html).

This project is independent and is not affiliated with or endorsed by Lichess.

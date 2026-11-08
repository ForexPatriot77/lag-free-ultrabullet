# Lag-Free Ultrabullet

An independent chess platform built from scratch. The interface takes inspiration from the usability of online chess sites, while the application, backend, and product identity are our own.

**This project does not modify, fork, or depend on the Lichess application.** It uses the separately published Chessground board library.

## Stack

- React + TypeScript + Vite
- [Chessground](https://github.com/lichess-org/chessground) for board rendering and interaction
- [chess.js](https://github.com/jhlywa/chess.js) for legal chess moves and game state
- Supabase for the planned authentication, database, and realtime services

## Requirements

- Node.js 20.19+ (or a compatible newer release)
- npm

## Local development

1. Clone this repository.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Copy `.env.example` to `.env` and set the Supabase publishable key.
4. Start the dev server:

   ```sh
   npm run dev
   ```

5. Create a production build:

   ```sh
   npm run build
   ```

## Supabase

The project is configured to use the new Supabase project through environment variables. The browser app must only use the project's publishable key. Never place a Supabase secret key or service-role key in frontend code or commit either one to Git.

No database schema has been applied yet. Tables, RLS policies, and Realtime configuration will be introduced in deliberate, reviewable migrations once the multiplayer data model is designed.

## Current milestone

The first milestone is the independent play-screen shell and a local legal-move board. Online matchmaking, server-authoritative games, clocks, accounts, ratings, and persistence are not implemented yet.

## Chessground license

Chessground is distributed under **GPL-3.0-or-later**. Because it is part of this web application, this project is also distributed under GPL-3.0-or-later. Source code for the combined application must be made available to users. See the [GNU GPL v3 text](https://www.gnu.org/licenses/gpl-3.0.html).

This project is independent and is not affiliated with or endorsed by Lichess.
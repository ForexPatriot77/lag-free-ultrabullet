# Formal release checklist

## Completed in this release-candidate pass

- [x] Database accepts all eight configured no-increment clock values.
- [x] Eight independent rating columns and rating-history snapshots.
- [x] Server rating updates select the pool associated with the exact initial time.
- [x] Lichess import maps Bullet to Hyperbullet and Ultrabullet to 15 seconds.
- [x] Lichess sign-in email validation corrected.
- [x] Lichess re-authentication no longer overwrites a player's chosen username or resets local ratings.
- [x] Open challenges expire from the lobby after 24 hours and can be cancelled by their creator.
- [x] Profile grants reduced to the permissions needed by the UI.
- [x] Password recovery flow and Supabase callback separation.
- [x] Mobile navigation remains visible.
- [x] Automated time-control and chess-rules tests run in CI.

## Required before announcing a formal release

- [ ] Complete a real Lichess OAuth sign-in using an account with email-read permission.
- [ ] Test two independent accounts in two browsers/devices.
- [ ] Run `supabase/smoke_test.sql` and verify the final game and queue counts are unchanged after rollback.
- [ ] Verify quick matchmaking for each time control, queue cancellation, and abandoned queue expiry.
- [ ] Verify create, join, cancel, and 24-hour challenge expiry.
- [ ] Play complete games at every time control and verify both clocks and exact rating pool updates.
- [ ] Verify promotion choices, checkmate, stalemate, insufficient-material draw, resignation, and timeout.
- [ ] Verify spectators, move history, profile visibility, leaderboard ordering, and rating-history charts for all eight pools.
- [ ] Verify existing email accounts can connect their matching-email Lichess account from profile settings.
- [ ] Verify refresh/reconnect behavior during an active game.
- [ ] Implement WebRTC peer-to-peer move transport with authenticated signaling, move sequencing, reconnect/resync, and server-side result verification. It is not implemented yet.
- [ ] Configure production SMTP and test signup confirmation/password recovery emails.
- [ ] Audit Supabase Auth redirect settings, email templates, rate limits, and abuse controls.
- [ ] Enable Supabase leaked-password protection if the project plan supports it; otherwise consider disabling password-based signups and relying on Lichess OAuth.
- [ ] Publish privacy and terms pages that accurately describe email/profile/game/Lichess data, retention, account deletion, age policy, and an appropriate contact route.
- [ ] Review all third-party dependency and asset licenses before adding assets.
- [ ] Run an independent security review of Edge Functions, RLS, database functions, and OAuth account linking.

A green build is necessary but does not substitute for the end-to-end and security checks above.

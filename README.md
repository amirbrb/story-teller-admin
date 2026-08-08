# Storyteller Admin

Internal admin dashboard for [Storyteller](../story-teller) — user management, per-user AI token
usage, and platform analytics (signups, logins, AI spend). Shares Storyteller's Supabase project;
it does not run its own backend.

## Setup

1. Apply `story-teller/supabase/migrations/0012_admin.sql` to the same Supabase project the main
   app uses (it adds `profiles.is_admin`, admin RLS policies, `login_events`, and the `admin_*`
   RPCs/views this app depends on — see that file for details).
2. Bootstrap your own admin access — no signup flow exists here:
   ```sql
   update profiles set is_admin = true where id = '<your-auth-user-uuid>';
   ```
3. Copy `.env.example` to `.env` and fill in the **same** project's URL/anon key:
   ```
   VITE_SUPABASE_URL=
   VITE_SUPABASE_ANON_KEY=
   ```
4. `npm install && npm run dev`

## Scripts

- `npm run dev` — local dev server
- `npm run build` — typecheck (`tsc -b`) + production build
- `npm run typecheck` — typecheck only
- `npm run lint` — ESLint

## Structure

See `CLAUDE.md` for UI/data-access conventions. Short version: React + Vite + TypeScript,
react-router-dom, CSS Modules, Supabase JS client, no state-management or data-fetching library,
no chart library (hand-rolled SVG). Auth reuses story-teller's Supabase Auth (email/password +
Google), gated by `profiles.is_admin`.

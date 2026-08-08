# CLAUDE.md

Guidance for Claude Code (and humans) working on this repo's UI.

## Product framing

Storyteller Admin is an **internal ops tool** for the Storyteller team, not a consumer-facing
surface. It exists to let an operator look up a user, see what they've been doing (AI usage,
spend), fix their account state (grant tokens, toggle premium/admin), and watch the platform's
overall health (signups, logins, AI cost) at a glance. Favor density and scannability over
delight — tables are the primary UI primitive here, not cards. When a change is ambiguous, favor
the choice that gets an operator to the right row/number fastest.

## Visual direction: neutral admin

- This is deliberately **not** the story-teller consumer app's violet/coral "indie publishing"
  brand — it's a plain, functional admin theme (grays/blues). Don't import or reuse the sibling
  app's design tokens.
- Palette lives in `src/index.css` as CSS custom properties (`--color-*`). Primary is a
  utilitarian blue; there's no accent color and no display serif — system font stack only
  (`--font-body`), no `@fontsource` dependency.
- Both a light and dark palette are defined (`@media (prefers-color-scheme: dark)`). Any new color
  usage needs to work in both.
- Motion should be quick and functional (120–180ms ease) — this app doesn't need "nothing bouncy
  or slow" caveats because it should have essentially no decorative motion at all.

## Buttons, not hyperlinks

Same rule as the sibling app, and for the same reasons: every actionable element renders as a
**button** via the shared `Button` component (`src/components/Button.tsx`) — never a restyled bare
`<button>`/`<Link>`, never underlined inline text for an action. Variants: `primary`, `secondary`,
`ghost`, `danger`. The `is_admin` toggle in particular always renders `danger` with explicit
warning copy in its `ConfirmDialog` — it's the one action that can lock an operator out of their
own admin account (a DB-level self-demotion guard also blocks it, but the UI shouldn't invite the
attempt).

## Data access

- Never write to `profiles` or `token_transactions` directly from the client — every mutation
  (grant tokens, toggle premium, toggle admin) goes through the `admin_*` RPCs defined in
  `story-teller/supabase/migrations/0012_admin.sql` (`admin_grant_tokens`, `admin_set_premium`,
  `admin_set_admin`), wrapped by `src/lib/adminApi.ts`. Those RPCs check admin status themselves —
  don't treat a hidden/disabled button as the security boundary.
- Reads go through RLS-gated `select`s (`profiles`, `ai_call_log`, `token_transactions`,
  `login_events` all have an admin-read policy) or the `*_daily`/`ai_usage_by_*` analytics views —
  or `admin_list_users()` specifically when you need `auth.users.email`, which no view/select can
  reach directly.
- Every mutating action gets a `ConfirmDialog` before it fires — no bare click-to-mutate buttons.

## Auth

- Shares story-teller's Supabase project — same `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, same
  user pool, same login methods (email/password, Google OAuth). There is no signup screen here.
- Access is gated by `profiles.is_admin`, resolved by `useAdminSession` and enforced by
  `AdminRouteGuard`. A non-admin who successfully authenticates is signed out immediately and
  shown "not authorized" — but the real boundary is the RLS/RPC layer in the migration, not this
  client-side check, since any story-teller end-user can reach this app's login page with real
  credentials.
- No self-serve way to become an admin — an operator flips `profiles.is_admin` via SQL after
  deploy.

## Mobile

- Desktop-first (this is an internal tool used at a desk), but the sidebar should still collapse
  to a drawer below a reasonable breakpoint rather than breaking outright — don't ship something
  that's unusable on a phone in a pinch.

## Testing UI changes

- Same philosophy as the sibling app: reserve live browser verification for major changes (new
  pages, nav/layout restructuring, the login flow, or anything with a real mutation) and skip it
  for copy/text-only/column changes — reasoning about the diff plus a typecheck/build is enough
  there.

## Conventions to keep following

- Styling stays CSS Modules, one `*.module.css` per component/page, matching the
  `generateScopedName: '[name]__[local]'` setup in `vite.config.ts` — no Tailwind, no CSS-in-JS.
- `src/styles/common.module.css` is for truly cross-page primitives only (page container, card,
  error/muted text). Page-specific styling belongs in that page's own module.
- Keep using `@/` path imports, functional components, and `useEffect` + `.then` for Supabase
  reads (no React Query or other data-fetching library) — same pattern as the sibling app.
- No chart library — hand-roll SVG charts per the `dataviz` skill's guidance rather than adding a
  dependency for a handful of trend lines.

# Setlog

A mobile-first workout notebook at https://sarthak-ti.github.io/setlog/. React, TypeScript, Tailwind, Lucide, Supabase, IndexedDB, and a scoped offline service worker. No bodyweight tracking.

## One-time account setup

In Supabase project molwpkgekfvykaorgfyx, open Authentication → URL Configuration. Set Site URL to https://sarthak-ti.github.io/setlog/ and add that exact URL to Redirect URLs. The integration does not expose Auth configuration, so this dashboard step must be completed by the project owner.

Open Setlog, choose Create an account, use the email associated with your Supabase organization, and confirm the email. Supabase’s default mail service only sends to organization-member addresses; other recipients require a custom SMTP provider. Then sign in and add the app to your phone’s home screen. Your Setlog password is yours; do not share it with an assistant.

## Storage and sync

Every change saves to account-scoped IndexedDB first, with localStorage fallback. The cloud stores a private JSON notebook behind Supabase Auth and row-level security. Only a public publishable key is in the repository. No database password or service-role key belongs in the frontend.

Sync runs after edits, on reconnect, on returning to the app, and once a minute while open. Revision-checked writes prevent overwriting another device’s changes. Independent history/library/settings edits can merge. Conflicting active-workout or queue edits require an explicit choice; the other copy downloads first. The device-only notebook remains separate from signed-in accounts. JSON export/import transfers a notebook; CSV is a history export.

The service worker and manifest are scoped to /setlog/. They do not control the existing academic website. Open online once and wait for Settings to say the offline app is ready. The timer catches up after locking your phone, but background chime/vibration is browser-dependent.

## Daily compilation

A ChatGPT automation runs each morning around 8 a.m. America/New_York through the connected Supabase integration. It invokes public.compile_daily_workout_summary for the prior 14 calendar days, upserting one compact row per day to include late offline sync. Yesterday’s compilation appears in History and can be reported by the task. The automation requires the ChatGPT schedule and Supabase connection to remain enabled. Summaries are not full backups and do not guarantee that Supabase will never pause a free project or change its free plan.

The SQL schema is in supabase/001_notebooks.sql. It has already been applied. supabase/verify.sql checks owner isolation, anonymous denial, compare-and-swap rejection, summary permissions, New York day boundaries, and idempotent totals in a rolled-back transaction. It creates no lasting test accounts.

## Development and deployment

Use Node 24 and the pinned pnpm version. Run pnpm install --frozen-lockfile, pnpm test, pnpm build, and pnpm dev. Push main to run tests, build, and deploy through GitHub Pages. Production configuration is public/cloud-config.json; it accepts only a Supabase public URL and publishable key. The separate repository leaves Sarthak-Ti.github.io unchanged.

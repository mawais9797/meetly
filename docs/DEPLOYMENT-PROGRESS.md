# Meetly deployment progress

Updated 28 October 2026.

- GitHub repository: https://github.com/mawais9797/meetly, branch `main`. Initial upload was verified against local commit `c3a77ac`.
- Supabase project: `hdpscgbvfwypgskthijw`. The user ran `supabase/SETUP_NEW_PROJECT.sql`; their result screenshot showed 13 public tables, all 13 with row-level security, and zero administrators at initial setup.
- Public connection settings are saved locally in ignored `apps/web/.env.local` and `apps/mobile/.env`. They still need to be configured separately in Netlify before a connected deployment.
- Live checks on 26 October: Auth settings returned HTTP 200; email authentication and sign-up are enabled; email confirmation is required. An anonymous profile read returned HTTP 401.
- On 28 October 2026, after owner confirmation, the registered and verified owner account was promoted through the Supabase SQL Editor. The result returned exactly one administrator with Active status. No password was changed.
- Administrator assignment is complete. The single-administrator constraint remains enabled.
- The first release is now web-only: signup and role-specific user/admin dashboards share the main website. No APK is required. Native app-store release and mobile push are deferred.
- Netlify publication, SMTP configuration, email/reminder worker deployment, the pending Pakistan validation migration, and live end-to-end acceptance remain outstanding.
- The new web access checks passed locally. No test accounts or appointments were created in live Supabase during this change.

The database password, Supabase dashboard password, and Meetly administrator password are separate credentials. Do not store these passwords or a service-role key in the frontend or repository.

## Browser release cleanup — 27 October 2026

- Shared login and database-role routing were already implemented and retained.
- Removed the production preview switch and local sample-data fallback. Missing backend configuration now displays a setup message.
- Added owner-only instructions in SETUP.md and PROVISION_ADMIN.sql for assigning one verified, active account. The account-specific version was applied to the hosted database on 28 October 2026 after owner confirmation.
- Mobile improvements retain the approved purple design: wrapping, 44px touch controls, 16px mobile inputs, narrow-screen cards, and a scrollable menu.
- Focused validation: six web access checks passed; website type checking passed; local administrator SQL checks passed. Static renders of ten dashboard views at 320, 390, 768 and 1280px had no page-level horizontal overflow. These layout checks use synthetic data and do not replace live sign-in/booking acceptance or physical-device testing.
- The production Next.js build also passed after this cleanup.

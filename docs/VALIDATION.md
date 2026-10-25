# Local validation and release status

## Design update — 23 October 2026

See [the design update report](DESIGN-UPDATE-2026-10-23.md) for the violet/lavender redesign of web and native presentation. The 58-test suite, final TypeScript checks, production web build, and Android/iOS exports pass. Earlier responsive browser checks and screenshots are retained. Final visual rechecking after the last narrow Settings and contrast changes was blocked by browser URL policy; physical native-device checks remain unverified. Production integration limitations below still apply.

## Latest repair verification — 23 October 2026

See [the repair report](REPAIRS-2026-10-22.md). All six reported functional defects have been repaired, along with the mobile accessibility findings. The suite has **58 tests: 58 pass, zero fail**. Production web build, both native bundles and TypeScript checks pass. The LAN phone preview now supports customer submission and administrator approval without crashing. The UUID advisory is resolved; 15 high findings remain through two unpatched upstream packages.

**Local repairs verified; production release checks remain.** Apply the fourth SQL migration to an existing hosted installation. Live authentication, external delivery, physical device testing and real multi-client concurrency remain unverified. No hosted database has been changed. The earlier results below are historical.

## Verified on 18 October 2026

- The complete PRD was extracted and read, including all 23 sections and tables.
- Next.js production build passed, including TypeScript and static route generation.
- Mobile TypeScript checks passed with Expo SDK 58, React Native 0.88, and React 19.3.
- Android and iOS JavaScript/Hermes bundles compiled successfully. These are application bundles, not signed APK/IPA installers.
- 27 automated tests passed: 11 shared-domain checks and 16 embedded PostgreSQL checks.
- All three SQL migrations applied successfully to the embedded PostgreSQL test database.
- The notification worker passed strict TypeScript checking using a type-only Deno environment bridge. Live provider calls have not been exercised.
- The local website and account deletion page returned HTTP 200.
- Earlier browser inspection showed the dashboard at desktop and narrow widths and opened the appointment scheduling form. Past-time rejection was observed. Native date-field automation did not persist the chosen value; input-event compatibility was subsequently improved.

## Limits of the evidence

The final automated browser walkthrough was blocked by the browser URL security policy. No workaround was used. Browser verification is therefore incomplete, including final scheduling submission, downloads, and keyboard/screen-reader testing.

Database tests use PGlite with mocked Supabase Auth identities and real PostgreSQL constraints, RLS, functions, and roles. They exercise duplicate submissions, overlapping intervals, authorization, lifecycle transitions, reminder replacement, deletion, and receipt privacy. The embedded engine serializes queries; these tests do not replace simultaneous transactions from independent connections against deployed Supabase. Real multi-client races remain a release check.

The supplied environment has no configured production Supabase, SMTP/Resend, Expo project credentials, or Apple/Google signing credentials. Live authentication emails, notification delivery, production cron, device behavior, native signing, store release, backups, restore testing, and production monitoring remain unverified. See SETUP.md and RELEASE.md.

## Dependency advisories

The locked dependency tree reports **24 advisories: 9 moderate and 15 high**, with **zero critical** in the last audit. The JSON report is retained at `../dependency-audit.json`.

Several reported paths flow through the mobile build tools into `braces` and `node-forge`. Registry checks returned latest releases 3.0.3 and 1.4.0 respectively, which are still in the advisory ranges. Other moderate paths use older transitive `uuid` versions through ExcelJS and Xcode tooling. No forced downgrade to an old Expo or React Native major was applied. Review and resolve these advisories before public production release; a successful build is not a security clearance.

## How to reproduce

From the project folder:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run export --workspace @appointments/mobile -- --max-workers 2
```

Use `npm start` to serve the production website or `npm run dev` for development. External integration testing requires the configuration described in SETUP.md.

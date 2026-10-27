# Meetly Appointment Management System

Built from the complete 23-section Appointment Management System PRD v2.0 in this folder.

**Launch direction (27 October 2026): the first release is fully web based.** Users and administrators use the same website in desktop or mobile browsers. No APK, Expo app, or app-store installation is required. Native app work is deferred; see [docs/WEB-FIRST-LAUNCH.md](docs/WEB-FIRST-LAUNCH.md).

## Open the local website

1. Double-click **Start Appointment App.cmd** in this folder.
2. Open **http://127.0.0.1:3000** in your browser.
3. With Supabase configured, sign in with your existing account or choose **Create an account**. Regular users open **My appointment**; administrators open **Overview**.
4. Configure Supabase as described in `docs/SETUP.md`, then sign in. Both roles share the same login screen.

The website requires a configured Supabase backend. Missing settings show a setup message. Preview role switches and sample-data fallback have been removed.

## Project layout

| Folder | Purpose |
| --- | --- |
| `apps/web` | Responsive Next.js / TypeScript website with signup, user and administrator dashboards, and account deletion |
| `apps/mobile` | Expo / React Native Android and iOS application with user and administrator screens |
| `packages/core` | Shared types, PKT conversion, validation, reporting, and lifecycle rules |
| `supabase/migrations` | PostgreSQL schema, RLS, transactional operations, audit trail, notification queue |
| `supabase/functions` | Email, Expo push, and reminder delivery worker |
| `tests` | Domain and database acceptance checks |
| `docs` | Deployment instructions, PRD coverage, and release checklist |

## Development commands

Use Node.js 22.13+ within the 22.x series, or Node.js 24.3+ within the 24.x series. Dependencies are managed with npm workspaces. Run commands from this folder.

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run mobile
```

For a production website build: `npm run build`, then `npm start`.

## Connect the real system

Follow [docs/SETUP.md](docs/SETUP.md). For the web launch, you need a Supabase project and a configured email sender. Expo/native builds are deferred and are not a launch requirement. Only public Supabase keys belong in client environment files. Service credentials stay in Supabase Edge Function secrets.

The signed-in account’s database role selects its dashboard. Database row-level security and server functions enforce account ownership and administrator permissions. See `docs/SETUP.md` to assign the single administrator.

## Product decisions implemented

- One active Pending/Approved request per user, protected by a database partial unique index.
- A PostgreSQL sequence generates references; values are never reset or recycled and gaps are allowed.
- Approved intervals cannot overlap. Back-to-back bookings are allowed. An exclusion constraint protects concurrent approvals.
- All display times are PKT; stored timestamps are UTC.
- Users submit only subject and purpose and see only their current active appointment.
- Approval confirms immediately. Completion and No Show require explicit administrator actions.
- Rescheduling and approved cancellation are permitted only before the current start. Completion requires a start in the past; No Show allows exactly the start instant.
- Maximum duration defaults to 1,440 minutes and is configurable. Availability windows also constrain length.
- Retention defaults to 365 days and is configurable. Account deletion is blocked while an appointment is active or the configured retention period has not elapsed. The administrator must choose the appropriate policy before launch.
- Report date filters use **submission date in PKT**. Rates use Completed + No Show, excluding scheduled starts in the future. Zero denominator displays N/A.

See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for implementation mapping, [docs/VALIDATION.md](docs/VALIDATION.md) for verified results and limitations, and [docs/RELEASE.md](docs/RELEASE.md) for deployment-dependent checks. Local code/build checks alone do not establish the PRD's full release definition of done.

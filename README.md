# Meetly Appointment Management System

Built from the complete 23-section Appointment Management System PRD v2.0 in this folder.

## Open the local website

1. Double-click **Start Appointment App.cmd** in this folder.
2. Open **http://127.0.0.1:3000** in your browser.
3. Choose **Preview user view** at the top to try the user request flow. Switch back to the admin view to process it.

The website starts in a clearly labelled **local preview** when Supabase credentials are absent. It uses sample people and appointments, saves changes in your browser, and does not send emails or push notifications. This preview is for trying the interface; database security and concurrent booking protection require the connected backend.

## Project layout

| Folder | Purpose |
| --- | --- |
| `apps/web` | Next.js / TypeScript administrator dashboard and account deletion request page |
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

Follow [docs/SETUP.md](docs/SETUP.md). You will need a Supabase project, a verified sender for email, and an Expo project for native mobile builds and push delivery. Only public Supabase keys belong in client environment files. Service credentials stay in Supabase Edge Function secrets.

Do not publish the local preview as a production appointment service. Connecting Supabase removes the preview switch and enforces administrator authentication on the web dashboard.

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

# PRD implementation map

The source document contains 23 sections and all were read. The document supplies product requirements, not authorization to create external accounts or submit applications to app stores.

| PRD area | Implementation |
| --- | --- |
| Platforms and roles | Expo user/admin app; Next.js admin website; shared Supabase backend; privately provisioned single admin |
| AUTH-01–06 | Mandatory profile metadata, Auth email verification/reset/refresh, secure token storage on native devices, role/status validation, profile and email/password updates |
| REQ-01–08 | Subject/purpose limits, profile-derived contacts, immutable request content, sequence references, one-active unique index, pending persistence, current-only RLS |
| State model | `appointment_action` validates each action and current time under a row lock; no automatic completion; user/admin permissions differ |
| Approve/reject/cancel/reschedule | Complete schedules, required reasons, future-only edits/cancellation, manual Completed/No Show, history and notifications |
| Calendar rules | UTC storage, PKT validation, weekday windows, recurring/date-specific breaks, holidays/blocks, transactional exclusion constraint, back-to-back allowed |
| Meeting format | Physical address or validated HTTP(S) URL; meeting edits use reschedule flow, audit and notify |
| Calendar/search | Day, week, month on web/native; PKT labels; chronological day agenda; admin-only searchable history and combined filters |
| Communication | Immediate in-app events, email/push queue, versioned reminders, retries, idempotency keys, native push registration |
| Notification center | Unread count, read/unread, individual delete, confirmed Clear All; records and audits remain intact; appointment links gated by current access |
| User management | Suspend/reactivate, deletion request review, active-appointment and retention checks, de-identification and Auth removal, audit logging |
| Analytics | All status counters, daily/weekly/monthly request trends, format split, time-filtered rates, CSV/PDF on both clients and XLSX on web |
| Privacy/security | RLS on every table, no direct client writes, server-authorized functions, no client service key, minimized export fields, separate preview mode |
| Offline/errors | Explicit network state, mutation blocking, retry/refresh, idempotency key retained on failed request submission |
| Exclusions | No payments, priorities, attachments, account approval, direct admin creation, user history, admin notes, drag/drop, pending expiry, or automatic closure |

## Defaults selected from the PRD's open assumptions

- Rescheduling is allowed only before the existing start.
- Completion is allowed strictly after the start; No Show is allowed at or after it.
- Phone format is E.164 with no phone verification.
- Positive whole-minute durations; configurable maximum defaults to 1,440 minutes.
- Retention defaults to 365 days, editable by the administrator. Organization review is required before production.
- Reporting date filters use submission date in PKT. The UI labels this basis.
- Users receive in-app acknowledgement for cancellation; the admin receives all three channels.
- Terminal outcomes also create user notices, even though the appointment disappears from current appointments.

## Work requiring a deployed environment

The repository includes the application and deployment configuration. Production credentials, delivered email/push, physical device QA, signing, store submission, backups/restore testing, and monitoring require external services. These must not be represented as complete based only on local tests. See RELEASE.md and the validation report for exact evidence.

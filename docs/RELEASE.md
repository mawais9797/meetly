# Release checklist

The PRD defines done as acceptance on Android, iOS, and web with verified permissions, concurrency, reminders, exports, and store/privacy checks. Keep this checklist open until each item has real evidence.

## Functional acceptance in the connected environment

- [ ] Register a user with name, unique email, 8+ character password, and E.164 phone.
- [ ] Verify email; confirm unverified/suspended users cannot submit or access protected data.
- [ ] Test password recovery, expired/reused links, logout, refresh, and email-change verification.
- [ ] Submit and retry with the same idempotency key; receive one reference.
- [ ] Submit concurrently from two authenticated devices; only one active record may exist.
- [ ] Approve with complete future PKT schedule. Test bad duration, missing address, invalid URL, holiday, break, and non-working hours.
- [ ] Race two overlapping approvals; exactly one succeeds. Approve back-to-back times successfully.
- [ ] Race approval versus user cancellation; verify the losing operation returns the current-state error.
- [ ] Reject with reason; confirm a new user request can be submitted and history is admin-only.
- [ ] Test pre-start user/admin cancellation and required admin reason; reject at/after-start cancellation.
- [ ] Reschedule and change meeting format; verify event history, updated notices, old reminder invalidation.
- [ ] Confirm Completed/No Show remain manual, time-gated, and terminal.
- [ ] Change availability affecting confirmed meetings; preserve the bookings and review conflicts.
- [ ] Verify notification ownership, read state, individual deletion, and Clear All without touching audit/appointments.
- [ ] Suspend/reactivate; retain appointments. Request deletion via mobile and public website; enforce retention and de-identify after approval.
- [ ] Reconcile PDF/CSV/XLSX exports with filters, totals, PKT dates, and documented rate denominators.

## Delivery reliability

- [ ] Configure Auth SMTP and sender DNS; verify sign-up/reset messages.
- [ ] Deploy worker, configure secrets and cron, and verify event email/push/in-app content.
- [ ] Verify 24-hour/1-hour deadlines and short-notice omissions.
- [ ] Test queue retries and abandoned-lease recovery; monitor Failed jobs.
- [ ] Verify native Expo push receipts and device display on Android and iOS, including background/terminated app states.
- [ ] Verify revoked push permissions and unregistered device tokens; email still attempted.
- [ ] Validate provider-accepted reminders during simultaneous rescheduling and document the transport limitation.

## Deployment and store gates

- [ ] Production Supabase RLS/constraints checked against multiple real authenticated identities.
- [ ] Production website has HTTPS, valid Auth redirects, proper keys, and preview disabled.
- [ ] Physical Android/iOS builds signed and tested, with compatible SDK/OS versions.
- [ ] Screen reader, contrast, large font, keyboard, and touch target testing.
- [ ] Performance measured against PRD targets on stable internet.
- [ ] Privacy policy, support contact, retention approval, deletion URL, and store privacy disclosures published.
- [ ] Monitoring and delivery failure alerts configured; no sensitive request content in error logs.
- [ ] Backups enabled and restore drill recorded.
- [ ] Dependency/security audit reviewed and release artifacts archived.

No external accounts, production database, email provider, EAS builds, or app-store submissions are created automatically by the local project.

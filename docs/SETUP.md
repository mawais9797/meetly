# Connect and run Meetly

## 1. Create the shared backend

Create a Supabase project. Copy its project URL and **publishable/anon key** from the project settings. Keep the service role key private.

Apply the SQL migration files in filename order using the Supabase SQL editor, or install the Supabase CLI and run:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REFERENCE
supabase db push
```

The schema includes row-level security on all tables. Clients have read access only through RLS; mutations use validated database functions. There is no public route for selecting or changing roles.

### Updating an existing installation after the QA repairs

Apply `supabase/migrations/202610220004_qa_repairs.sql` after the first three migrations. It fixes account-deletion confirmation and delivery-data cleanup, exhausted job recovery, availability input validation, and meeting URL validation. It also removes retained delivery payloads for accounts already marked Deleted. These changes have been tested locally; no hosted database has been updated by this repair pass.

The new URL constraint protects new writes immediately. Review any older approved online appointments before validating existing rows:

```sql
select id, reference_number, meeting_url from public.appointments
where status = 'Approved' and meeting_type = 'Online'
  and not public.valid_meeting_url(meeting_url);
```

Correct affected meetings through the administrator workflow, then run:

```sql
alter table public.appointments validate constraint approved_online_url_valid;
```

Meeting links must use HTTP or HTTPS with a full ASCII/punycode domain or dotted IPv4 address, an optional valid port, and no credentials, whitespace, or backslashes.

## 2. Configure authentication

Enable email/password sign-in and **Confirm email**. Set the minimum password length to eight. Enable secure email changes and secure password changes. Configure a production SMTP provider for Auth emails; the notification worker's sender does not replace Auth SMTP.

Add these redirect URLs for local development:

- `http://127.0.0.1:3000`
- `http://localhost:3000`
- `meetly://auth`

Add your final website URL before deploying. The mobile client uses PKCE authorization code exchange. Use the standard Supabase confirmation/password-recovery templates with the configured redirect URL. Test expired and reused reset links before release. Adjust Auth rate limits in the dashboard to your deployment needs; appointment submissions also enforce ten successful requests per user per hour.

## 3. Provision the single administrator privately

1. Open the website, choose **Create account**, and register with the email and password you want to use as administrator.
2. Verify the email using the confirmation message.
3. Open `supabase/PROVISION_ADMIN.sql`, replace `REPLACE_WITH_YOUR_VERIFIED_EMAIL` with that account's email, and run the complete script privately in the Supabase SQL Editor.
4. Sign out of Meetly, then sign in again using the same email and password. The administrator dashboard opens automatically.

There are no default administrator credentials. The script rejects an unverified or inactive account and refuses to replace another administrator. The database's unique index prevents a second administrator. Never share your password or add a public role selector.

## 4. Connect the website

Copy `apps/web/.env.example` to `apps/web/.env.local`, then fill:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_KEY
```

Restart the web server. Both roles use the same login page: an administrator opens the management dashboard; a regular user opens My appointment. Missing backend settings show a setup message, never sample dashboards. The public `/delete-account` page accepts deletion requests, including suspended users.

For production, deploy `apps/web` as a Next.js application with workspace package access. Configure the same two public environment variables, HTTPS, Auth redirects, and your domain. Do not expose `.env.local` or service keys.

## 5. Connect the mobile application

Copy `apps/mobile/.env.example` to `apps/mobile/.env`. Set the same Supabase URL and public key. Create an Expo EAS project and put its project ID in `EXPO_PUBLIC_EAS_PROJECT_ID` and `apps/mobile/app.json` under `extra.eas.projectId`.

```sh
npm run mobile
```

The project targets Expo SDK 58 / React Native 0.88. Use a compatible Expo client or build a development client. Remote push requires physical devices and a native development/production build. Push is not treated as a prerequisite to account access; email and the in-app center remain available when permission is declined.

Before creating store builds, choose your own bundle identifier and Android package name in `app.json`, add app icons/splash assets, and configure Apple/Google signing credentials.

From `apps/mobile`:

```sh
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile production --platform ios
```

Build distribution, signing, and store submission require your own Expo, Apple, and Google accounts. They have not been provisioned by this project.

## 6. Enable email, push, and reminders

The database creates in-app event notices immediately and queues external email/push deliveries transactionally. Approval and rescheduling create 24-hour and 1-hour jobs only when those deadlines are still in the future. Schedule changes and terminal transitions invalidate queued reminder jobs.

1. Verify an email sender domain with Resend.
2. Set Edge Function secrets: `RESEND_API_KEY`, `EMAIL_FROM`, and a strong random `DELIVERY_CRON_SECRET`. If using Expo enhanced push security, also set `EXPO_ACCESS_TOKEN`.
3. Deploy the function:

```sh
supabase functions deploy deliver-notifications --no-verify-jwt
```

The function intentionally uses the custom `x-cron-secret` header rather than a user JWT. Requests without the matching secret are rejected. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function environment.

4. Enable `pg_cron`, `pg_net`, and Vault in Supabase. Add Vault secrets named `appointment_project_url` and `appointment_cron_secret`.
5. Run `supabase/schedule-reminders.sql` once. Do not create duplicate schedules. This runs the worker every minute.
6. Verify the cron runs, function logs, notification rows, and delivery jobs. Retry failed jobs only after resolving the cause and checking provider acceptance.

Jobs use a unique idempotency key, transactional claiming, ten-minute lease recovery, exponential retry, and a maximum of eight attempts. Resend receives the idempotency key. In-app reminder delivery is transactional and exactly once per job. Expo push does not provide a general exactly-once API: transport ambiguity after provider acceptance can produce a duplicate push. The foreground app suppresses repeated notification keys, but OS-rendered duplicate pushes cannot be fully prevented. A notification already accepted by an external provider cannot be recalled when an appointment is changed concurrently. The worker rechecks schedule versions immediately before dispatch and cancels stale queued work.

The worker stores Expo tickets, checks receipts after 15 minutes, disables unregistered tokens, and retries rate-limited deliveries. Unavailable receipts become Unknown after 24 hours. Per-device ticket tracking avoids resending previously accepted pushes during partial-batch retries. Check delivery jobs and push_receipts when monitoring failures. Receipt success indicates handoff to Apple/Google, not proof that a device displayed a notification. The implementation follows [Expo's delivery and receipt documentation](https://docs.expo.dev/push-notifications/sending-notifications/).

## 7. Set retention and review availability

The admin Settings screen configures maximum appointment duration and retention days. Retention defaults to 365 days as an implementation default, not a legal recommendation. The administrator must choose a policy appropriate to the organization. Deletion is blocked for active appointments and within the retention window; afterwards the Auth identity is removed, user content is scrubbed, and de-identified appointment/audit records remain.

Configure weekdays, working hours, date-specific or recurring breaks, holidays, and unavailable dates before approving requests. Web availability editing highlights affected future appointments. Existing appointments remain approved and require manual handling.

## Operational checks

- Configure database backups and complete a restore drill.
- Configure server/app error monitoring without recording passwords, auth tokens, or detailed meeting purposes.
- Alert on failed delivery jobs and missed cron runs.
- Verify TLS, redirect allowlists, Auth rate limits, email deliverability, and push receipts.
- Supply a published privacy policy, support contact, retention policy, and account deletion URL for store review.
- Run the release checklist on physical Android/iOS devices and the deployed website.

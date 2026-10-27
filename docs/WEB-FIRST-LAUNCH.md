# Meetly: web-first launch

Decision from the owner, 27 October 2026: launch the complete application on the web first. Both users and administrators access it through a browser link, including on phones. No APK or native app installation is required. This supersedes the original administrator-only website plan.

## Entry point

- Local website: http://127.0.0.1:3000/ (localhost:3000 also works).
- One sign-in page serves both account roles. Roles come from the database; registration cannot select or grant administrator access.
- New users choose **Create an account**, provide their name, Pakistan phone number, email and password, verify their email, then sign in.
- Existing users use the account they already created. The temporary port 3003 page is no longer needed for ordinary registration.
- Users open **My appointment**, **Notifications**, and **Settings**. They can request an appointment, view its current status and meeting details, cancel while permitted, manage notifications, update their profile and password, and request account deletion.
- Administrators retain the existing scheduling, availability, user management and reporting screens.

## Implementation and checks

The user dashboard uses the authenticated account ID rather than a demo user. User data reads include owner filters and avoid administrator-only tables. Existing database row-level security and transactional functions remain authoritative. Account changes clear the previous account's data, and late data responses cannot repopulate it after sign-out.

Verification for this change was limited to the website TypeScript check, six focused dashboard/access checks using local fixtures, and opening the signup page in the browser. Live signup, email delivery and an appointment lifecycle were not performed on the user's production data.

## Before publishing

Configure Netlify with the public Supabase environment variables. Configure the final website address in Supabase Auth's Site URL and Redirect URLs so confirmation, password recovery and email changes return to the website. Keep the local addresses in the redirect allowlist only while local development needs them.

Apply the pending database validation update, confirm the owner administrator account, configure production email delivery, and verify the real signup-to-approval journey before inviting users. Email and in-app notifications support the browser release; native push and APK/IPA distribution are deferred.

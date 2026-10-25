# Design update — 23 October 2026

The existing appointment app now uses the supplied BusGo reference as inspiration: violet and lavender, turquoise accents, soft gray backgrounds, rounded white cards, larger controls, and locally bundled Inter typography.

## Implemented

- Web: shared design tokens and component styling in `apps/web/app/design-system.css`, imported after the existing layout stylesheet. Updated navigation, dashboard, appointment request and detail screens, calendar, availability, users, reports, notifications, settings, and authentication/account-deletion presentation.
- Responsive web: purple header on phones, stacked request rows and forms, wrapping actions, touch-friendly controls, and narrow Settings layout correction.
- Native Android/iOS: corresponding tokens in `apps/mobile/src/theme.ts`, reusable UI components in `src/ui.tsx`, header/tab presentation updates, and a four-weight Inter font loader.
- Accessibility: visible focus states, reduced-motion styling, preserved semantic statuses and accessible control states. The five sampled text/background contrast pairs pass 4.5:1. The action gradient ends in a darker purple than the decorative lavender gradient so white text remains readable.
- Existing business logic, APIs, database schema, and appointment workflow are preserved by this design update. No hosting service was added.

## Verification and evidence

- Automated regression suite: **58 passed, zero failed**. See `design-2026-10-23/tests.txt`.
- Final workspace and notification-worker TypeScript checks: passed.
- Final production web build: passed. See `design-2026-10-23/web-build.txt`.
- Final Android and iOS exports: passed, with only four Inter font assets bundled. See `design-2026-10-23/mobile-build.txt`.
- Local production home page and account deletion route: HTTP 200. The Wi-Fi address also returned HTTP 200 from the host computer; this does not establish connectivity from a physical phone.
- Earlier browser review covered the eight management views at desktop and 320/768-pixel widths, plus the customer appointment and request form at 390 pixels. Customer cancellation and a synthetic request submission succeeded with local sample data.
- All measured admin views fit the page except Settings at 320 pixels, which exceeded the available width by nine pixels. A grid minimum-width and wrapping fix is applied. Its final browser recheck is **not completed**.
- Saved screenshots in `design-2026-10-23/` document the earlier review. They precede the final muted-text contrast and narrow Settings refinements.
- Final browser reacquisition was blocked by the browser URL security policy. No alternate browser-control workaround was used. Final keyboard and scheduling visual regression checks remain unverified.
- Native physical-device appearance and live authenticated flows have not been tested. Native exports are JavaScript/Hermes bundles, not signed APK/IPA installers.

## Preview

The current local server uses port 3000. Open `http://localhost:3000` on this computer, or `http://192.168.0.104:3000` on a phone connected to the same Wi-Fi. Select **Preview user view** in the preview bar to see the customer side.

The IP may change after reconnecting. The browser preview uses local sample data; email/push delivery and production integrations are not connected. The native app still requires its documented backend setup. This design work does not change the production-release limitations recorded in `VALIDATION.md` and the repair report.

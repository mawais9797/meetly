import type { Metadata } from 'next';
import './globals.css';
import './design-system.css';
export const metadata: Metadata = { title: 'Meetly — Appointment management', description: 'A thoughtful workspace for requests, schedules and appointments.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }

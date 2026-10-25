export const STATUSES = ['Pending', 'Approved', 'Completed', 'Rejected', 'Cancelled', 'No Show'] as const;
export type Status = typeof STATUSES[number];
export type MeetingType = 'Physical' | 'Online';
export type Profile = { user_id: string; full_name: string; email: string; phone: string; role: 'User' | 'Admin'; account_status: 'Active' | 'Suspended' | 'Deleted'; created_at: string };
export type Appointment = {
  id: string; reference_number: string; user_id: string; subject: string; purpose: string; status: Status;
  submitted_at: string; scheduled_start_utc: string | null; scheduled_end_utc: string | null;
  duration_minutes: number | null; meeting_type: MeetingType | null; physical_address: string | null;
  meeting_url: string | null; rejection_reason: string | null; cancellation_reason: string | null;
  closed_at: string | null; schedule_version?: number; profile?: Profile;
};
export type Schedule = { start: string; duration: number; meeting_type: MeetingType; location: string };
export type Availability = { weekday: number; is_workday: boolean; start_local: string; end_local: string };
export type Break = { id?: string; weekday: number | null; local_date: string | null; start_local: string; end_local: string };
export type BlockedDate = { id?: string; local_date: string; type: 'holiday' | 'unavailable'; description: string };
export type Notice = { id: string; recipient_id: string; appointment_id: string | null; event_type: string; title: string; message: string; read_at: string | null; created_at: string };
export type AppointmentEvent = { id: string; appointment_id: string; actor_id: string; event_type: string; old_value: unknown; new_value: unknown; occurred_at: string };
export type DeletionRequest = { id: string; user_id: string | null; email: string; reason: string; status: 'Pending' | 'Resolved'; created_at: string };
export const TZ = 'Asia/Karachi';
export const isActive = (status: Status) => status === 'Pending' || status === 'Approved';
export function pktDate(value: string | Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function pktTime(value: string | Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
export function displayDate(value: string | Date, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', ...options }).format(new Date(value));
}
export function displayTime(value: string | Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}
export function pktToUtc(date: string, time: string): string { return new Date(`${date}T${time}:00+05:00`).toISOString(); }
export function addDays(date: string, amount: number): string {
  const d = new Date(`${date}T12:00:00+05:00`); d.setUTCDate(d.getUTCDate() + amount); return pktDate(d);
}
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(aEnd) > Date.parse(bStart);
}
export function validateRequest(subject: string, purpose: string) {
  if (!subject.trim() || subject.trim().length > 150) throw new Error('Enter a subject of 1–150 characters.');
  if (!purpose.trim() || purpose.trim().length > 2000) throw new Error('Enter a detailed purpose of 1–2,000 characters.');
}
export function validatePhone(phone: string) { return /^\+[1-9]\d{7,14}$/.test(phone); }
export function isValidMeetingUrl(value: string): boolean {
  if (/[\s\x00-\x1f\x7f\\]/.test(value)) return false;
  const match = /^https?:\/\/((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?::([0-9]{1,5}))?([/?#].*)?$/i.exec(value);
  if (!match || match[1].length > 253 || (match[2] && Number(match[2]) > 65535)) return false;
  if (/^[0-9.]+$/.test(match[1])) {
    const parts = match[1].split('.');
    if (parts.length !== 4 || parts.some(part => part.length > 3 || Number(part) > 255 || (part.length > 1 && part.startsWith('0')))) return false;
  }
  return true;
}
export function validateSchedule(schedule: Schedule, rules: Availability[], breaks: Break[], blocks: BlockedDate[], appointments: Appointment[], ignoreId?: string, now = new Date()) {
  const start = new Date(schedule.start);
  if (!Number.isFinite(start.getTime()) || start <= now) throw new Error('Choose a future start time in PKT.');
  if (!Number.isInteger(schedule.duration) || schedule.duration < 1 || schedule.duration > 1440) throw new Error('Duration must be 1–1,440 minutes.');
  const end = new Date(start.getTime() + schedule.duration * 60000);
  if (!['Physical','Online'].includes(schedule.meeting_type)) throw new Error('Choose a meeting format.');
  if (!schedule.location.trim()) throw new Error('Enter the meeting location or URL.');
  if (schedule.meeting_type === 'Online') {
    if (!isValidMeetingUrl(schedule.location)) throw new Error('Enter a valid http or https meeting URL.');
  }
  const date = pktDate(start), weekday = new Date(`${date}T12:00:00+05:00`).getUTCDay();
  const rule = rules.find(r => r.weekday === weekday);
  if (!rule?.is_workday || pktDate(end) !== date || pktTime(start) < rule.start_local.slice(0,5) || pktTime(end) > rule.end_local.slice(0,5)) throw new Error('Appointment must fit within working hours.');
  if (blocks.some(b => b.local_date === date)) throw new Error('This date is marked unavailable.');
  if (breaks.some(b => (b.local_date === date || (!b.local_date && b.weekday === weekday)) && overlaps(start.toISOString(), end.toISOString(), pktToUtc(date, b.start_local.slice(0,5)), pktToUtc(date, b.end_local.slice(0,5))))) throw new Error('This time overlaps a scheduled break.');
  if (appointments.some(a => a.id !== ignoreId && a.status === 'Approved' && a.scheduled_start_utc && a.scheduled_end_utc && overlaps(schedule.start, end.toISOString(), a.scheduled_start_utc, a.scheduled_end_utc))) throw new Error('This time overlaps another approved appointment.');
  return end.toISOString();
}
export function canTransition(status: Status, action: string, role: 'User' | 'Admin', start: string | null, now = new Date()): boolean {
  const before = !!start && new Date(start) > now;
  if (role === 'User') return action === 'cancel' && (status === 'Pending' || (status === 'Approved' && before));
  if (status === 'Pending') return ['approve','reject'].includes(action);
  if (status !== 'Approved') return false;
  if (['reschedule','cancel'].includes(action)) return before;
  if (action === 'complete') return !!start && new Date(start) < now;
  return action === 'no_show' && !!start && new Date(start) <= now;
}
export function metrics(appointments: Appointment[], now = new Date()) {
  const counts = Object.fromEntries(STATUSES.map(s => [s, appointments.filter(a => a.status === s).length])) as Record<Status, number>;
  const closed = appointments.filter(a => a.scheduled_start_utc && new Date(a.scheduled_start_utc) <= now && ['Completed', 'No Show'].includes(a.status));
  const denominator = closed.length;
  return { counts, total: appointments.length, completionRate: denominator ? Math.round(100 * closed.filter(a => a.status === 'Completed').length / denominator) : null, noShowRate: denominator ? Math.round(100 * closed.filter(a => a.status === 'No Show').length / denominator) : null };
}
export function reminderDeadlines(start: string, now = new Date()): string[] { return [24,1].map(h => new Date(Date.parse(start)-h*3600000)).filter(d => d > now).map(d => d.toISOString()); }
export function filterAppointments(rows: Appointment[], filters: { search?: string; status?: string; from?: string; to?: string }) {
  const q = (filters.search || '').toLowerCase();
  return rows.filter(a => (!filters.status || filters.status === 'All' || a.status === filters.status) && (!filters.from || pktDate(a.submitted_at) >= filters.from) && (!filters.to || pktDate(a.submitted_at) <= filters.to) && (!q || [a.reference_number,a.subject,a.profile?.full_name,a.profile?.email,a.profile?.phone].some(v => v?.toLowerCase().includes(q)))).sort((a,b) => a.submitted_at.localeCompare(b.submitted_at));
}
export function exportRows(rows: Appointment[]) {
  return rows.map(a => ({ Reference: a.reference_number, Name: a.profile?.full_name || '', Subject: a.subject, Status: a.status, 'Submitted (PKT)': `${pktDate(a.submitted_at)} ${pktTime(a.submitted_at)}`, 'Start (PKT)': a.scheduled_start_utc ? `${pktDate(a.scheduled_start_utc)} ${pktTime(a.scheduled_start_utc)}` : '', 'Duration (min)': a.duration_minutes || '', Format: a.meeting_type || '' }));
}
export function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const safe = (v: unknown) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"','""')}"`; };
  return [Object.keys(rows[0]).map(safe).join(','), ...rows.map(r => Object.values(r).map(safe).join(','))].join('\r\n');
}

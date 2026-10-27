import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import type { Availability, Break, BlockedDate } from './index';

export const PHONE_HINT = 'Use a Pakistan mobile or landline number, e.g. 03001234567 or 02134567890.';
export function asciiDigits(value: string) { return value.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c <= '٩' ? 0x660 : 0x6f0))); }
export function isPhoneInput(value: string) { return value.length <= 32 && /^\+?[0-9 ()-]*$/.test(asciiDigits(value)); }
export function normalizePhone(value: string): string | null {
  const input = asciiDigits(value.trim());
  if (!isPhoneInput(input)) return null;
  const compact = input.replace(/[ ()-]/g, '');
  if (!/^(?:0|\+92|92)/.test(compact)) return null;
  const phone = parsePhoneNumberFromString(compact, { defaultCountry: 'PK', extract: false });
  return phone?.country === 'PK' && phone.isValid() && ['MOBILE','FIXED_LINE','FIXED_LINE_OR_MOBILE'].includes(phone.getType() || '') ? phone.number : null;
}
export function validatePhone(value: string) { return normalizePhone(value) !== null; }
export function nameError(value: string): string {
  const name = value.trim();
  if (!name) return 'Enter your full name.';
  if (name.length > 120) return 'Full name must be 120 characters or fewer.';
  if (!/\p{L}/u.test(name) || !/^[\p{L}\p{M} .’'\-]+$/u.test(name)) return 'Use letters, spaces, apostrophes or hyphens for your name.';
  return '';
}
export function emailError(value: string): string {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  if (email.length > 254 || !/^[^\s@<>"(),;:\\]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(email)) return 'Enter a valid email address, e.g. you@example.com.';
  const local = email.split('@')[0];
  return local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') ? 'Enter a valid email address, e.g. you@example.com.' : '';
}
export function passwordError(value: string): string {
  if (value.length < 8 || !value.trim()) return 'Use a password with at least 8 characters, not just spaces.';
  const bytes = Array.from(value).reduce((n, c) => { const p=c.codePointAt(0)!; return n+(p<128?1:p<2048?2:p<65536?3:4); },0);
  return value.includes('\0') || bytes > 72 ? 'Use a shorter password (maximum 72 UTF-8 bytes) without null characters.' : '';
}
export function validateProfile(name: string, phone: string) {
  const error=nameError(name); if(error) throw new Error(error);
  const normalized=normalizePhone(phone); if(!normalized) throw new Error(PHONE_HINT);
  return { name:name.trim(), phone:normalized };
}
export function validateEmail(email: string) { const error=emailError(email); if(error) throw new Error(error); return email.trim(); }
export function validatePassword(password: string, confirmation?: string) { const error=passwordError(password); if(error) throw new Error(error); if(confirmation!==undefined && password!==confirmation) throw new Error('The passwords do not match.'); }
export function isValidDate(date: string) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && !date.startsWith('0000') && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date; }
export function isValidTime(time: string) { return /^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(time); }
export function dateRangeError(from='',to='') { return (from&&!isValidDate(from))||(to&&!isValidDate(to)) ? 'Enter valid dates in YYYY-MM-DD format.' : from&&to&&from>to ? 'The end date must be on or after the start date.' : ''; }
export function validateReason(reason: string, required=false) { if(required&&!reason.trim()) throw new Error('Please enter a reason.'); if(reason.length>2000) throw new Error('Reason must be 2,000 characters or fewer.'); }
export function validateSettings(duration: number, retention: number) {
  if(!Number.isInteger(duration)||duration<1||duration>1440) throw new Error('Maximum duration must be a whole number from 1 to 1,440 minutes.');
  if(!Number.isInteger(retention)||retention<0||retention>2147483647) throw new Error('Retention must be a whole number from 0 to 2,147,483,647 days.');
}
export function validateAvailability(rules: Availability[], breaks: Break[], blocks: BlockedDate[]) {
  const day=(n: unknown)=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<=6;
  if(rules.length!==7||new Set(rules.map(r=>r.weekday)).size!==7||rules.some(r=>!day(r.weekday)||typeof r.is_workday!=='boolean')) throw new Error('Set working hours for all seven days, with no duplicate days.');
  for(const range of [...rules,...breaks]) if(!isValidTime(range.start_local)||!isValidTime(range.end_local)||range.start_local.slice(0,5)>=range.end_local.slice(0,5)) throw new Error('Use valid 24-hour times with the start earlier than the end.');
  for(const b of breaks) if(!((b.weekday===null&&!!b.local_date&&isValidDate(b.local_date))||(day(b.weekday)&&b.local_date===null))) throw new Error('Choose either a weekday or a valid date for each break.');
  for(const b of blocks) if(!isValidDate(b.local_date)||!['holiday','unavailable'].includes(b.type)||b.description.length>500) throw new Error('Use a valid blocked date and type, with a description of up to 500 characters.');
  if(new Set(blocks.map(b=>b.local_date)).size!==blocks.length) throw new Error('Each blocked date may only be added once.');
}

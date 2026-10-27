'use client';
import React, { useRef, useState } from 'react';
import { ArrowRight, CalendarDays, ShieldCheck } from 'lucide-react';
import { Appointment, displayDate, displayTime, isActive } from '@appointments/core';
import type { Data } from '../lib/data';
import { submitRequest } from '../lib/data';
import { newId } from '../lib/id';

type Props={data:Data;actor:string;verified:boolean;busy:boolean;open:(a:Appointment)=>void;run:(fn:()=>Promise<unknown>,success:string)=>Promise<boolean>;resendVerification:()=>Promise<void>};
export default function UserHome({data,actor,verified,busy,open,run,resendVerification}:Props){
 const [subject,setSubject]=useState(''),[purpose,setPurpose]=useState(''),[key,setKey]=useState(()=>newId()),[submitting,setSubmitting]=useState(false);
 const sending=useRef(false);
 const profile=data.profiles.find(p=>p.user_id===actor);
 const appointment=data.appointments.find(a=>a.user_id===actor&&isActive(a.status));
 if(profile?.account_status!=='Active')return <section className="panel settings-card"><h2>Account access unavailable</h2><p>Contact the administrator about your account.</p></section>;
 if(!verified)return <section className="panel settings-card"><h2>Verify your email</h2><p>Open the confirmation link sent to {profile.email} before requesting an appointment.</p><button className="primary" disabled={busy} onClick={()=>run(resendVerification,'Verification email requested. Check your inbox.')}>Resend verification email</button></section>;
 if(appointment)return <section className="panel current-card"><div className="current-icon"><CalendarDays size={28}/></div>
  <span className={`status status-${appointment.status.toLowerCase().replace(' ','-')}`}><i/>{appointment.status}</span>
  <h2>{appointment.subject}</h2><p>{appointment.status==='Pending'?'Your request is with the administrator. You’ll be notified when a decision is made.':'Your appointment is confirmed. We look forward to speaking with you.'}</p>
  <span className="reference-pill">{appointment.reference_number}</span>
  {appointment.scheduled_start_utc&&<><div className="current-date">{displayDate(appointment.scheduled_start_utc)} · {displayTime(appointment.scheduled_start_utc)} PKT</div><p>{appointment.duration_minutes} minutes · {appointment.meeting_type}</p></>}
  <button className="primary" onClick={()=>open(appointment)}>View appointment<ArrowRight size={16}/></button><small>You can have one active request at a time.</small>
 </section>;
 return <section className="panel new-request-card"><p className="eyebrow">LET’S START A CONVERSATION</p><h2>Hello, {profile.full_name.split(' ')[0]}.</h2><h3>Request an appointment</h3><p className="muted">Tell us what you’d like to discuss. The administrator will review your request and assign a time and meeting location.</p>
  <form onSubmit={async event=>{event.preventDefault();if(sending.current||busy)return;sending.current=true;setSubmitting(true);try{if(await run(()=>submitRequest(subject,purpose,key),'Appointment request submitted')){setSubject('');setPurpose('');setKey(newId());}}finally{sending.current=false;setSubmitting(false);}}}>
   <label>Meeting subject<input required maxLength={150} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="What would you like to discuss?"/><small>{subject.length}/150</small></label>
   <label>Detailed purpose<textarea required maxLength={2000} rows={6} value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="Share some context and what you hope to cover…"/><small>{purpose.length}/2,000</small></label>
   <div className="info-strip"><ShieldCheck size={18}/><span>Your name and contact information are included from your profile.</span></div>
   <button className="primary" disabled={busy||submitting}>{submitting?'Submitting…':'Submit request'}<ArrowRight size={16}/></button>
  </form>
 </section>;
}

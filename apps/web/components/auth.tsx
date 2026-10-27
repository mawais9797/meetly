'use client';
import { useState } from 'react';
import { emailError, nameError, passwordError, validateEmail, validatePassword, validateProfile } from '@appointments/core';
import { CalendarDays, ArrowRight, LockKeyhole } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import PhoneInput from './phone-input';

type Mode='login'|'register'|'verify'|'forgot'|'reset';
export default function Auth({recovery=false,onComplete}:{recovery?:boolean;onComplete:()=>void}) {
 const [mode,setMode]=useState<Mode>(recovery?'reset':'login'),[name,setName]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),[touched,setTouched]=useState<Record<string,boolean>>({});
 const newPassword=mode==='register'||mode==='reset';
 const title={login:'Welcome back.',register:'Create your account',verify:'Check your email',forgot:'Forgot your password?',reset:'Set a new password'}[mode];
 function changeMode(next:Mode){setMode(next);setMessage('');setFailed(false);setTouched({});setPassword('');setConfirmation('');}
 function touch(field:string){setTouched(t=>({...t,[field]:true}));}
 const errorText=(field:string)=>!touched[field]?'':field==='name'?nameError(name):field==='email'?emailError(email):field==='password'&&newPassword?passwordError(password):field==='confirmation'&&password!==confirmation?'The passwords do not match.':'';
 const inlineError=(field:string)=><small id={`${field}-error`} role="status">{errorText(field)}</small>;
 async function submit(event:React.FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);setMessage('');setFailed(false);setTouched({name:true,email:true,password:true,confirmation:true});
  try{
   const address=mode==='reset'?'':validateEmail(email);
   if(mode==='login'){
    const {error}=await supabase!.auth.signInWithPassword({email:address,password});
    if(error){if(error.code==='email_not_confirmed'){changeMode('verify');setMessage('Please verify your email before signing in. You can request a new link below.');return;}throw error;}
    onComplete();
   }else if(mode==='register'){
    const profile=validateProfile(name,phone);validatePassword(password,confirmation);
    const {error}=await supabase!.auth.signUp({email:address,password,options:{data:{full_name:profile.name,phone:profile.phone},emailRedirectTo:window.location.origin}});
    if(error)throw error;
    changeMode('verify');setMessage('Check your inbox for a verification link. If this email already has an account, sign in or reset your password.');
   }else if(mode==='verify'){
    const {error}=await supabase!.auth.resend({type:'signup',email:address,options:{emailRedirectTo:window.location.origin}});if(error)throw error;
    setMessage('If verification is needed, a new link will arrive by email. After verifying, return here and sign in.');
   }else if(mode==='forgot'){
    const {error}=await supabase!.auth.resetPasswordForEmail(address,{redirectTo:window.location.origin});if(error)throw error;
    setMessage('If an account exists, a password reset link will arrive by email.');
   }else{
    validatePassword(password,confirmation);const {error}=await supabase!.auth.updateUser({password});if(error)throw error;setPassword('');setConfirmation('');onComplete();
   }
  }catch(error){setFailed(true);setMessage(error instanceof Error?error.message:'Unable to complete this request.');}finally{setBusy(false);}
 }
 return <div className="auth-page"><div className="auth-brand"><div className="brand-mark"><CalendarDays size={25}/></div><span>meetly<span className="brand-dot">.</span></span></div>
  <div className="auth-card"><div className="icon-tile"><LockKeyhole/></div><p className="eyebrow">YOUR APPOINTMENT WORKSPACE</p><h1>{title}</h1>
   <p className="muted">{mode==='register'?'Request appointments and follow updates from any browser. No app download needed.':mode==='login'?'Sign in to your appointments. Administrators use this same sign-in page.':mode==='verify'?'Open the confirmation link in your inbox, then return to Meetly.':'Use your verified account email to securely recover access.'}</p>
   <form onSubmit={submit}>
    {mode==='register'&&<><label>Full name<input required maxLength={120} autoComplete="name" placeholder="e.g. Ayesha Khan" value={name} onChange={e=>setName(e.target.value)} onBlur={()=>touch('name')} aria-invalid={!!errorText('name')} aria-describedby="name-error"/>{inlineError('name')}</label><PhoneInput value={phone} onChange={setPhone}/></>}
    {mode!=='reset'&&<label>Email address<input type="email" required maxLength={254} autoComplete="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} onBlur={()=>touch('email')} aria-invalid={!!errorText('email')} aria-describedby="email-error"/>{inlineError('email')}</label>}
    {['login','register','reset'].includes(mode)&&<label>Password<input type="password" required minLength={newPassword?8:undefined} autoComplete={newPassword?'new-password':'current-password'} placeholder={newPassword?'Create a password (8+ characters)':'Enter your password'} value={password} onChange={e=>setPassword(e.target.value)} onBlur={()=>touch('password')} aria-invalid={!!errorText('password')} aria-describedby="password-error"/>{inlineError('password')}</label>}
    {newPassword&&<label>Confirm password<input type="password" required autoComplete="new-password" placeholder="Enter the same password again" value={confirmation} onChange={e=>setConfirmation(e.target.value)} onBlur={()=>touch('confirmation')} aria-invalid={!!errorText('confirmation')} aria-describedby="confirmation-error"/>{inlineError('confirmation')}</label>}
    {message&&<p role={failed?'alert':'status'} className="form-message">{message}</p>}
    <button disabled={busy} className="primary wide">{busy?'Please wait…':{login:'Sign in',register:'Create account',verify:'Resend verification email',forgot:'Send reset link',reset:'Update password'}[mode]}<ArrowRight size={17}/></button>
   </form>
   {mode==='login'?<><button className="secondary wide" disabled={busy} onClick={()=>changeMode('register')}>Create an account</button><button className="link-button" disabled={busy} onClick={()=>changeMode('forgot')}>Forgot password?</button></>:<button className="link-button" disabled={busy} onClick={()=>changeMode('login')}>Back to sign in</button>}
   <p className="small muted">Appointments, updates, and your profile—all in your browser.</p>
  </div><a href="/delete-account" className="muted small">Request account deletion</a>
 </div>;
}

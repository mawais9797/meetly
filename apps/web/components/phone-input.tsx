'use client';
import { useId, useState } from 'react';
import { asciiDigits, isPhoneInput, normalizePhone, PHONE_HINT } from '@appointments/core';

export default function PhoneInput({value,onChange}:{value:string;onChange:(value:string)=>void}) {
 const id=useId(),[error,setError]=useState(''),[touched,setTouched]=useState(false);
 return <label htmlFor={id}>Phone number
  <input id={id} type="tel" inputMode="tel" autoComplete="tel" required maxLength={32}
   placeholder="+923001234567" value={value} aria-invalid={!!error} aria-describedby={`${id}-hint ${id}-error`}
   onChange={e=>{const next=asciiDigits(e.target.value);if(!isPhoneInput(next)){setError('Phone numbers cannot contain letters.');return;}onChange(next);setError(touched&&!normalizePhone(next)?PHONE_HINT:'');}}
   onBlur={()=>{setTouched(true);setError(normalizePhone(value)?'':PHONE_HINT);}}/>
  <small id={`${id}-hint`}>Pakistan mobile or landline. Local, +92 and 0092 formats are accepted.</small>
  {error&&<small id={`${id}-error`} role="alert">{error}</small>}
 </label>;
}

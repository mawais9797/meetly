import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { emailError, nameError, passwordError, validateEmail, validatePassword, validateProfile, validatePhone, PHONE_HINT } from '@appointments/core';
import { supabase } from './client';
import { Button, Card, Field, PhoneField, Muted, Title, s } from './ui';

export default function Auth({recovery,complete}:{recovery:boolean;complete:()=>void}) {
 const [mode,setMode]=useState(recovery?'reset':'login'),[name,setName]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[touched,setTouched]=useState<Record<string,boolean>>({});
 const creating=mode==='register',newPassword=creating||mode==='reset';
 const errors:Record<string,string>={
  name:creating?nameError(name):'', phone:creating&&!validatePhone(phone)?PHONE_HINT:'',
  email:mode!=='reset'?emailError(email):'',
  password:newPassword?passwordError(password):mode==='login'&&!password?'Enter your password.':'',
  confirm:newPassword?(!confirm?'Confirm your password.':confirm!==password?'The passwords do not match.':''):''
 };
 const touch=(key:string)=>setTouched(t=>({...t,[key]:true}));
 function changeMode(next:string){setMode(next);setMessage('');setTouched({});setPassword('');setConfirm('');}
 async function submit(){
  setTouched({name:true,phone:true,email:true,password:true,confirm:true});setMessage('');setFailed(false);
  const first=Object.values(errors).find(Boolean);if(first){setFailed(true);setMessage(first);return;}
  setBusy(true);
  try{
   const address=mode==='reset'?'':validateEmail(email);
   if(creating){
    const profile=validateProfile(name,phone);validatePassword(password,confirm);
    const {error}=await supabase!.auth.signUp({email:address,password,options:{data:{full_name:profile.name,phone:profile.phone},emailRedirectTo:'meetly://auth'}});
    if(error)throw error;changeMode('verify');setMessage('Check your inbox for your verification link. Then return here to sign in.');
   }else if(mode==='login'){const {error}=await supabase!.auth.signInWithPassword({email:address,password});if(error)throw error;}
   else if(mode==='forgot'){const {error}=await supabase!.auth.resetPasswordForEmail(address,{redirectTo:'meetly://auth'});if(error)throw error;setMessage('If an account exists, a reset link will arrive by email.');}
   else if(mode==='verify'){const {error}=await supabase!.auth.resend({type:'signup',email:address,options:{emailRedirectTo:'meetly://auth'}});if(error)throw error;setMessage('If verification is needed, an email will arrive shortly.');}
   else{validatePassword(password,confirm);const {error}=await supabase!.auth.updateUser({password});if(error)throw error;setPassword('');setConfirm('');complete();}
  }catch(e){setFailed(true);setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <SafeAreaView style={s.container}><StatusBar style="dark"/><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={[s.content,{paddingTop:45}]} keyboardShouldPersistTaps="handled">
  <Text style={s.brand}>meetly.</Text><Muted>Make time for a meaningful conversation.</Muted><Card>
  <Title>{mode==='login'?'Welcome back':creating?'Create your account':mode==='verify'?'Verify your email':mode==='forgot'?'Reset your password':'Choose a new password'}</Title>
  {creating&&<><Muted>All fields are required.</Muted><Field label="Full name" placeholder="e.g. Ayesha Khan" value={name} onChangeText={setName} onBlur={()=>touch('name')} error={touched.name?errors.name:''} autoComplete="name" maxLength={120}/><PhoneField value={phone} onChangeText={setPhone}/>{touched.phone&&!!errors.phone&&<Text accessibilityRole="alert" style={s.error}>{errors.phone}</Text>}</>}
  {mode!=='reset'&&<Field label="Email address" placeholder="you@example.com" value={email} onChangeText={setEmail} onBlur={()=>touch('email')} error={touched.email?errors.email:''} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={254}/>}
  {['login','register','reset'].includes(mode)&&<Field label="Password" placeholder={newPassword?'Create a password (8+ characters)':'Enter your password'} value={password} onChangeText={setPassword} onBlur={()=>touch('password')} error={touched.password?errors.password:''} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={newPassword?'new-password':'current-password'}/>}
  {newPassword&&<Field label="Confirm password" placeholder="Enter the same password again" value={confirm} onChangeText={setConfirm} onBlur={()=>touch('confirm')} error={touched.confirm?errors.confirm:''} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password"/>}
  {!!message&&<Text accessibilityRole="alert" style={failed?s.error:s.success}>{message}</Text>}
  <Button disabled={busy} title={busy?'Please wait…':mode==='login'?'Sign in':creating?'Create account':mode==='verify'?'Resend verification':mode==='forgot'?'Send reset link':'Update password'} onPress={submit}/>
  {mode==='login'?<><Button title="Create an account" kind="secondary" disabled={busy} onPress={()=>changeMode('register')}/><Button title="Forgot password?" kind="secondary" disabled={busy} onPress={()=>changeMode('forgot')}/></>:<Button title="Back to sign in" kind="secondary" disabled={busy} onPress={()=>changeMode('login')}/>}
  </Card><Muted>All appointment times use Pakistan Standard Time (PKT). Administrator access is privately provisioned.</Muted>
 </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { Appointment, Profile, Availability, Break, BlockedDate, Notice, AppointmentEvent, DeletionRequest } from '@appointments/core';
const storage={
 async getItem(key:string){const count=Number(await SecureStore.getItemAsync(`${key}.count`)||0);if(!count)return null;const chunks=await Promise.all(Array.from({length:count},(_,i)=>SecureStore.getItemAsync(`${key}.${i}`)));return chunks.some(c=>c===null)?null:chunks.join('');},
 async setItem(key:string,value:string){const count=Math.ceil(value.length/1500),old=Number(await SecureStore.getItemAsync(`${key}.count`)||0);for(let i=0;i<count;i++)await SecureStore.setItemAsync(`${key}.${i}`,value.slice(i*1500,(i+1)*1500));await SecureStore.setItemAsync(`${key}.count`,String(count));for(let i=count;i<old;i++)await SecureStore.deleteItemAsync(`${key}.${i}`);},
 async removeItem(key:string){const count=Number(await SecureStore.getItemAsync(`${key}.count`)||0);await SecureStore.deleteItemAsync(`${key}.count`);await Promise.all(Array.from({length:count},(_,i)=>SecureStore.deleteItemAsync(`${key}.${i}`)));}
};
const url=process.env.EXPO_PUBLIC_SUPABASE_URL,key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const supabase=url&&key?createClient(url,key,{auth:{storage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,flowType:'pkce'}}):null;
if(supabase)AppState.addEventListener('change',state=>state==='active'?supabase.auth.startAutoRefresh():supabase.auth.stopAutoRefresh());
export async function rpc(name:string,args:Record<string,unknown>){if(!supabase)throw new Error('Connect the app to Supabase first.');const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data;}
export type MobileData={profile:Profile|null;appointments:Appointment[];profiles:Profile[];rules:Availability[];breaks:Break[];blocks:BlockedDate[];notifications:Notice[];events:AppointmentEvent[];deletions:DeletionRequest[];settings:{max_duration_minutes:number;retention_days:number}};
export async function loadData(userId:string):Promise<MobileData>{
 if(!supabase)throw new Error('Backend not configured');
 const all=async(table:string)=>{const out:any[]=[];for(let from=0;;from+=1000){const {data,error}=await supabase!.from(table).select('*').range(from,from+999);if(error)throw error;out.push(...(data||[]));if(!data||data.length<1000)return out;}};
 const profiles=await all('profiles'),profile=profiles.find(p=>p.user_id===userId)||null;
 if(!profile)return {profile:null,profiles:[],appointments:[],rules:[],breaks:[],blocks:[],notifications:[],events:[],deletions:[],settings:{max_duration_minutes:1440,retention_days:365}};
 const [appointments,notifications]=await Promise.all([all('appointments'),all('notifications')]);
 const [rules,breaks,blocks,events,deletions,settings]=profile.role==='Admin'?await Promise.all(['availability_rules','availability_breaks','blocked_dates','appointment_events','deletion_requests','system_settings'].map(all)):[[],[],[],[],[],[]];
 return {profile,profiles,appointments:appointments.map(a=>({...a,profile:profiles.find(p=>p.user_id===a.user_id)})),notifications,rules,breaks,blocks,events,deletions,settings:settings[0]||{max_duration_minutes:1440,retention_days:365}};
}

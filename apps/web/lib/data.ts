import { loadWorkspaceData } from './connected-data';
import { Appointment, AppointmentEvent, Availability, BlockedDate, Break, DeletionRequest, Notice, Profile, Schedule, validateRequest, validateProfile, validateReason, validateSettings, validateAvailability } from '@appointments/core';
import { supabase } from './supabase';
export type Data = { profiles: Profile[]; appointments: Appointment[]; rules: Availability[]; breaks: Break[]; blocks: BlockedDate[]; notifications: Notice[]; events: AppointmentEvent[]; deletions: DeletionRequest[]; settings: { max_duration_minutes: number; retention_days: number } };
export async function fetchData(userId?:string): Promise<Data> {
 if(!supabase) throw new Error('Meetly is not connected yet. Please contact the application owner.');
 if(!userId) throw new Error('Sign in to open your workspace.');
 return loadWorkspaceData(supabase,userId);
}
export async function rpc(name:string,args:Record<string,unknown>) {
 if(!supabase) throw new Error('Meetly is not connected yet. Please contact the application owner.');
 const {data,error}=await supabase.rpc(name,args);
 if(error) throw new Error(error.message);
 return data;
}
export async function appointmentAction(id:string,action:string,reason:string,schedule?:Schedule) {
 validateReason(reason,action==='reject');
 return rpc('appointment_action',{p_id:id,p_action:action,p_reason:reason||null,p_start:schedule?.start||null,p_duration:schedule?.duration||null,p_type:schedule?.meeting_type||null,p_location:schedule?.location||null});
}
export async function submitRequest(subject:string,purpose:string,key:string) {
 validateRequest(subject,purpose);
 return rpc('create_appointment',{p_subject:subject,p_purpose:purpose,p_request_key:key});
}
export async function notificationAction(action:string,id?:string) {
 return rpc('notification_action',{p_action:action,p_id:id||null});
}
export async function saveAvailability(rules:Availability[],breaks:Break[],blocks:BlockedDate[]) {
 validateAvailability(rules,breaks,blocks);
 return rpc('save_availability',{p_rules:rules,p_breaks:breaks,p_blocks:blocks});
}
export async function userAction(id:string,status:string,confirmation='') {
 return status==='Deleted'?rpc('admin_delete_user',{p_user:id,p_confirmation:confirmation}):rpc('admin_user_status',{p_user:id,p_status:status});
}
export async function saveProfile(name:string,phone:string) {
 const valid=validateProfile(name,phone);
 return rpc('update_profile',{p_name:valid.name,p_phone:valid.phone});
}
export async function requestDeletion(reason:string) {
 validateReason(reason);return rpc('request_deletion',{p_reason:reason});
}
export async function saveSettings(duration:number,retention:number) {
 validateSettings(duration,retention);return rpc('save_settings',{p_duration:duration,p_retention:retention});
}

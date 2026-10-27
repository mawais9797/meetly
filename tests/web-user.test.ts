import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Appointment, Profile } from '../packages/core/src/index';
import type { Data } from '../apps/web/lib/data';
import { loadWorkspaceData } from '../apps/web/lib/connected-data';
import { workspaceView, type WorkspaceView } from '../apps/web/lib/workspace-access';
import UserHome from '../apps/web/components/user-home';

const profile:Profile={user_id:'real-user',full_name:'Ayesha Khan',email:'test@example.com',phone:'+923001234567',role:'User',account_status:'Active',created_at:'2026-10-27T00:00:00Z'};
const appointment:Appointment={id:'request-one',reference_number:'APT-100',user_id:profile.user_id,subject:'My real request',purpose:'A meeting',status:'Pending',submitted_at:'2026-10-27T00:00:00Z',scheduled_start_utc:null,scheduled_end_utc:null,duration_minutes:null,meeting_type:null,physical_address:null,meeting_url:null,rejection_reason:null,cancellation_reason:null,closed_at:null};
function fakeClient(owner:Profile|null=profile){
 const calls:{table:string;filters:Record<string,string>}[]=[];
 const client={from(table:string){const call={table,filters:{} as Record<string,string>};calls.push(call);const query={select(){return query;},eq(key:string,value:string){call.filters[key]=value;return query;},order(){return query;},async maybeSingle(){return {data:owner,error:null};},async range(){return {data:table==='profiles'?[owner]:table==='appointments'?[appointment]:[],error:null};}};return query;}};
 return {client:client as unknown as SupabaseClient,calls};
}
test('web user: admin screens resolve to the user appointment page; shared screens remain available',()=>{
 for(const view of ['Overview','Requests','Calendar','Availability','Users','Reports'] as WorkspaceView[]) assert.equal(workspaceView(view,'User'),'My appointment');
 for(const view of ['My appointment','Notifications','Settings'] as WorkspaceView[]) assert.equal(workspaceView(view,'User'),view);
 assert.equal(workspaceView('Users','Admin'),'Users');assert.equal(workspaceView('My appointment','Admin'),'Overview');
});
test('web user: real account reads only its own profile, appointments and notifications',async()=>{
 const {client,calls}=fakeClient();const data=await loadWorkspaceData(client,profile.user_id);
 assert.deepEqual(calls.map(c=>c.table),['profiles','appointments','notifications']);
 assert.deepEqual(calls.map(c=>c.filters),[{user_id:profile.user_id},{user_id:profile.user_id},{recipient_id:profile.user_id}]);
 assert.equal(data.appointments[0].profile?.user_id,profile.user_id);assert.equal(data.rules.length,0);assert.equal(data.events.length,0);
});
test('web user: suspended or missing profiles cannot load workspace data',async()=>{
 for(const owner of [null,{...profile,account_status:'Suspended' as const}]){
  const {client,calls}=fakeClient(owner);const data=await loadWorkspaceData(client,profile.user_id);
  assert.equal(calls.length,1);assert.equal(data.appointments.length,0);
 }
});
test('web user: administrators retain management reads and private notification scope',async()=>{
 const {client,calls}=fakeClient({...profile,role:'Admin'});await loadWorkspaceData(client,profile.user_id);
 for(const table of ['availability_rules','availability_breaks','blocked_dates','appointment_events','deletion_requests','system_settings'])assert.ok(calls.some(c=>c.table===table));
 assert.deepEqual(calls.find(c=>c.table==='notifications')!.filters,{recipient_id:profile.user_id});
});
function markup(appointments:Appointment[],verified=true){
 const data:Data={profiles:[profile],appointments,rules:[],breaks:[],blocks:[],events:[],notifications:[],deletions:[],settings:{max_duration_minutes:1440,retention_days:365}};
 return renderToStaticMarkup(React.createElement(UserHome,{data,actor:profile.user_id,verified,busy:false,open:()=>{},run:async()=>true,resendVerification:async()=>{}}));
}
test('web user: dashboard displays the signed-in user request, never demo or another user data',()=>{
 const html=markup([{...appointment,id:'other',user_id:'preview-user',subject:'OTHER USER SECRET'},appointment]);
 assert.ok(html.includes('My real request'));assert.ok(html.includes('APT-100'));assert.ok(!html.includes('OTHER USER SECRET'));assert.ok(!html.includes('Submit request'));
});
test('web user: new requests and email verification have usable browser screens',()=>{
 const ready=markup([]);assert.ok(ready.includes('Request an appointment'));assert.ok(ready.includes('Submit request'));assert.ok(!ready.includes('mobile app'));
 const pending=markup([],false);assert.ok(pending.includes('Verify your email'));assert.ok(pending.includes('Resend verification email'));assert.ok(!pending.includes('Submit request'));
});

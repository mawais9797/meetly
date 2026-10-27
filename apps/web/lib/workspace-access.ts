import type { Profile } from '@appointments/core';

export type WorkspaceView = 'Overview'|'Requests'|'Calendar'|'Availability'|'Users'|'Reports'|'Notifications'|'Settings'|'My appointment';
export function workspaceView(requested: WorkspaceView, role: Profile['role']): WorkspaceView {
 if(role==='Admin') return requested==='My appointment'?'Overview':requested;
 return ['My appointment','Notifications','Settings'].includes(requested)?requested:'My appointment';
}

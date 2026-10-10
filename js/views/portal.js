import {escapeHtml} from '../security.js';
import {showToast} from '../ui.js';
const e=escapeHtml;
const titles={student:'Student Portal',authority:'Authority Portal',admin:'Administrator Portal'};
const categories=['Ragging & Physical Intimidation','Physical Violence & Assault','Sexual Harassment & Coercion','Hostel Harassment & Bullying','Laboratory Safety & Coercion','Cyber Harassment & Digital Abuse','Academic Bias & Retaliation','General Campus Grievance','Other Campus Grievance'];
const statuses=['In Review','Under Investigation','Action Taken','Resolved'];
const verification=['Identity Verified','Evidence Pending','Under Review','Additional Information Requested','Findings Recorded','Resolved'];
async function api(path,method='GET',body) {
 const response=await fetch('/api/'+path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 let result;try{result=await response.json();}catch{throw Error('Authenticated portals require the Node backend; the static demo remains available.');}
 if(!response.ok)throw Object.assign(Error(result.error||'Request failed'),{status:response.status});
 return result;
}
export function renderPortalView(explicitPortal) {
 const raw = explicitPortal || location.hash.slice(1).replace(/^#/, '');
 const portal = ['student', 'authority', 'admin'].includes(raw) ? raw : (raw === 'dashboard' ? 'authority' : 'student');
 return '<div class="portal-root" data-portal="'+e(portal)+'"><div class="section-header"><p class="portal-kicker">ACCOUNT ACCESS / '+e(portal.toUpperCase())+'</p><h1 class="section-title">'+e(titles[portal])+'</h1><p class="section-subtitle">Google verifies identity. Institutional staff permissions are approved separately.</p></div><div id="portal-content" aria-live="polite"><p>Checking backend availability…</p></div></div>';
}
export async function initPortalView(explicitPortal) {
 const root=document.querySelector('.portal-root');if(!root)return;
 const raw = explicitPortal || root.dataset.portal || location.hash.slice(1).replace(/^#/, '');
 const portal = ['student', 'authority', 'admin'].includes(raw) ? raw : (raw === 'dashboard' ? 'authority' : 'student');
 const content=root.querySelector('#portal-content');
 const update=html=>{if(root.isConnected)content.innerHTML=html;};
 try {
  const config=await api('config');if(!root.isConnected)return;
  if(!config.ready || !config.configured){update('<div class="card"><h2>Backend setup required</h2><p>Database and Google sign-in configuration are required before production portals can operate. Please verify environment configuration.</p></div>');return;}
  let user;
  try{user=(await api('me')).user;}catch(error){if(error.status!==401)throw error;}
  if(!user) {
   update('<div class="card portal-login"><p class="portal-kicker">'+e(portal.toUpperCase())+' SIGN IN</p><h2>'+e(titles[portal])+'</h2><p>Continue with Google. '+(portal==='student'?'Your reports belong to your signed-in account.':portal==='authority'?'Only approved HOD, Dean and Higher Authority accounts can enter.':'Administrator access requires a trusted server-side assignment.')+'</p><div id="google-signin"></div><p id="login-message" role="status"></p></div>');
   const challenge=await api('auth/challenge','POST',{});
   if(!window.google?.accounts?.id) await new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
    script.onload=resolve;script.onerror=()=>reject(Error('Google sign-in could not load.'));document.head.append(script);
   });
   if(!root.isConnected)return;
   const clientId = challenge.clientId || config.googleClientId;
   google.accounts.id.initialize({client_id:clientId,nonce:challenge.nonce,auto_select:false,callback:async response=>{
    try{await api('auth/google','POST',{credential:response.credential});if(root.isConnected)initPortalView(portal);}
    catch(error){if(root.isConnected)root.querySelector('#login-message').textContent=error.message;}
   }});
   google.accounts.id.renderButton(root.querySelector('#google-signin'),{theme:'filled_black',size:'large',text:'signin_with',width:280});
   return;
  }
  const allowed=portal==='student'?user.role==='student':portal==='admin'?user.role==='admin':['HOD','Dean','Higher Authority'].includes(user.role);
  const header='<div class="card portal-account"><div><strong>'+e(user.name)+'</strong><p>'+e(user.email)+' · '+e(user.role)+' · '+e(user.department||'Department not set')+'</p></div><button class="btn btn-secondary" id="portal-logout">Sign out</button></div>';
  if(!allowed){update(header+'<div class="alert alert-danger" style="margin-top:16px;"><strong>Access Denied:</strong> This account ('+e(user.role)+') does not have access to the '+e(titles[portal])+'. Institutional staff permissions are approved separately by an administrator.'+(user.role==='student'?' Students may request staff approval in their <a href="#student">Student Profile</a>.':'')+'</div>');}
  else if(portal==='admin') {
   const {users}=await api('admin/users'),{logs}=await api('admin/audit');
   update(header+'<h2>Account approvals</h2><p>Administrator grants are available only through the trusted bootstrap command.</p><div class="portal-cases">'+users.filter(u=>u.role!=='admin').map(u=>'<form class="card admin-role-form" data-id="'+e(u.id)+'"><h3>'+e(u.name)+'</h3><p>'+e(u.email)+(u.staff_requested?' · Staff approval requested':'')+'</p><label>Department<input class="form-input" name="department" value="'+e(u.department)+'" required></label><label>Approved role<select class="form-select" name="role">'+['student','HOD','Dean','Higher Authority'].map(r=>'<option'+(u.role===r?' selected':'')+'>'+e(r)+'</option>').join('')+'</select></label><label>Account status<select class="form-select" name="account_status"><option>active</option><option'+(u.account_status==='suspended'?' selected':'')+'>suspended</option></select></label><button class="btn btn-primary">Save approval</button></form>').join('')+'</div><h2>Audit records</h2><div class="card">'+logs.map(log=>'<p>'+e(log.timestamp)+' · '+e(log.action)+'</p>').join('')+'</div>');
   root.querySelectorAll('.admin-role-form').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();try{const body=Object.fromEntries(new FormData(form));body.userId=form.dataset.id;await api('admin/roles','PATCH',body);initPortalView(portal);}catch(error){showToast(error.message,'error');}
   }));
  } else {
   const {complaints}=await api('complaints');
   const intakeWarning=(portal==='student'&&!config.intakeEnabled)?'<div class="alert alert-warning" style="margin-bottom:16px;"><strong>Intake Notice:</strong> Live incident reporting is currently paused pending verification (LIVE_INTAKE_ENABLED=false). You can manage your department profile and view existing case records below.</div>':'';
   const profile=portal==='student'?'<form id="portal-profile" class="card"><h2>Student profile</h2><label>Department<input class="form-input" name="department" required maxlength="120" value="'+e(user.department)+'"></label><label><input type="checkbox" name="staff_requested" '+(user.staff_requested?'checked':'')+'> Request staff approval (does not grant permissions)</label><button class="btn btn-secondary">Save profile</button></form>':'';
   const report=portal==='student'?(intakeWarning+'<form id="portal-report" class="card"><h2>Submit a complaint</h2><p>Anonymous mode hides your display identity from staff; this authenticated report remains linked to your account in the database. Private evidence upload is not available yet.</p><label>Category<select class="form-select" name="category">'+categories.map(c=>'<option>'+e(c)+'</option>').join('')+'</select></label><label>Factual description<textarea class="form-textarea" name="description" minlength="20" maxlength="10000" required></textarea></label><label>Identity display<select name="identityMode" class="form-select"><option value="anonymous">Anonymous display</option><option value="confidential">Confidential display</option><option value="standard">Standard</option></select></label><label>Link to your previous report<select name="linkedComplaintId" class="form-select"><option value="">New case</option>'+complaints.map(c=>'<option value="'+e(c.id)+'">'+e(c.reference_id)+'</option>').join('')+'</select></label><label><input name="immediateDanger" type="checkbox"> Immediate danger</label><label><input name="physicalThreat" type="checkbox"> Physical threat</label><p>For immediate danger, contact local emergency services directly. This portal does not dispatch assistance.</p><button class="btn btn-primary" ' + (!config.intakeEnabled ? 'title="Intake temporarily paused"' : '') + '>Submit account report</button></form>'):'';
   update(header+'<div class="portal-profile-grid">'+profile+report+'</div><h2>'+ (portal==='student'?'My private reports':'Assigned cases')+'</h2><p>Google identity verification does not establish evidence authenticity or substantiate an allegation.</p><div class="portal-cases">'+(complaints.length===0?'<div class="card"><p>No records found.</p></div>':complaints.map(c=>'<article class="card"><h3>'+e(c.reference_id)+'</h3><p>'+e(c.category)+'</p><p>'+e(c.description)+'</p><p><strong>'+e(c.status)+'</strong> · '+e(c.severity)+' · '+e(c.assigned_authority)+'</p><p>Verification: '+e(c.verification_status)+'<br>Identity: '+e(c.identity_status)+'<br>Evidence: '+e(c.evidence_status)+'<br>Allegation: '+e(c.allegation_status)+'</p>'+(portal==='authority'?'<details><summary>Authority actions</summary><form class="portal-action" data-id="'+e(c.id)+'"><label>Action<select class="form-select" name="action"><option value="status">Case status</option><option value="routing">Authority routing</option><option value="verification">Human verification</option></select></label><label>Next status / tier<select class="form-select" name="value">'+[...statuses,...['HOD','Dean','Higher Authority'],...verification].map(v=>'<option>'+e(v)+'</option>').join('')+'</select></label><label>Human finding (verification only)<select name="finding" class="form-select"><option value="">No allegation finding</option><option>Substantiated</option><option>Not Substantiated</option><option>Inconclusive</option></select></label><label>Internal supporting reasons<textarea name="notes" class="form-textarea" minlength="15" required></textarea></label><button class="btn btn-primary">Record authorized action</button></form></details>':'')+'</article>').join(''))+'</div>');
   root.querySelector('#portal-profile')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;
    try{await api('me','PATCH',{department:form.department.value,staff_requested:form.staff_requested.checked});initPortalView(portal);}catch(error){showToast(error.message,'error');}
   });
   root.querySelector('#portal-report')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,body=Object.fromEntries(new FormData(form));
    body.riskFlags={immediateDanger:form.immediateDanger.checked,physicalThreat:form.physicalThreat.checked};delete body.immediateDanger;delete body.physicalThreat;
    if(!body.linkedComplaintId)delete body.linkedComplaintId;
    try{await api('complaints','POST',body);showToast('Account report saved.','success');initPortalView(portal);}catch(error){showToast(error.message,'error');}
   });
   root.querySelectorAll('.portal-action').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();const action=form.elements.namedItem('action').value,value=form.elements.namedItem('value').value,body={notes:form.notes.value};
    if(action==='status')body.status=value;if(action==='routing')body.targetTier=value;
    if(action==='verification'){body.verification_status=value;if(form.finding.value)body.allegation_status=form.finding.value;}
    try{await api('complaints/'+form.dataset.id+'/'+action,'PATCH',body);initPortalView(portal);}catch(error){showToast(error.message,'error');}
   }));
  }
  root.querySelector('#portal-logout')?.addEventListener('click',async()=>{try{await api('auth/logout','POST',{});initPortalView(portal);}catch(error){showToast(error.message,'error');}});
 }catch(error){update('<div class="card"><h2>Portal unavailable</h2><p>'+e(error.message)+'</p></div>');}
}

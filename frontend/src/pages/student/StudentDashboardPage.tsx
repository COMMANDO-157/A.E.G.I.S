import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { Dialog } from '@/components/ui/Dialog';
import { getStudentVerificationStatus, submitStudentVerificationRequest, getConfig } from '@/api/client';
import type { StudentVerificationStatusResponse } from '@/api/types';
import { intakeState, type IntakeState } from '@/utils/intake';

export default function StudentDashboardPage() {
 const {user,refreshUser}=useAuth(); const {t}=useLocale(); const p=t.phase1;
 const [status,setStatus]=useState<StudentVerificationStatusResponse|null>(null);
 const [intake,setIntake]=useState<IntakeState>('loading');
 const [statusLoading,setStatusLoading]=useState(true); const [attempt,setAttempt]=useState(0);
 const [open,setOpen]=useState(false); const [reg,setReg]=useState(''); const [notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null); const [message,setMessage]=useState<string|null>(null);
 useEffect(()=>{let active=true;setIntake('loading');setStatusLoading(true);setStatus(null);
  void getConfig().then(c=>{if(active)setIntake(intakeState(c));}).catch(()=>{if(active)setIntake('unavailable');});
  void getStudentVerificationStatus().then(s=>{if(active)setStatus(s);}).catch(()=>{}).finally(()=>{if(active)setStatusLoading(false);});
  return ()=>{active=false;};
 },[user?.id,attempt]);
 async function submit(e:React.FormEvent){e.preventDefault();setError(null);setMessage(null);
  if(!/^[A-Za-z0-9]{6,30}$/.test(reg.trim())){setError(p.invalidReg);return;}
  setBusy(true);try{const result=await submitStudentVerificationRequest({registerNumber:reg.trim(),notes:notes.trim()||undefined});
   setMessage(result.status==='APPROVED'?p.claimApproved:p.claimSent);setOpen(false);setReg('');setNotes('');await refreshUser();setAttempt(n=>n+1);
  }catch{setError(p.error);}finally{setBusy(false);}
 }
 const pending=status?.activeRequest?.status==='PENDING';
 const stateText={loading:p.intakeLoading,enabled:p.intakeEnabled,disabled:p.intakeDisabled,unknown:p.intakeUnknown,unavailable:p.intakeUnavailable}[intake];
 return <div className="container" style={{display:'grid',gap:'var(--spacing-6)'}}>
  <section className="card"><h1>{t.student.welcomeBack}, {user?.name}</h1>
   <p>{p.profile}: {user?.department || p.department}</p>
   <p>{p.verification}: {statusLoading?p.busy:!status?p.statusUnavailable:status.isVerified?p.verified:pending?p.pending:p.unverified}</p>
   <p>{p.claimHelp}</p>
   {!statusLoading && !status && <button className="btn btn-secondary" onClick={()=>setAttempt(n=>n+1)}>{p.retry}</button>}
   {status && !status.isVerified && !pending && <button className="btn btn-primary" onClick={()=>{setError(null);setOpen(true);}}>{p.verify}</button>}
  </section>
  {message && <p role="status" className="alert alert-success">{message}</p>}
  <section className="card"><p role="status">{stateText}</p>
   {['unknown','unavailable'].includes(intake) && <button className="btn btn-secondary" onClick={()=>setAttempt(n=>n+1)}>{p.retry}</button>}
   <div style={{display:'flex',flexWrap:'wrap',gap:'var(--spacing-3)'}}>
    {intake==='enabled'?<Link className="btn btn-primary" to="/student/report">{p.report}</Link>:<button className="btn btn-primary" disabled>{p.report}</button>}
    <Link className="btn btn-secondary" to="/student/track">{t.common.trackCases}</Link>
   </div><p>{p.privacy}</p>
  </section>
  <Dialog isOpen={open} onClose={()=>{if(!busy)setOpen(false);}} title={p.verify} description={p.claimHelp}>
   <p>{p.claimHelp}</p>{error && <p role="alert" className="alert alert-danger">{error}</p>}
   <form onSubmit={submit} style={{display:'grid',gap:'var(--spacing-3)'}}>
    <label htmlFor="claim-register">{p.reg}</label><input id="claim-register" value={reg} required minLength={6} maxLength={30} onChange={e=>setReg(e.target.value.toUpperCase())} />
    <label htmlFor="claim-notes">{p.notes}</label><textarea id="claim-notes" value={notes} maxLength={1000} onChange={e=>setNotes(e.target.value)} />
    <button className="btn btn-primary" disabled={busy}>{busy?p.busy:p.submitClaim}</button>
    <button className="btn btn-secondary" type="button" disabled={busy} onClick={()=>setOpen(false)}>{p.cancel}</button>
   </form>
  </Dialog>
 </div>;
}

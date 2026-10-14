import {useEffect,useState} from 'react';
import {Outlet} from 'react-router-dom';
import {useAuth} from '@/context/AuthContext';
import {startOwnerEntry,verifyOwnerEntry,setupOwnerPin,entryOwnerTotp,setOwnerGrant,releaseOwnerGrant,setupMfa,verifyMfa} from '@/api/client';
import type {MfaSetupResponse} from '@/api/types';
import {Button} from '@/components/ui/Button';
import styles from '@/pages/LoginPage.module.css';

export default function OwnerEntryGate() {
 const {user,retry}=useAuth();
 const [pin,setPin]=useState('');
 const [confirmPin,setConfirmPin]=useState('');
 const [otp,setOtp]=useState('');
 const [totp,setTotp]=useState('');
 const [challenge,setChallenge]=useState<{challengeId:string;setup:boolean}|null>(null);
 const [mfa,setMfa]=useState<MfaSetupResponse|null>(null);
 const [useEmailOtp,setUseEmailOtp]=useState(false);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [expires,setExpires]=useState(0);

 useEffect(()=>{
  setOwnerGrant(null);
  const lock=()=>{releaseOwnerGrant();setExpires(0);setChallenge(null);setPin('');setConfirmPin('');setOtp('');setTotp('');};
  window.addEventListener('aegis-owner-locked',lock);
  window.addEventListener('pagehide',lock);
  return ()=>{window.removeEventListener('aegis-owner-locked',lock);window.removeEventListener('pagehide',lock);releaseOwnerGrant();};
 },[user?.id]);

 useEffect(()=>{
  if(!expires) return;
  const timer=window.setTimeout(()=>{releaseOwnerGrant();setExpires(0);setChallenge(null);},Math.max(0,expires-Date.now()));
  return ()=>window.clearTimeout(timer);
 },[expires]);

 async function submit(e:React.FormEvent) {
  e.preventDefault();setError('');setBusy(true);
  try {
   if(!user?.mfa_enrolled) {
    if(!mfa) setMfa(await setupMfa());
    else {await verifyMfa({code:totp});setMfa(null);setTotp('');retry();}
   } else if(!user.action_pin_set) {
    if(pin!==confirmPin) {
     throw new Error('5-digit PIN and confirmation PIN do not match.');
    }
    const result=await setupOwnerPin({pin,totp});
    setOwnerGrant(result.grant);setExpires(Date.now()+result.expiresIn*1000);
    setPin('');setConfirmPin('');setTotp('');retry();
   } else if(!useEmailOtp) {
    const result=await entryOwnerTotp({pin,totp});
    setOwnerGrant(result.grant);setExpires(Date.now()+result.expiresIn*1000);
    setPin('');setTotp('');
   } else if(!challenge) {
    setChallenge(await startOwnerEntry(pin));setPin('');
   } else {
    const result=await verifyOwnerEntry({challengeId:challenge.challengeId,otp,...(challenge.setup?{pin,totp}:{})});
    setOwnerGrant(result.grant);setExpires(Date.now()+result.expiresIn*1000);
    setPin('');setOtp('');setTotp('');
   }
  } catch(err:unknown) {setError(err instanceof Error?err.message:'Owner verification unavailable.');}
  finally {setBusy(false);}
 }

 if(expires>Date.now()) return <Outlet/>;

 return <main className={styles.page}><section className={styles.panel} aria-labelledby="owner-entry-title">
  <h1 id="owner-entry-title">Owner access</h1>
  <p>Designated Primary Owner secure access verification.</p>
  <form onSubmit={submit} style={{display:'grid',gap:'1rem'}}>
   {!user?.mfa_enrolled ? <>
    <p>Enroll your authenticator before setting up owner access.</p>
    {mfa && <>
     <p>Add this key to your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password):</p>
     <p><code style={{overflowWrap:'anywhere',fontWeight:600}}>{mfa.secret}</code></p>
     <p style={{fontSize:'0.85rem',color:'var(--color-text-secondary)'}}>Save these recovery codes securely before continuing: {mfa.recoveryCodes.join(', ')}</p>
     <label htmlFor="owner-totp">6-digit Authenticator Code</label>
     <input id="owner-totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={totp} onChange={e=>setTotp(e.target.value)} required/>
    </>}
   </> : !user.action_pin_set ? <>
    <p>Choose your personal 5-digit Owner Action PIN. This PIN is hashed with salted scrypt and enforces a 15-minute lockout on repeated failures.</p>
    <label htmlFor="owner-new-pin">Personal 5-digit PIN</label>
    <input id="owner-new-pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{5}" maxLength={5} value={pin} onChange={e=>setPin(e.target.value)} required/>
    <label htmlFor="owner-confirm-pin">Confirm 5-digit PIN</label>
    <input id="owner-confirm-pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{5}" maxLength={5} value={confirmPin} onChange={e=>setConfirmPin(e.target.value)} required/>
    <label htmlFor="owner-setup-totp">Current 6-digit Authenticator Code</label>
    <input id="owner-setup-totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={totp} onChange={e=>setTotp(e.target.value)} required/>
   </> : !useEmailOtp ? <>
    <label htmlFor="owner-entry-pin">5-digit Action PIN</label>
    <input id="owner-entry-pin" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{5}" maxLength={5} value={pin} onChange={e=>setPin(e.target.value)} required/>
    <label htmlFor="owner-entry-totp">6-digit Authenticator Code</label>
    <input id="owner-entry-totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={totp} onChange={e=>setTotp(e.target.value)} required/>
   </> : !challenge ? <>
    <label htmlFor="owner-pin">5-digit access PIN</label>
    <input id="owner-pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{5}" maxLength={5} value={pin} onChange={e=>setPin(e.target.value)} required/>
   </> : <>
    <label htmlFor="owner-otp">Fresh email code</label>
    <input id="owner-otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value)} required/>
   </>}

   {error && <p role="alert" style={{color:'var(--color-danger)'}}>{error}</p>}
   <Button type="submit" loading={busy}>
    {!user?.mfa_enrolled ? (mfa?'Confirm Authenticator':'Enroll Authenticator') : !user.action_pin_set ? 'Save PIN and Enter' : !useEmailOtp ? 'Verify PIN + TOTP and Enter' : challenge ? 'Verify Email Code and Enter' : 'Send Email Code'}
   </Button>

   {user?.action_pin_set && !challenge && (
    <Button type="button" variant="secondary" disabled={busy} onClick={()=>{setUseEmailOtp(!useEmailOtp);setError('');}}>
     {useEmailOtp ? 'Switch to PIN + Authenticator App' : 'Switch to Email Code Verification'}
    </Button>
   )}

   {challenge && <Button type="button" variant="secondary" disabled={busy} onClick={()=>{setChallenge(null);setOtp('');setPin('');setTotp('');}}>Start again</Button>}
  </form>
 </section></main>;
}

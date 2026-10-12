import {useEffect,useState} from 'react';
import {Outlet} from 'react-router-dom';
import {useAuth} from '@/context/AuthContext';
import {startOwnerEntry,verifyOwnerEntry,setOwnerGrant,releaseOwnerGrant,setupMfa,verifyMfa} from '@/api/client';
import type {MfaSetupResponse} from '@/api/types';
import {Button} from '@/components/ui/Button';
import styles from '@/pages/LoginPage.module.css';

export default function OwnerEntryGate() {
 const {user,retry}=useAuth();
 const [pin,setPin]=useState(''),[otp,setOtp]=useState(''),[totp,setTotp]=useState('');
 const [challenge,setChallenge]=useState<{challengeId:string;setup:boolean}|null>(null);
 const [mfa,setMfa]=useState<MfaSetupResponse|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[expires,setExpires]=useState(0);
 useEffect(()=>{
  setOwnerGrant(null);
  const lock=()=>{releaseOwnerGrant();setExpires(0);setChallenge(null);setPin('');setOtp('');setTotp('');};
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
   } else if(!challenge) {
    setChallenge(await startOwnerEntry(user.action_pin_set ? pin : undefined));setPin('');
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
  <p>Sign in with the designated owner account, then verify your access PIN and a fresh email code.</p>
  <form onSubmit={submit} style={{display:'grid',gap:'1rem'}}>
   {!user?.mfa_enrolled ? <>
    <p>Enroll your authenticator before setting up owner access.</p>
    {mfa && <>
     <p>Add this key to your authenticator: <code style={{overflowWrap:'anywhere'}}>{mfa.secret}</code></p>
     <p>Save these recovery codes securely before continuing: {mfa.recoveryCodes.join(', ')}</p>
     <label htmlFor="owner-totp">Authenticator code</label>
     <input id="owner-totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={totp} onChange={e=>setTotp(e.target.value)} required/>
    </>}
   </> : !challenge ? <>
    {user.action_pin_set ? <><label htmlFor="owner-pin">5-digit access PIN</label>
     <input id="owner-pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{5}" maxLength={5} value={pin} onChange={e=>setPin(e.target.value)} required/></>
     : <p>Verify your owner email and authenticator to choose your 5-digit PIN.</p>}
   </> : <>
    <label htmlFor="owner-otp">Fresh email code</label>
    <input id="owner-otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value)} required/>
    {challenge.setup && <>
     <label htmlFor="owner-new-pin">Choose your 5-digit access PIN</label>
     <input id="owner-new-pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{5}" maxLength={5} value={pin} onChange={e=>setPin(e.target.value)} required/>
     <label htmlFor="owner-setup-totp">Authenticator code</label>
     <input id="owner-setup-totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={totp} onChange={e=>setTotp(e.target.value)} required/>
    </>}
   </>}
   {error && <p role="alert">{error}</p>}
   <Button type="submit" loading={busy}>{!user?.mfa_enrolled ? (mfa?'Confirm authenticator':'Enroll authenticator') : challenge?'Verify and enter':'Send email code'}</Button>
   {challenge && <Button type="button" variant="secondary" disabled={busy} onClick={()=>{setChallenge(null);setOtp('');setPin('');setTotp('');}}>Start again</Button>}
  </form>
 </section></main>;
}

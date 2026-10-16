// Local built-asset UI checks. All API responses are synthetic; external networking is blocked.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const arg=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
const modulePath=arg('playwright-module');
const {chromium}=modulePath?await import(pathToFileURL(modulePath)):await import('playwright');
const repo=process.cwd();const dist=path.join(repo,'frontend/dist');
const output=arg('output-dir')||path.join(repo,'test-results/phase1');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 let file=path.resolve(dist,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(dist+path.sep)){res.writeHead(403);res.end();return;}
 if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(dist,'index.html');
 const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[ext]||'application/octet-stream');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
let browser;const checks=[];const consoleErrors=[];
try{
 try{browser=await chromium.launch({headless:true});}catch{browser=await chromium.launch({channel:'msedge',headless:true});}
 const context=await browser.newContext({viewport:{width:1280,height:900}});let role=null;let config='disabled';
 const student={id:'synthetic-student',email:'student@example.test',name:'Student Fixture',role:'student',account_status:'active',department:'Computer Science',department_code:'CSE',is_verified_student:false,permissions:[],assigned_departments:[]};
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin!==origin){await route.abort();return;}
  if(!u.pathname.startsWith('/api/')){await route.continue();return;}
  let status=200;let body={};
  if(u.pathname==='/api/me'){if(role)body={user:{...student,role}};else{status=401;body={error:'Sign in required.'};}}
  else if(u.pathname==='/api/auth/challenge'){status=503;body={error:'Fixture unavailable'};}
  else if(u.pathname==='/api/config'){
   if(config==='loading'){await new Promise(r=>setTimeout(r,1500));body={intakeEnabled:false};}
   else if(config==='unavailable'){status=503;body={error:'Fixture unavailable'};}
   else if(config==='unknown')body={ready:true};
   else body={ready:true,intakeEnabled:config==='enabled'};
  }else if(u.pathname==='/api/student/verification-status')body={isVerified:false,activeRequest:null};
  else if(u.pathname==='/api/student/verification-request')body={status:'PENDING',registerNumber:'22CS101',autoApproved:false};
  else if(u.pathname==='/api/complaints')body={complaints:[]};
  else if(u.pathname==='/api/admin/users')body={users:[]};
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 const page=await context.newPage();page.on('pageerror',e=>consoleErrors.push(e.message));
 await page.goto(origin+'/login');
 await page.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();
 assert.equal(await page.locator('#login-email').count(),0);checks.push('Google-first primary screen retains secondary password path');
 await page.getByRole('button',{name:'Use an existing password account'}).click();
 await page.getByLabel('Account email',{exact:true}).fill('fixture@example.test');
 await page.getByRole('button',{name:'Forgot password?'}).click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();await page.waitForTimeout(80);
 assert.equal(await dialog.getAttribute('aria-modal'),'true');
 assert.equal(await page.locator('[role=dialog]').evaluate(el=>el.contains(document.activeElement)),true);
 await page.keyboard.press('Tab');
 assert.equal(await page.locator('[role=dialog]').evaluate(el=>el.contains(document.activeElement)),true);
 await dialog.getByLabel('Account email',{exact:true}).fill('fixture@example.test');
 await dialog.getByRole('button',{name:'I have a reset token'}).click();
 assert.equal(await dialog.getByLabel('Single-use reset token').count(),1);assert.equal(await dialog.getByLabel('New password',{exact:true}).count(),1);
 await page.keyboard.press('Shift+Tab');assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 assert.equal(await page.getByRole('button',{name:'Forgot password?'}).evaluate(el=>el===document.activeElement),true);
 checks.push('Reset dialog names, labels, keyboard containment, Escape and focus restoration');
 role='student';
 for(const state of ['loading','unavailable','unknown','disabled','enabled']){
  config=state;await page.goto(origin+'/student');
  const label=({loading:'Checking reporting availability',unavailable:'Reporting availability could not be checked',unknown:'Reporting status is unknown',disabled:'Reporting is currently paused',enabled:'Reporting is available'})[state];
  await page.getByText(label,{exact:false}).waitFor();
  if(state==='enabled')assert.equal(await page.getByRole('link',{name:'Open reporting form',exact:true}).count(),1);
  else assert.equal(await page.getByRole('button',{name:'Open reporting form',exact:true}).isDisabled(),true);
 }
 checks.push('Dashboard loading, unavailable, unknown, disabled and enabled intake states');
 config='unavailable';await page.goto(origin+'/student/report');await page.getByText('Reporting availability could not be checked',{exact:false}).waitFor();
 assert.equal(await page.locator('button[type=submit]').isDisabled(),true);checks.push('Direct reporting navigation fails closed when configuration is unavailable');
 config='disabled';await page.goto(origin+'/student');
 await page.getByRole('button',{name:'Request enrollment review',exact:true}).click();await page.getByRole('dialog').waitFor();
 await page.getByLabel('Official register number',{exact:true}).fill('22CS101');
 await page.getByRole('button',{name:'Submit request',exact:true}).click();await page.getByText('Enrollment request submitted for review.',{exact:true}).waitFor();
 checks.push('Enrollment dialog submits a synthetic pending claim without claiming Google verified enrollment');
 for(const width of [360,1280]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(output,'student-'+width+'.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,JSON.stringify(await page.evaluate(()=>Array.from(document.querySelectorAll('*')).filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right})).slice(0,10))));}
 await page.setViewportSize({width:360,height:900});await page.screenshot({path:path.join(output,'student-mobile.png'),fullPage:true});
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(output,'student-desktop.png'),fullPage:true});
 checks.push('Student dashboard has no horizontal overflow at 360px and 1280px');
 await page.setViewportSize({width:360,height:900});await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 const drawer=page.getByRole('dialog');await drawer.waitFor();await page.waitForTimeout(60);
 assert.equal(await drawer.evaluate(el=>el.contains(document.activeElement)),true);await page.keyboard.press('Tab');assert.equal(await drawer.evaluate(el=>el.contains(document.activeElement)),true);
 assert.equal(await page.locator('[role=dialog]').evaluate(el=>el.closest('[data-theme]')?.getAttribute('data-theme')),'sanctuary');
 await page.keyboard.press('Escape');await drawer.waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'Open navigation',exact:true}).evaluate(el=>el===document.activeElement),true);
 checks.push('Mobile navigation keeps theme, keyboard focus and focus restoration');
 await page.getByLabel('Display Language').selectOption('ta');await page.getByText('சேர்க்கைச் சரிபார்ப்பு:',{exact:false}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.getByLabel('Display Language').selectOption('en');
 checks.push('Tamil student view is localized and fits mobile width');
 await page.setViewportSize({width:1280,height:900});
 // Evaluate resolved semantic color pairs, rather than asserting a palette name.
 const contrast=await page.evaluate(()=>{
  const rgb=color=>color.match(/[\d.]+/g).slice(0,3).map(Number);
  const lum=c=>rgb(c).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
  const get=(scope,token)=>{const span=document.createElement('span');scope.append(span);span.style.color='var('+token+')';const value=getComputedStyle(span).color;span.remove();return value;};
  const results=[];
  for(const theme of ['sanctuary','stewardship']){const scope=document.createElement('div');scope.dataset.theme=theme;document.body.append(scope);
   for(const [fg,bg,min] of [['--color-action-text','--color-action-bg',4.5],['--color-text-primary','--color-bg-page',4.5],['--color-text-secondary','--color-bg-subtle',4.5],['--color-text-muted','--color-bg-surface',4.5],['--color-text-link','--color-bg-page',4.5],['--color-focus-ring','--color-bg-page',3],['--color-border-default','--color-bg-surface',3]]){
    const f=lum(get(scope,fg)),b=lum(get(scope,bg));results.push({theme,fg,bg,ratio:(Math.max(f,b)+0.05)/(Math.min(f,b)+0.05),min});
   }scope.remove();
  }return results;
 });
 fs.writeFileSync(path.join(output,'contrast.json'),JSON.stringify(contrast,null,2));
 for(const pair of contrast)assert.ok(pair.ratio>=pair.min,JSON.stringify(pair));checks.push('Fourteen semantic text, control boundary and focus contrast pairs meet AA thresholds');
 role='HOD';await page.goto(origin+'/hod/students');await page.getByText('Enrollment verification requires a separately authorized reviewer. Your current role does not grant access.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/Approve/}).count(),0);await page.screenshot({path:path.join(output,'staff-desktop.png'),fullPage:true});checks.push('HOD UI exposes no implicit enrollment approval controls');
 assert.deepEqual(consoleErrors,[]);checks.push('No browser JavaScript exceptions');
 fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({status:'PASS',checks,scope:'Synthetic API fixtures only; external requests blocked'},null,2));
 console.log(JSON.stringify({status:'PASS',checks,output},null,2));
}catch(error){fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({status:'FAIL',checks,error:String(error),consoleErrors},null,2));throw error;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

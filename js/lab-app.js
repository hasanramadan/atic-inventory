
(function(){
"use strict";
/* ---------- helpers ---------- */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=p=>(p||'x')+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const pad=n=>String(n).padStart(2,'0');
function dubaiToday(){const d=new Date(Date.now()+4*3600e3);return d.toISOString().slice(0,10)}
function addDays(s,n){const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function niceDate(s){if(!s)return'';const d=new Date(s+'T00:00:00Z');return d.getUTCDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]+' '+d.getUTCFullYear()}
function hhmm(t){if(!t)return'';const d=new Date(t);return pad(d.getHours())+':'+pad(d.getMinutes())}
function ago(t){const s=Math.round((Date.now()-t)/1000);if(s<60)return s+'s ago';if(s<3600)return Math.round(s/60)+' min ago';return hhmm(t)}
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}}
function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}
function fmt(v,dp){if(v==null||v===''||isNaN(v))return'–';return Number(v).toFixed(dp==null?2:dp)}

/* ---------- formulas ---------- */
const SAFE=/^[A-Za-z0-9_+\-*/().,\s^]*$/;
const fnCache={};
function evalFormula(expr,vars){
  if(!expr)return null; if(!SAFE.test(expr))return NaN;
  const keys=Object.keys(vars).sort();
  const sig=expr+'|'+keys.join(',');
  let f=fnCache[sig];
  if(!f){try{f=fnCache[sig]=new Function(...keys,'"use strict";const {sqrt,log,log10,exp,abs,round,min,max,pow}=Math;return ('+expr.replace(/\^/g,'**')+');')}catch(e){return NaN}}
  try{const v=f(...keys.map(k=>vars[k]));return typeof v==='number'&&isFinite(v)?v:NaN}catch(e){return NaN}
}
/* returns [{key,label,unit,value,state}] for a test given inputs */
function solOf(id){return (S.sol||[]).find(x=>x.id===id)}
function constVal(c,snap){if(snap&&snap[c.key]!=null)return Number(snap[c.key]);if(c.sol){const x=solOf(c.sol);if(x&&x.conc!==''&&x.conc!=null)return Number(x.conc)}return Number(c.value)}
function constSnap(t){const k={};(t.consts||[]).forEach(c=>{if(c.sol)k[c.key]=constVal(c)});return Object.keys(k).length?k:null}
function computeTest(test,inputs,snap){
  const vars={};
  (test.consts||[]).forEach(c=>vars[c.key]=constVal(c,snap));
  let missing=false;
  (test.inputs||[]).forEach(i=>{const v=inputs&&inputs[i.key];if(v===''||v==null||isNaN(Number(v))){missing=true;vars[i.key]=NaN}else vars[i.key]=Number(v)});
  return (test.outputs||[]).map(o=>{
    let v=null;
    if(!missing){v=evalFormula(o.formula||(test.inputs[0]&&test.inputs[0].key),vars); if(o.key)vars[o.key]=v}
    return {key:o.key,label:o.label,unit:o.unit,dp:o.dp,value:v,state:limitState(v,o)};
  });
}
function limitState(v,o){
  if(v==null||isNaN(v))return'';
  const mn=o.min===''||o.min==null?null:Number(o.min), mx=o.max===''||o.max==null?null:Number(o.max);
  if(mn==null&&mx==null)return'';
  if((mn!=null&&v<mn)||(mx!=null&&v>mx))return'bad';
  return'ok';
}
function limitText(o){const mn=o.min!==''&&o.min!=null,mx=o.max!==''&&o.max!=null;if(mn&&mx)return o.min+'–'+o.max;if(mn)return'≥ '+o.min;if(mx)return'≤ '+o.max;return''}

/* ---------- state ---------- */
const S={db:null,assets:null,downloads:null,ready:false,cfg:null,people:{},sessions:{},samples:{},tasks:{},daynotes:{},plans:{},
  sol:null,me:null,view:'today',sessionId:null,sampleId:null,setupProduct:null,dirty:false,error:null,cfgDraft:null};
const today=()=>dubaiToday();
function person(id){return S.people[id]||{name:'Unknown'}}
function product(id){return (S.cfg&&S.cfg.products||[]).find(p=>p.id===id)}
function role(){return S.me&&S.me.role}
const isDoctor=()=>role()==='doctor'||role()==='admin';
const isAdmin=()=>role()==='admin';
const isStation=()=>role()==='station';
const canBuild=()=>isStation()||isDoctor();

/* ---------- per-doc write queue (one write at a time per doc) ---------- */
const Q={};
function queueWrite(path,data,mode){
  const q=Q[path]||(Q[path]={busy:false,next:null});
  q.next={data,mode:mode||'set'};
  if(!q.busy)flush(path);
}
async function flush(path){
  const q=Q[path]; if(!q||!q.next)return; q.busy=true;
  const job=q.next; q.next=null;
  try{const ref=S.db.doc(path); if(job.mode==='delete')await ref.delete(); else if(job.mode==='update')await ref.update(job.data); else await ref.set(job.data)}
  catch(e){console.error(e);toast('Could not save: '+(e.message||e.code||'error'))}
  q.busy=false; if(q.next)flush(path);
}
function saveSample(s){S.samples[s.id]=s;queueWrite('samples/'+s.id,strip(s))}
function saveSession(s){S.sessions[s.id]=s;queueWrite('sessions/'+s.id,strip(s))}
function strip(o){const c=Object.assign({},o);delete c.id;return JSON.parse(JSON.stringify(c))}

/* debounced live typing */
const typingTimers={};
function liveSave(s,ms){clearTimeout(typingTimers[s.id]);typingTimers[s.id]=setTimeout(()=>{typingTimers[s.id]=null;saveSample(s)},ms==null?700:ms)}

/* ---------- boot ---------- */
async function boot(){
  const timer=setTimeout(()=>{if(!S.ready){S.error='The lab records did not answer. Check you are signed in to Claude, then reopen the page.';render()}},10000);
  try{
    S.db=await window.claude.use('db');
    S.assets=await window.claude.use('assets');
    S.downloads=await window.claude.use('downloads');
  }catch(e){}
  if(!S.db){clearTimeout(timer);S.error='This page needs you to be signed in to Claude to reach the lab records.';render();return}
  let got=0;const need=3;
  const done=()=>{got++;if(got>=need&&!S.ready){S.ready=true;clearTimeout(timer);restoreLogin();render()}};
  const err=e=>{clearTimeout(timer);S.error='Could not read the lab records ('+(e.code||e.message)+').';render()};
  S.db.doc('config/main').onSnapshot(snap=>{S.cfg=snap.exists?snap.data():{products:[],sections:['SEC-1','SEC-2']};done.c1||(done.c1=1,done());if(snap.exists&&S.sol)migrateWaterWeekly();changed('cfg')},err);
  S.db.collection('people').onSnapshot(snap=>{S.people={};snap.docs.forEach(d=>S.people[d.id]=Object.assign({id:d.id},d.data()));done.c2||(done.c2=1,done());if(S.me&&S.people[S.me.id])S.me=S.people[S.me.id];changed('people')},err);
  S.db.collection('sessions').orderBy('date','desc').limit(300).onSnapshot(snap=>{S.sessions={};snap.docs.forEach(d=>S.sessions[d.id]=Object.assign({id:d.id},d.data()));done.c3||(done.c3=1,done());changed('sessions')},err);
  S.db.collection('samples').orderBy('date','desc').limit(1000).onSnapshot(snap=>{
    snap.docs.forEach(d=>{const local=S.samples[d.id];const q=Q['samples/'+d.id];
      if(local&&((q&&(q.busy||q.next))||typingTimers[d.id]))return; S.samples[d.id]=Object.assign({id:d.id},d.data())});
    const ids=new Set(snap.docs.map(d=>d.id));Object.keys(S.samples).forEach(k=>{if(!ids.has(k)&&!(Q['samples/'+k]&&(Q['samples/'+k].busy||Q['samples/'+k].next)))delete S.samples[k]});
    changed('samples')},err);
  S.db.doc('config/solutions').onSnapshot(snap=>{const d=snap.exists?snap.data():null;S.sol=d&&d.list||null;if(!S.sol)seedSolutions();else migrateWaterWeekly();changed('sol')},()=>{});
  S.db.collection('tasks').orderBy('at','desc').limit(300).onSnapshot(snap=>{S.tasks={};snap.docs.forEach(d=>S.tasks[d.id]=Object.assign({id:d.id},d.data()));changed('tasks')},()=>{});
  S.db.collection('daynotes').onSnapshot(snap=>{S.daynotes={};snap.docs.forEach(d=>S.daynotes[d.id]=d.data());changed('daynotes')},()=>{});
  S.db.collection('plan').onSnapshot(snap=>{S.plans={};snap.docs.forEach(d=>S.plans[d.id]=d.data());changed('plan')},()=>{});
}
const SOL_SEED=[
  {id:'naoh01',name:'NaOH 0.1 N',chem:'Sodium hydroxide',nominal:0.1,conc:'0.107209',unit:'N'},
  {id:'naoh05',name:'NaOH 0.5 N',chem:'Sodium hydroxide',nominal:0.5,conc:'0.484624',unit:'N'},
  {id:'agno301',name:'AgNO3 0.1 N',chem:'Silver nitrate (salinity)',nominal:0.1,conc:'0.095472',unit:'N'},
  {id:'koh001',name:'KOH 0.01 N',chem:'Potassium hydroxide',nominal:0.01,conc:'0.01',unit:'N'}];
const SOL_LINKS={'t03|C':'naoh01','t05|C':'agno301','t15|C':'naoh05','t20|C':'koh001','t28|C':'koh001'};
let seeding=false;
let migW=false;
async function migrateWaterWeekly(){if(migW||!S.cfg||S.cfg.mWaterWeekly||!(window.LAB_ME||{}).id)return;migW=true;
  const c=JSON.parse(JSON.stringify(S.cfg));(c.products||[]).filter(p=>p.category==='water').forEach(p=>(p.tests||[]).forEach(t=>{if(t.kind==='micro'&&!t.everyDays)t.everyDays=7}));c.mWaterWeekly=1;
  try{await S.db.doc('config/main').set(c)}catch(e){migW=false}}
async function seedSolutions(){if(seeding||!S.cfg||!(window.LAB_ME||{}).id)return;seeding=true;
  try{await S.db.doc('config/solutions').set({list:SOL_SEED.map(x=>Object.assign({},x,{at:Date.now(),history:[]}))});
    const c=JSON.parse(JSON.stringify(S.cfg));let n=0;(c.products||[]).forEach(p=>(p.tests||[]).forEach(t=>(t.consts||[]).forEach(k=>{const id=SOL_LINKS[t.id+'|'+k.key];if(id&&!k.sol){k.sol=id;n++}})));
    if(n)await S.db.doc('config/main').set(c)}catch(e){seeding=false}}
function restoreLogin(){
  const me=window.LAB_ME||{}; const site=me.is_owner||me.role==='admin';
  let p=Object.values(S.people).find(x=>x.uid===me.id&&x.active!==false);
  if(!p&&site){ /* website creator / admins are lab admins */
    p=Object.values(S.people).find(x=>!x.uid&&x.role==='admin'&&x.name===(me.full_name||me.username));
    p=p?Object.assign(p,{uid:me.id}):{id:uid('u'),uid:me.id,name:me.full_name||me.username||'Admin',role:'admin',canTest:true,canValidate:true,pin:'',active:true};
    S.people[p.id]=p;queueWrite('people/'+p.id,strip(p));
  }
  if(!p&&String(me.username||'').toLowerCase()==='lab'){p={id:uid('u'),uid:me.id,name:'Lab',role:'station',canTest:false,canValidate:false,pin:'',active:true};S.people[p.id]=p;queueWrite('people/'+p.id,strip(p))}
  if(p){S.me=p;S.view=(p.role==='lab'||p.role==='station')?'today':'overview'}
  else S.error='You are not in the lab team yet. Ask the lab admin to add you in Lab → People (link your website account '+(me.full_name||me.username||'')+').';
}
function changed(){ if(!S.ready)return; const a=document.activeElement; if(a&&a.closest&&a.closest('#main')&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)){S.dirty=true;return} if($('.modal-bg')){S.dirty=true;return} render()}
document.addEventListener('focusout',()=>setTimeout(()=>{if(S.dirty&&!(document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))&&!$('.modal-bg')){S.dirty=false;render()}},50));
setInterval(()=>{if(S.ready&&S.view==='overview'&&!S.dirty)changed()},15000);

/* ---------- derived ---------- */
function sessionSamples(sid){return Object.values(S.samples).filter(s=>s.sessionId===sid).sort((a,b)=>a.n-b.n)}
function testsOf(p,kind){return (p&&p.tests||[]).filter(t=>!kind||t.kind===kind)}
function resultOf(s,t){return (s.results||{})[t.id]||{}}
function testDone(s,t){const r=resultOf(s,t);if(t.kind==='org')return !!r.value;const outs=computeTest(t,r.in,r.k);return outs.length>0&&outs.every(o=>o.value!=null&&!isNaN(o.value))}
function sampleFlags(s,p){let bad=0;testsOf(p).forEach(t=>{const r=resultOf(s,t);if(t.kind==='org'){if(r.value==='Not acceptable')bad++;return}computeTest(t,r.in,r.k).forEach(o=>{if(o.state==='bad')bad++})});return bad}
function sampleChemDone(s,p){const ts=testsOf(p).filter(t=>t.kind!=='micro'&&!t.optional);return ts.length>0&&ts.every(t=>testDone(s,t))}
/* tests done every N days (water micro: weekly): only due when N days passed since the last time it was done */
function lastDoneBefore(pid,tid,date){let L='';Object.values(S.samples).forEach(x=>{if(x.productId!==pid||x.date>=date)return;const p=product(pid);const t=p&&p.tests.find(y=>y.id===tid);if(t&&testDone(x,t)&&x.date>L)L=x.date});return L}
function nextDue(s,t){if(!t.everyDays)return s.date;const L=lastDoneBefore(s.productId,t.id,s.date);return L?addDays(L,Number(t.everyDays)):s.date}
function testActive(s,t){if(!t.everyDays)return true;if(s.on&&s.on[t.id])return true;if(s.off&&s.off[t.id])return false;if(testDone(s,t))return true;return nextDue(s,t)<=s.date}
function sampleMicroPending(s,p){return testsOf(p,'micro').filter(t=>testActive(s,t)&&!testDone(s,t))}
function sessionProgress(ss){const p=product(ss.productId);const smp=sessionSamples(ss.id);const target=Math.max(Number(ss.batches)||0,smp.length);const done=smp.filter(s=>sampleChemDone(s,p)).length;return{target,added:smp.length,done,bad:smp.reduce((a,s)=>a+sampleFlags(s,p),0),micro:smp.reduce((a,s)=>a+sampleMicroPending(s,p).length,0)}}
function myTasks(){return Object.values(S.tasks).filter(t=>!t.done&&(!t.to||t.to===S.me.id))}
function planFor(date){const m=S.plans[date.slice(0,7)];return (m&&m.days&&m.days[date])||{}}

/* ---------- render ---------- */
function render(){
  const root=$('#root');
  if(S.error){root.innerHTML='<div class="login"><h1>ATIC Lab</h1><div class="card">'+esc(S.error)+'</div></div>';return}
  if(!S.ready)return;
  if(!S.me){root.innerHTML=loginView();bindLogin();return}
  if(isStation())return renderStation();
  const tabs=[['today','Today',myTasks().length||''],['history','Records',''],['micro','Micro pending',microPendingCount()||''],['tasks','Tasks',myTasks().length||'']];
  if(isDoctor())tabs.unshift(['overview','Live overview','']);
  if(isDoctor())tabs.push(['chem','Solutions & formulas','']);
  if(isDoctor())tabs.push(['setup','Tests & limits','']);
  if(isAdmin())tabs.push(['people','People','']);
  if(S.view==='session'&&!S.sessions[S.sessionId])S.view='today';
  const cur=S.view==='session'?'today':S.view;
  root.innerHTML='<div class="app"><nav class="rail" aria-label="Sections"><div class="brand"><div class="flask3d" aria-hidden="true"><i></i><b></b><b></b><b></b></div>ATIC Lab<small>Quality control · '+niceDate(today())+'</small></div>'+
    tabs.map(t=>'<button class="tab'+(cur===t[0]?' on':'')+'" data-tab="'+t[0]+'"><span>'+t[1]+'</span>'+(t[2]?'<span class="badge">'+t[2]+'</span>':'')+'</button>').join('')+
    '<div class="me"><div><div class="label">Signed in</div><b>'+esc(S.me.name)+'</b> <span class="muted small">'+esc(roleName(S.me.role))+'</span></div></div></nav><main id="main">'+viewHTML()+'</main></div>';
  root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{S.view=b.dataset.tab;render()});
  bindView();
  root.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{S.cat=b.dataset.cat;lsSet('lab.cat',S.cat);histFilter.product='';render()});
  root.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{S.kind=b.dataset.kind;lsSet('lab.kind',S.kind);render()});
}
function roleName(r){return r==='admin'?'Admin':r==='doctor'?'Lab manager':r==='station'?'Lab account':'Lab technician'}
function renderStation(){
  const root=$('#root');
  if(!['today','session','micro','history','chem'].includes(S.view))S.view='today';
  const cur=S.view==='session'?'today':S.view;const mp=microPendingCount();
  const tabs=[['today','Testing',''],['micro','Micro to read',mp||''],['history','Records',''],['chem','Solutions & formulas','']];
  root.innerHTML='<div class="station"><header class="stbar"><div class="stbrand"><div class="flask3d" aria-hidden="true"><i></i><b></b><b></b><b></b></div><div><b>ATIC Lab</b><small>'+niceDate(today())+'</small></div></div><nav class="sttabs" aria-label="Sections">'+
    tabs.map(t=>'<button class="sttab'+(cur===t[0]?' on':'')+'" data-tab="'+t[0]+'">'+t[1]+(t[2]?'<span class="badge">'+t[2]+'</span>':'')+'</button>').join('')+'</nav></header><main id="main">'+viewHTML()+'</main></div>';
  root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{S.view=b.dataset.tab;render()});
  bindView();
  root.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{S.cat=b.dataset.cat;lsSet('lab.cat',S.cat);histFilter.product='';render()});
  root.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{S.kind=b.dataset.kind;lsSet('lab.kind',S.kind);render()});
}
function viewHTML(){
  switch(S.view){
    case 'overview':return overviewView();
    case 'session':return sessionView();
    case 'history':return historyView();
    case 'micro':return microView();
    case 'tasks':return tasksView();
    case 'setup':return setupView();
    case 'chem':return chemView();
    case 'people':return peopleView();
    default:return todayView();
  }
}
function bindView(){({overview:bindOverview,session:bindSession,history:bindHistory,micro:bindMicro,tasks:bindTasks,setup:bindSetup,chem:bindChem,people:bindPeople}[S.view]||bindToday)()}

/* ---------- login ---------- */
let pick=null;
function loginView(){
  const ps=Object.values(S.people).filter(p=>p.active!==false).sort((a,b)=>a.name.localeCompare(b.name));
  if(!ps.length)return '<div class="login"><h1>ATIC Lab</h1><div class="card stack"><p>No people are set up yet. Ask Claude or the admin to add the lab team.</p></div></div>';
  return '<div class="login"><div><h1>ATIC Lab</h1><p class="muted">Pick your name and enter your PIN.</p></div><div class="people-pick">'+
    ps.map(p=>'<button data-pick="'+p.id+'" class="'+(pick===p.id?'on':'')+'">'+esc(p.name)+'</button>').join('')+'</div>'+
    '<form id="loginf" class="row"><input id="pin" type="password" inputmode="numeric" placeholder="PIN" autocomplete="off" style="flex:1"><button class="primary" type="submit">Sign in</button></form><p id="lerr" class="small" style="color:var(--bad)"></p></div>';
}
function bindLogin(){
  document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{pick=b.dataset.pick;render();setTimeout(()=>$('#pin')&&$('#pin').focus(),0)});
  const f=$('#loginf');if(!f)return;
  f.onsubmit=e=>{e.preventDefault();const p=S.people[pick];if(!p){$('#lerr').textContent='Pick your name first.';return}
    if(String(p.pin||'')!==$('#pin').value.trim()){$('#lerr').textContent='That PIN does not match '+p.name+'.';return}
    S.me=p;lsSet('atic-lab-me',p.id);S.view=p.role==='lab'?'today':'overview';pick=null;render()};
}

/* ---------- modal ---------- */
function modal(html,onMount){const bg=document.createElement('div');bg.className='modal-bg';bg.innerHTML='<div class="modal" role="dialog" aria-modal="true">'+html+'</div>';document.body.appendChild(bg);
  const close=()=>{bg.remove();if(S.dirty){S.dirty=false;render()}};bg.addEventListener('click',e=>{if(e.target===bg)close()});bg.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);onMount&&onMount(bg,close);const f=bg.querySelector('input,textarea,select');f&&f.focus();return close}
function pinCheck(personId,pin){const p=S.people[personId];return p&&String(p.pin||'')===String(pin||'').trim()}

/* ---------- uploads ---------- */
async function uploadFiles(files){
  const out=[];
  if(!files||!files.length)return out;
  if(!S.assets){toast('File uploads are not available on this device.');return out}
  for(const f of files){try{const r=await S.assets.upload(f);out.push({id:r.id,url:r.url,name:f.name,type:r.contentType})}catch(e){toast('Could not upload '+f.name+': '+(e.code||e.message))}}
  return out;
}
function filesHTML(fs){if(!fs||!fs.length)return'';return '<div class="thumbs">'+fs.map(f=>/^image\//.test(f.type||'')?'<a href="'+esc(f.url)+'" target="_blank" rel="noopener"><img src="'+esc(f.url)+'" alt="'+esc(f.name)+'"></a>':'<a href="'+esc(f.url)+'" target="_blank" rel="noopener">'+esc(f.name)+'</a>').join('')+'</div>'}

/* ---------- TODAY ---------- */
function todayView(){
  const d=today();const note=S.daynotes[d];
  const plan=planFor(d);
  const sess=Object.values(S.sessions).filter(s=>s.date===d&&inCat(s)).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  const started=new Set(sess.map(s=>s.productId+'|'+s.section));
  const planned=Object.keys(plan).map(k=>{const[pc,sec]=k.split('|');const p=(S.cfg.products||[]).find(x=>x.code===pc);return{key:k,p,sec,batches:plan[k]}}).filter(x=>x.p&&(catSel()==='all'||catOfP(x.p)===catSel()));
  const tasks=isStation()?[]:myTasks();
  const assigned=isStation()?[]:Object.values(S.samples).filter(s=>inCat(s)&&s.assignedTo===S.me.id&&!sampleChemDone(s,product(s.productId)));
  let h='<div class="stack">'+catBar()+'<div class="row between"><h1>'+esc(catLabel(catSel()))+' · '+niceDate(d)+'</h1><button class="primary" id="newSess">Start testing</button></div>';
  if(note&&note.text)h+='<div class="note-banner"><div class="label">Note from '+esc(person(note.by).name)+' · '+hhmm(note.at)+'</div>'+esc(note.text).replace(/\n/g,'<br>')+'</div>';
  if(tasks.length||assigned.length){h+='<div class="card stack"><h3>For you</h3>'+tasks.map(t=>'<div class="row between"><span>'+esc(t.text)+(t.sessionId&&S.sessions[t.sessionId]?' <span class="muted small">· '+esc(sessLabel(S.sessions[t.sessionId]))+'</span>':'')+'</span><button class="ghost" data-taskdone="'+t.id+'">Mark done</button></div>').join('')+
    assigned.map(s=>'<div class="row between"><span>Sample <b class="mono">'+esc(s.code)+'</b> assigned to you</span><button class="ghost" data-open-sample="'+s.id+'">Open</button></div>').join('')+'</div>'}
  const todo=planned.filter(x=>!started.has(x.p.id+'|'+x.sec));
  if(todo.length)h+='<div class="card stack"><div class="row between"><h3>Production plan for today</h3><span class="muted small">From the factory plan</span></div>'+todo.map(x=>'<div class="row between"><span><b>'+esc(x.p.name)+'</b> · '+esc(x.sec)+' · <span class="num">'+x.batches+'</span> batches</span><button data-start="'+x.key+'">Start</button></div>').join('')+'</div>';
  if(catSel()!=='product'){const ps=(S.cfg.products||[]).filter(p=>catSel()==='all'?catOfP(p)!=='product':catOfP(p)===catSel());if(ps.length)h+='<div class="card stack"><h3>Start a test</h3><div class="quick">'+ps.map(p=>'<button class="qbtn" data-startp="'+p.id+'"><b>'+esc(p.name)+'</b><span class="small muted">'+testsOf(p).filter(t=>t.kind!=='micro').length+' chemical · '+testsOf(p,'micro').length+' micro</span></button>').join('')+'</div></div>'}
  h+='<h2>Open today</h2>';
  if(!sess.length)h+='<div class="card muted">Nothing started yet. Press <b>Start testing</b> or start one of the planned products above.</div>';
  else h+='<div class="grid">'+sess.map(sessCard).join('')+'</div>';
  return h+'</div>';
}
function sessLabel(s){const p=product(s.productId);return (p?p.name:'?')+' · '+s.section+' · Lot '+(s.lot||'–')}
function sessCard(s){const p=product(s.productId);const pr=sessionProgress(s);const pct=pr.target?Math.round(100*pr.done/pr.target):0;
  return '<button class="card stack" style="text-align:left;cursor:pointer" data-open-session="'+s.id+'"><div class="row between"><h3>'+esc(p?p.name:'?')+'</h3>'+statusPill(s)+'</div>'+
  '<div class="row small muted"><span>'+esc(s.section)+'</span><span>Lot <span class="num">'+esc(s.lot||'–')+'</span></span><span>'+niceDate(s.date)+'</span></div>'+
  '<div class="bar"><i style="width:'+pct+'%"></i></div><div class="row small"><span class="num">'+pr.done+' / '+pr.target+'</span> samples tested'+(pr.bad?'<span class="pill bad">'+pr.bad+' out of limit</span>':'')+(pr.micro?'<span class="pill warn">'+pr.micro+' micro pending</span>':'')+'</div></button>'}
function statusPill(s){if(s.validated)return'<span class="pill ok">Validated</span>';if(s.tested&&s.tested.length)return'<span class="pill acc">Tested</span>';return'<span class="pill">In progress</span>'}
function bindToday(){
  const n=$('#newSess');n&&(n.onclick=()=>{const p=(S.cfg.products||[]).find(p=>catSel()==='all'||catOfP(p)===catSel());newSessionModal(p?{productId:p.id,section:catSel()==='product'||catSel()==='all'?'':'Lab'}:{})});
  document.querySelectorAll('[data-startp]').forEach(b=>b.onclick=()=>newSessionModal({productId:b.dataset.startp,section:'Lab'}));
  document.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>{const[pc,sec]=b.dataset.start.split('|');const p=S.cfg.products.find(x=>x.code===pc);newSessionModal({productId:p.id,section:sec,batches:planFor(today())[b.dataset.start]})});
  bindCommon();
}
function bindCommon(){
  document.querySelectorAll('[data-open-session]').forEach(b=>b.onclick=()=>{S.sessionId=b.dataset.openSession;S.sampleId=null;S.view='session';render()});
  document.querySelectorAll('[data-open-sample]').forEach(b=>b.onclick=()=>{const s=S.samples[b.dataset.openSample];if(!s)return;S.sessionId=s.sessionId;S.sampleId=s.id;S.view='session';render()});
  document.querySelectorAll('[data-taskdone]').forEach(b=>b.onclick=()=>{const t=S.tasks[b.dataset.taskdone];t.done=true;t.doneBy=S.me.id;t.doneAt=Date.now();queueWrite('tasks/'+t.id,strip(t));render()});
}
function lastLot(pid){const s=Object.values(S.sessions).filter(x=>x.productId===pid&&x.lot).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];return s?s.lot:''}
function newSessionModal(pre){
  pre=pre||{};
  const prods=(S.cfg.products||[]);
  const cats={product:'Products',water:'Water',swab:'Swabs',raw:'Raw materials'};
  const opts=Object.keys(cats).map(c=>{const ps=prods.filter(p=>(p.category||'product')===c);return ps.length?'<optgroup label="'+cats[c]+'">'+ps.map(p=>'<option value="'+p.id+'"'+(pre.productId===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</optgroup>':''}).join('');
  modal('<h2>Start testing</h2><form id="nsf" class="stack">'+
    '<label class="field"><span>What are you testing?</span><select id="ns-p">'+opts+'</select></label>'+
    '<div class="row"><label class="field" style="flex:1"><span>Date</span><input id="ns-d" type="date" value="'+today()+'"></label>'+
    '<label class="field" style="flex:1"><span>Section</span><select id="ns-s">'+(S.cfg.sections||['SEC-1','SEC-2']).concat(['Lab','Other']).map(x=>'<option'+(pre.section===x?' selected':'')+'>'+x+'</option>').join('')+'</select></label></div>'+
    '<div class="row"><label class="field" style="flex:1"><span>Lot number</span><input id="ns-l" class="num" placeholder="e.g. 25279"></label>'+
    '<label class="field" style="flex:1"><span>Batches / samples expected</span><input id="ns-b" type="number" min="0" class="num" value="'+(pre.batches||'')+'"></label></div>'+
    '<label class="field"><span>Tank number (optional, used for every sample unless changed)</span><input id="ns-t" placeholder="e.g. 4"></label>'+
    '<p class="small muted" id="ns-hint"></p>'+
    '<div class="row" style="justify-content:flex-end"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Start</button></div></form>',(bg,close)=>{
      const hint=()=>{const ll=lastLot(bg.querySelector('#ns-p').value);bg.querySelector('#ns-hint').textContent=ll?'Last lot used for this product: '+ll:''};hint();bg.querySelector('#ns-p').onchange=hint;
      bg.querySelector('#nsf').onsubmit=e=>{e.preventDefault();
        const s={id:uid('s'),productId:bg.querySelector('#ns-p').value,date:bg.querySelector('#ns-d').value||today(),section:bg.querySelector('#ns-s').value,lot:bg.querySelector('#ns-l').value.trim(),batches:Number(bg.querySelector('#ns-b').value)||0,tank:bg.querySelector('#ns-t').value.trim(),createdBy:S.me.id,createdAt:Date.now(),tested:[],validated:null};
        saveSession(s);close();S.sessionId=s.id;S.sampleId=null;S.view='session';render()}})
}

/* ---------- SESSION (testing) ---------- */
function sessionView(){
  const ss=S.sessions[S.sessionId];const p=product(ss.productId);
  const smp=sessionSamples(ss.id);const pr=sessionProgress(ss);
  if(!S.sampleId||!S.samples[S.sampleId]||S.samples[S.sampleId].sessionId!==ss.id)S.sampleId=smp[0]?smp[0].id:null;
  const left=Math.max(0,(Number(ss.batches)||0)-smp.length);
  let h='<div class="stack"><div class="row between"><button class="ghost" data-tab-back>← Back</button><div class="row">'+statusPill(ss)+'<button id="stickers">Print sample stickers</button></div></div>';
  h+='<div class="session-head"><div><div class="label">'+esc(catName(p))+'</div><h1>'+esc(p?p.name:'?')+'</h1></div>'+
    kv('Date',niceDate(ss.date))+kv('Section',ss.section)+kv('Lot',ss.lot||'–','lot')+kv('Batches',ss.batches||'–','batches')+kv('Tank',ss.tank||'–','tank')+
    '<button class="ghost" id="editSess">Edit details</button></div>';
  h+='<div class="card row between"><div class="row"><b class="num" style="font-size:18px">'+smp.length+' of '+(ss.batches||smp.length)+'</b><span>samples added</span>'+(left?'<span class="pill warn">'+left+' left to add</span>':'<span class="pill ok">All batches sampled</span>')+'<span class="muted">·</span><span class="num">'+pr.done+'</span> fully tested'+(pr.bad?'<span class="pill bad">'+pr.bad+' out of limit</span>':'')+'</div><button class="primary" id="addSample">'+(left?'Add sample '+(p?p.code:'')+(smp.length+1):'Add extra sample')+'</button></div>';
  if(!smp.length){h+='<div class="card muted">No samples yet. Press <b>Add sample</b> for each batch you take a sample from.</div>'+signoffHTML(ss,smp)+'</div>';return h}
  const cur=S.samples[S.sampleId];
  h+='<div class="work"><div class="samples" role="list">'+smp.map(s=>{const f=sampleFlags(s,p);const d=sampleChemDone(s,p);const live=s.live&&Date.now()-s.live.at<90000&&s.live.by!==S.me.id;
      return '<button class="sbtn'+(s.id===S.sampleId?' on':'')+'" data-sample="'+s.id+'"><span><b>'+esc(s.code)+'</b>'+(s.extra?' <span class="pill warn">extra</span>':'')+'<br><span class="small muted">'+(s.tank?'Tank '+esc(s.tank):'Batch '+esc(s.batch||s.n))+(live?' · <span class="live-dot"></span> '+esc(person(s.live.by).name.split(' ')[0]):'')+'</span></span>'+
      (f?'<span class="pill bad">'+f+'</span>':d?'<span class="pill ok">Done</span>':'<span class="pill">Open</span>')+'</button>'}).join('')+'</div>';
  h+='<div class="card" id="sampleForm">'+sampleForm(cur,p,ss)+'</div>';
  h+='<div class="side">'+notesPanel(cur)+'</div></div>';
  h+=signoffHTML(ss,smp);
  return h+'</div>';
}
function catName(p){return ({product:'Product',water:'Water',swab:'Swab',raw:'Raw material'})[(p&&p.category)||'product']}
const CATS=[['product','Products from the line'],['water','Water'],['swab','Swabs'],['raw','Raw materials']];
function catSel(){return S.cat||(S.cat=lsGet('lab.cat')||'product')}
function kindSel(){return S.kind||(S.kind=lsGet('lab.kind')||'all')}
function catOfP(p){return (p&&p.category)||'product'}
function catOfS(x){return catOfP(product(x.productId))}
function inCat(x){const c=catSel();return c==='all'||catOfS(x)===c}
function catLabel(c){return c==='all'?'All':(CATS.find(x=>x[0]===c)||[,''])[1]}
function kindOk(t){const k=kindSel();return !t||k==='all'||(k==='micro'?t.kind==='micro':t.kind!=='micro')}
function catBar(){const d=today();const cnt=c=>Object.values(S.sessions).filter(x=>x.date===d&&(c==='all'||catOfS(x)===c)).length;
  return '<div class="catbar" role="tablist" aria-label="Category">'+CATS.concat([['all','All']]).map(([k,n])=>'<button class="cat'+(catSel()===k?' on':'')+'" data-cat="'+k+'" role="tab" aria-selected="'+(catSel()===k)+'"><span class="ci ci-'+k+'" aria-hidden="true"></span>'+n+(cnt(k)?'<span class="badge">'+cnt(k)+'</span>':'')+'</button>').join('')+'</div>'}
function kindBar(){return '<div class="kindbar" role="tablist" aria-label="Test type">'+[['all','Chemical + Micro'],['chem','Chemical'],['micro','Microbiology']].map(([k,n])=>'<button class="kind'+(kindSel()===k?' on':'')+'" data-kind="'+k+'">'+n+'</button>').join('')+'</div>'}
function everyText(n){n=Number(n);return n===7?'week':n===14?'2 weeks':n===30||n===31?'month':n+' days'}
function kv(k,v,cls){return '<div class="kv"><span class="label">'+k+'</span><b>'+esc(v)+'</b></div>'}
function sampleForm(s,p,ss){
  let h='<div class="row between"><div><span class="label">Sample</span><h2 class="mono">'+esc(s.code)+'</h2></div><div class="row small">'+
    '<label class="row">Tank <input id="sm-tank" value="'+esc(s.tank||'')+'" style="width:70px"></label><label class="row">Batch <input id="sm-batch" value="'+esc(s.batch||'')+'" style="width:70px"></label>'+
    (isDoctor()?'<label class="row">Assign <select id="sm-assign"><option value="">Anyone</option>'+Object.values(S.people).filter(x=>x.active!==false&&x.canTest).map(x=>'<option value="'+x.id+'"'+(s.assignedTo===x.id?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label>':(s.assignedTo?'<span class="pill acc">Assigned to '+esc(person(s.assignedTo).name)+'</span>':''))+
    '</div></div>';
  if(s.extra)h+='<p class="small"><span class="pill warn">Extra sample</span> '+esc(s.reason||'')+'</p>';
  const groups=[['chem','Chemical'],['org','Organoleptic'],['micro','Microbiology']];
  if(testsOf(p,'micro').length&&testsOf(p).some(t=>t.kind!=='micro'))h+=kindBar();
  groups.forEach(([k,name])=>{const ts=testsOf(p,k);if(!ts.length||!kindOk({kind:k}))return;
    h+='<div class="group-h"><h3>'+name+'</h3>'+(k==='micro'?'<span class="small muted">Fill in when the plates are read</span>':'')+'</div>';
    ts.forEach(t=>h+=testRow(s,t))});
  if(!testsOf(p).length)h+='<p class="muted">No tests are set up for this product yet. A lab manager can add them under Tests &amp; limits.</p>';
  const rts=(s.retests||[]);
  if(rts.length)h+='<div class="group-h"><h3>Retests</h3></div>'+rts.map(r=>'<div class="note"><b>'+esc(r.testName)+'</b> · '+esc(person(r.by).name)+' · '+niceDate(r.date)+' '+hhmm(r.at)+'<br>Why: '+esc(r.reason)+'<br><span class="small muted">First result: '+esc(r.oldText||'–')+'</span>'+filesHTML(r.files)+'</div>').join('');
  return h;
}
function testRow(s,t){
  const r=resultOf(s,t);
  if(t.everyDays&&!testActive(s,t))return '<div class="test off" data-test="'+t.id+'"><div><b>'+esc(t.name)+'</b> <span class="pill">every '+esc(everyText(t.everyDays))+'</span><div class="small muted">Not due today · next on '+niceDate(nextDue(s,t))+'</div></div><div></div><div class="row"><button class="ghost" data-mon="'+t.id+'">Do it today</button></div></div>';
  let h='<div class="test" data-test="'+t.id+'"><div><b>'+esc(t.name)+'</b>'+(t.optional?' <span class="pill">'+esc(t.freq||'optional')+'</span>':'')+
    '<div class="small muted">'+esc([t.method,t.solution].filter(Boolean).join(' · '))+'</div>'+
    ((t.consts||[]).length?'<div class="small muted mono">'+t.consts.map(c=>{const x=c.sol&&solOf(c.sol);return x?'<span class="solchip">'+esc(x.name)+' '+esc(String(constVal(c,resultOf(s,t).k)))+' '+esc(x.unit||'N')+'</span>':esc(c.label||c.key)+' '+esc(c.value)}).join(' · ')+'</div>':'')+
    (t.kind==='micro'&&t.incubDays?'<div class="small muted">Read on '+niceDate(addDays(s.date,Number(t.incubDays)))+'</div>':'')+'</div><div>';
  if(t.kind==='org'){
    h+='<div class="ins"><label>Result<select data-org="'+t.id+'"><option value="">–</option>'+['Acceptable','Not acceptable'].map(o=>'<option'+(r.value===o?' selected':'')+'>'+o+'</option>').join('')+'</select></label><label style="flex:1">Comment<input data-orgc="'+t.id+'" value="'+esc(r.comment||'')+'" style="width:100%"></label></div>';
    if(r.value==='Not acceptable')h+='<div class="outs"><span class="out bad">Not acceptable</span></div>';
  }else{
    const outs=computeTest(t,r.in,r.k);
    const single=t.inputs.length===1&&t.outputs.length===1&&(!t.outputs[0].formula||t.outputs[0].formula===t.inputs[0].key);
    h+='<div class="ins">'+t.inputs.map(i=>{const st=single?outs[0].state:'';return '<label>'+esc(i.label)+(i.unit?' ('+esc(i.unit)+')':'')+'<input class="num'+(st==='bad'?' bad':'')+'" inputmode="decimal" data-in="'+t.id+'" data-key="'+esc(i.key)+'" value="'+esc(r.in&&r.in[i.key]!=null?r.in[i.key]:'')+'"></label>'}).join('')+'</div>';
    h+='<div class="outs">'+outs.map(o=>{if(single&&o.value==null)return'<span class="out muted small">Limit '+(limitText(t.outputs[0])||'none')+'</span>';const lt=limitText(t.outputs.find(x=>x.key===o.key)||{});return '<span class="out '+o.state+'" title="'+(lt?'Limit '+esc(lt):'No limit set')+'">'+esc(o.label)+': '+(o.value==null?'–':isNaN(o.value)?'check formula':fmt(o.value,o.dp))+(o.unit?' '+esc(o.unit):'')+(lt?' <span class="muted">('+esc(lt)+')</span>':'')+'</span>'}).join('')+'</div>';
  }
  h+='</div><div class="row">'+(r.by?'<span class="small muted">'+esc(person(r.by).name.split(' ')[0])+' '+hhmm(r.at)+'</span>':'')+'<button class="ghost" data-retest="'+t.id+'" title="Retest">Retest</button>'+(t.everyDays&&!testDone(s,t)?'<button class="ghost" data-moff="'+t.id+'">Not today</button>':'')+'</div></div>';
  return h;
}
function notesPanel(s){
  const notes=s.notes||[];
  return '<div class="card stack"><h3>Notes &amp; files</h3><textarea id="nt-text" placeholder="What did you see? Anything unusual about this sample…"></textarea>'+
    '<div class="row between"><label class="btn small" for="nt-files">Add photo or file</label><input id="nt-files" type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" hidden><button class="primary" id="nt-add">Save note</button></div><div id="nt-chosen" class="small muted"></div>'+
    '<div class="notes-list">'+(notes.length?notes.slice().reverse().map(n=>'<div class="note"><div class="small muted">'+esc(person(n.by).name)+' · '+hhmm(n.at)+'</div>'+esc(n.text).replace(/\n/g,'<br>')+filesHTML(n.files)+'</div>').join(''):'<p class="small muted">No notes on this sample.</p>')+'</div></div>';
}
function signoffHTML(ss,smp){
  const testers=Object.values(S.people).filter(p=>p.active!==false&&p.canTest);
  const validators=Object.values(S.people).filter(p=>p.active!==false&&p.canValidate);
  let h='<div class="card stack"><h3>Sign-off</h3>';
  (ss.tested||[]).forEach(t=>h+='<div class="row"><span class="pill acc">Tested</span><b>'+esc(person(t.by).name)+'</b><span class="muted small">'+t.samples.map(id=>S.samples[id]?S.samples[id].code:'').filter(Boolean).join(', ')+' · '+niceDate(new Date(t.at+4*3600e3).toISOString().slice(0,10))+' '+hhmm(t.at)+'</span></div>');
  if(ss.validated)h+='<div class="row"><span class="pill ok">Validated</span><b>'+esc(person(ss.validated.by).name)+'</b><span class="muted small">'+hhmm(ss.validated.at)+(ss.validated.comment?' · '+esc(ss.validated.comment):'')+'</span></div>';
  if(smp.length&&!ss.validated)h+='<div class="row"><button id="markTested">Tested by…</button><button class="primary" id="validate">Validate…</button></div>';
  if(ss.validated&&isDoctor())h+='<div><button class="ghost" id="unvalidate">Reopen for changes</button></div>';
  return h+'</div>';
}
function bindSession(){
  const ss=S.sessions[S.sessionId];const p=product(ss.productId);
  $('[data-tab-back]').onclick=()=>{S.view=role()==='lab'?'today':'today';render()};
  $('#addSample').onclick=()=>addSample(ss,p);
  $('#editSess').onclick=()=>editSessionModal(ss);
  $('#stickers').onclick=()=>stickersModal(ss);
  document.querySelectorAll('[data-sample]').forEach(b=>b.onclick=()=>{S.sampleId=b.dataset.sample;render()});
  const mt=$('#markTested');mt&&(mt.onclick=()=>testedModal(ss));
  const va=$('#validate');va&&(va.onclick=()=>validateModal(ss));
  const uv=$('#unvalidate');uv&&(uv.onclick=()=>{ss.validated=null;saveSession(ss);render()});
  const s=S.samples[S.sampleId]; if(!s)return;
  const live=(testId,key)=>{s.live={by:S.me.id,testId,key,at:Date.now()}};
  document.querySelectorAll('[data-in]').forEach(inp=>{
    inp.addEventListener('input',()=>{const t=p.tests.find(x=>x.id===inp.dataset.in);s.results=s.results||{};const r=s.results[t.id]=s.results[t.id]||{};r.in=r.in||{};
      if(!r.k){const k=constSnap(t);if(k)r.k=k}r.in[inp.dataset.key]=inp.value.trim().replace(',','.');r.by=S.me.id;r.at=Date.now();live(t.id,inp.dataset.key);
      const row=inp.closest('.test');const tmp=document.createElement('div');tmp.innerHTML=testRow(s,t);
      row.querySelector('.outs').replaceWith(tmp.querySelector('.outs'));
      const outs=computeTest(t,r.in,r.k);if(t.inputs.length===1&&t.outputs.length===1)inp.classList.toggle('bad',outs[0].state==='bad');
      liveSave(s)});
    inp.addEventListener('focus',()=>{live(inp.dataset.in,inp.dataset.key);liveSave(s,300)});
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const all=[...document.querySelectorAll('[data-in]')];const i=all.indexOf(inp);if(all[i+1])all[i+1].focus();else inp.blur()}});
  });
  document.querySelectorAll('[data-org]').forEach(sel=>sel.onchange=()=>{s.results=s.results||{};const r=s.results[sel.dataset.org]=s.results[sel.dataset.org]||{};r.value=sel.value;r.by=S.me.id;r.at=Date.now();live(sel.dataset.org,'result');saveSample(s);S.dirty=true});
  document.querySelectorAll('[data-orgc]').forEach(inp=>inp.addEventListener('input',()=>{s.results=s.results||{};const r=s.results[inp.dataset.orgc]=s.results[inp.dataset.orgc]||{};r.comment=inp.value;live(inp.dataset.orgc,'comment');liveSave(s)}));
  const tk=$('#sm-tank');tk.addEventListener('input',()=>{s.tank=tk.value.trim();liveSave(s)});
  const bt=$('#sm-batch');bt.addEventListener('input',()=>{s.batch=bt.value.trim();liveSave(s)});
  const as=$('#sm-assign');as&&(as.onchange=()=>{s.assignedTo=as.value;saveSample(s);toast(as.value?'Assigned to '+person(as.value).name:'Assignment cleared')});
  document.querySelectorAll('[data-mon]').forEach(b=>b.onclick=()=>{s.on=Object.assign({},s.on,{[b.dataset.mon]:true});if(s.off)delete s.off[b.dataset.mon];saveSample(s);render()});
  document.querySelectorAll('[data-moff]').forEach(b=>b.onclick=()=>{s.off=Object.assign({},s.off,{[b.dataset.moff]:true});if(s.on)delete s.on[b.dataset.moff];saveSample(s);render()});
  document.querySelectorAll('[data-retest]').forEach(b=>b.onclick=()=>retestModal(s,p.tests.find(x=>x.id===b.dataset.retest)));
  /* notes */
  let chosen=[];const fi=$('#nt-files');fi.onchange=()=>{chosen=[...fi.files];$('#nt-chosen').textContent=chosen.map(f=>f.name).join(', ')};
  $('#nt-add').onclick=async()=>{const text=$('#nt-text').value.trim();if(!text&&!chosen.length){toast('Write a note or choose a file first.');return}
    $('#nt-add').disabled=true;const files=await uploadFiles(chosen);s.notes=(s.notes||[]).concat([{text,files,by:S.me.id,at:Date.now()}]);saveSample(s);S.dirty=false;render();toast('Note saved')};
}
function nextCode(p,smp){return (p?p.code:'S')+(smp.length+1)}
function addSample(ss,p){
  const smp=sessionSamples(ss.id);const left=(Number(ss.batches)||0)-smp.length;
  const make=(extra,reason)=>{const n=smp.length+1;const s={id:uid('m'),sessionId:ss.id,date:ss.date,productId:ss.productId,n,code:(p?p.code:'S')+n,tank:ss.tank||'',batch:extra?'':String(n),extra:!!extra,reason:reason||'',results:{},notes:[],retests:[],createdBy:S.me.id,createdAt:Date.now()};
    saveSample(s);S.sampleId=s.id;render();toast('Sample '+s.code+' added'+(left-1>0?' · '+(left-1)+' left':''))};
  if(left>0)return make(false);
  modal('<h2>Add an extra sample</h2><p class="muted">All '+(ss.batches||0)+' batches already have a sample. Say why you are taking another.</p><form id="exf" class="stack"><label class="field"><span>Reason</span><textarea id="ex-r" required placeholder="e.g. Tank 3 topped up, second check after mixing"></textarea></label><div class="row" style="justify-content:flex-end"><button type="button" data-close>Cancel</button><button class="primary">Add extra sample</button></div></form>',(bg,close)=>{
    bg.querySelector('#exf').onsubmit=e=>{e.preventDefault();const r=bg.querySelector('#ex-r').value.trim();if(!r)return;close();make(true,r)}});
}
function editSessionModal(ss){
  modal('<h2>Edit details</h2><form id="esf" class="stack"><div class="row"><label class="field" style="flex:1"><span>Lot number</span><input id="es-l" value="'+esc(ss.lot||'')+'"></label><label class="field" style="flex:1"><span>Batches expected</span><input id="es-b" type="number" value="'+esc(ss.batches||'')+'"></label></div><div class="row"><label class="field" style="flex:1"><span>Tank</span><input id="es-t" value="'+esc(ss.tank||'')+'"></label><label class="field" style="flex:1"><span>Date</span><input id="es-d" type="date" value="'+esc(ss.date)+'"></label></div>'+
   '<div class="row between">'+(isDoctor()?'<button type="button" class="danger" id="es-del">Delete this test record</button>':'<span></span>')+'<div class="row"><button type="button" data-close>Cancel</button><button class="primary">Save</button></div></div><p id="es-confirm" class="small"></p></form>',(bg,close)=>{
    bg.querySelector('#esf').onsubmit=e=>{e.preventDefault();ss.lot=bg.querySelector('#es-l').value.trim();ss.batches=Number(bg.querySelector('#es-b').value)||0;ss.tank=bg.querySelector('#es-t').value.trim();ss.date=bg.querySelector('#es-d').value||ss.date;saveSession(ss);sessionSamples(ss.id).forEach(s=>{if(s.date!==ss.date){s.date=ss.date;saveSample(s)}});close();render()};
    const del=bg.querySelector('#es-del');let armed=false;del&&(del.onclick=()=>{if(!armed){armed=true;del.textContent='Press again to delete it and all its samples';return}
      sessionSamples(ss.id).forEach(s=>{delete S.samples[s.id];queueWrite('samples/'+s.id,null,'delete')});delete S.sessions[ss.id];queueWrite('sessions/'+ss.id,null,'delete');close();S.view='today';render()})});
}
function resultText(s,t){const r=resultOf(s,t);if(t.kind==='org')return (r.value||'–')+(r.comment?' ('+r.comment+')':'');const outs=computeTest(t,r.in,r.k);return outs.map(o=>o.label+' '+fmt(o.value,o.dp)).join(', ')+' · inputs '+Object.entries(r.in||{}).map(([k,v])=>k+'='+v).join(' ')}
function retestModal(s,t){
  modal('<h2>Retest '+esc(t.name)+' · '+esc(s.code)+'</h2><p class="small muted">The first result is kept in the record. The test fields are cleared so you can enter the new reading.</p><p class="small">First result: <span class="mono">'+esc(resultText(s,t))+'</span></p><form id="rtf" class="stack"><label class="field"><span>Why are you retesting?</span><textarea id="rt-r" required placeholder="e.g. Endpoint overshot, burette air bubble"></textarea></label><label class="field"><span>Photo (optional)</span><input id="rt-f" type="file" accept="image/*,application/pdf" multiple></label><div class="row" style="justify-content:flex-end"><button type="button" data-close>Cancel</button><button class="primary">Start retest</button></div></form>',(bg,close)=>{
    bg.querySelector('#rtf').onsubmit=async e=>{e.preventDefault();const reason=bg.querySelector('#rt-r').value.trim();if(!reason)return;e.submitter&&(e.submitter.disabled=true);
      const files=await uploadFiles([...bg.querySelector('#rt-f').files]);
      s.retests=(s.retests||[]).concat([{testId:t.id,testName:t.name,old:JSON.parse(JSON.stringify(resultOf(s,t))),oldText:resultText(s,t),reason,files,by:S.me.id,at:Date.now(),date:today()}]);
      s.results=s.results||{};delete s.results[t.id];saveSample(s);close();render();toast('Retest started for '+t.name)}});
}
function testedModal(ss){
  const smp=sessionSamples(ss.id);const already=new Set((ss.tested||[]).flatMap(t=>t.samples));
  const testers=Object.values(S.people).filter(p=>p.active!==false&&p.canTest);
  modal('<h2>Tested by</h2><form id="tbf" class="stack"><label class="field"><span>Who tested?</span><select id="tb-p">'+testers.map(p=>'<option value="'+p.id+'"'+(p.id===S.me.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>'+
    '<div class="field"><span>Which samples?</span><div class="row">'+smp.map(s=>'<label class="row small"><input type="checkbox" value="'+s.id+'"'+(already.has(s.id)?'':' checked')+'> <span class="mono">'+esc(s.code)+'</span></label>').join('')+'</div></div>'+
    '<label class="field"><span>PIN of the person who tested</span><input id="tb-pin" type="password" inputmode="numeric" autocomplete="off"></label><p id="tb-err" class="small" style="color:var(--bad)"></p>'+
    '<div class="row" style="justify-content:flex-end"><button type="button" data-close>Cancel</button><button class="primary">Sign as tested</button></div></form>',(bg,close)=>{
    bg.querySelector('#tbf').onsubmit=e=>{e.preventDefault();const pid=bg.querySelector('#tb-p').value;if(!pinCheck(pid,bg.querySelector('#tb-pin').value)){bg.querySelector('#tb-err').textContent='PIN does not match.';return}
      const ids=[...bg.querySelectorAll('input[type=checkbox]:checked')].map(x=>x.value);if(!ids.length){bg.querySelector('#tb-err').textContent='Tick at least one sample.';return}
      ss.tested=(ss.tested||[]).concat([{by:pid,samples:ids,at:Date.now()}]);ids.forEach(id=>{const s=S.samples[id];s.testedBy=pid;saveSample(s)});saveSession(ss);close();render();toast('Signed as tested')}});
}
function validateModal(ss){
  const vals=Object.values(S.people).filter(p=>p.active!==false&&p.canValidate);
  const pr=sessionProgress(ss);
  modal('<h2>Validate</h2>'+(pr.bad?'<p class="note-banner">'+pr.bad+' result(s) are out of limit in this record.</p>':'')+(pr.done<pr.added?'<p class="small muted">'+(pr.added-pr.done)+' sample(s) still have chemical tests missing.</p>':'')+
    '<form id="vf" class="stack"><label class="field"><span>Validated by</span><select id="v-p">'+vals.map(p=>'<option value="'+p.id+'"'+(p.id===S.me.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label><label class="field"><span>Comment (optional)</span><input id="v-c"></label><label class="field"><span>PIN</span><input id="v-pin" type="password" inputmode="numeric" autocomplete="off"></label><p id="v-err" class="small" style="color:var(--bad)"></p>'+
    '<div class="row" style="justify-content:flex-end"><button type="button" data-close>Cancel</button><button class="primary">Validate</button></div></form>',(bg,close)=>{
    if(!vals.length)bg.querySelector('#v-err').textContent='Nobody is set up to validate yet. The admin can tick "Can validate" under People.';
    bg.querySelector('#vf').onsubmit=e=>{e.preventDefault();const pid=bg.querySelector('#v-p').value;if(!pinCheck(pid,bg.querySelector('#v-pin').value)){bg.querySelector('#v-err').textContent='PIN does not match.';return}
      ss.validated={by:pid,at:Date.now(),comment:bg.querySelector('#v-c').value.trim()};saveSession(ss);close();render();toast('Validated')}});
}

/* ---------- STICKERS (A4, 3 x 8 labels of 70 x 37 mm) ---------- */
function stickersModal(ss){
  const p=product(ss.productId);const smp=sessionSamples(ss.id);
  modal('<h2>Sample stickers</h2><p class="small muted">A4 sheet, 3 × 8 labels (70 × 37 mm), the common 24-label sticker paper. Samples you have not added yet can be included.</p>'+
    '<form id="stf" class="stack"><div class="row"><label class="field" style="flex:1"><span>Stickers per sample</span><input id="st-c" type="number" min="1" max="24" value="1"></label><label class="field" style="flex:1"><span>Number of samples</span><input id="st-n" type="number" min="1" value="'+Math.max(smp.length,Number(ss.batches)||0,1)+'"></label><label class="field" style="flex:1"><span>Skip first labels</span><input id="st-skip" type="number" min="0" max="23" value="0" title="For a sheet that is partly used"></label></div><div id="st-prev" class="sheet"></div><div class="row" style="justify-content:flex-end"><button type="button" data-close>Close</button><button class="primary">Download PDF to print</button></div><p class="small muted" id="st-msg"></p></form>',(bg,close)=>{
    const labels=()=>{const n=Number(bg.querySelector('#st-n').value)||1,c=Number(bg.querySelector('#st-c').value)||1,skip=Number(bg.querySelector('#st-skip').value)||0;const out=[];for(let i=0;i<skip;i++)out.push(null);
      for(let i=1;i<=n;i++){const s=smp[i-1];for(let k=0;k<c;k++)out.push({code:s?s.code:(p.code+i),name:p.name,date:ss.date,lot:ss.lot,tank:s?s.tank:ss.tank,batch:s?s.batch:String(i),section:ss.section})}return out};
    const prev=()=>{const L=labels().slice(0,24);bg.querySelector('#st-prev').innerHTML=L.map(l=>l?'<div class="sticker"><div><b>'+esc(l.code)+'</b> '+esc(l.section)+'</div><div>'+esc(l.name)+'</div><div>'+niceDate(l.date)+' · Lot '+esc(l.lot||'–')+(l.tank?' · Tank '+esc(l.tank):'')+'</div></div>':'<div class="sticker" style="opacity:.3"></div>').join('')+(labels().length>24?'<p class="small muted" style="grid-column:1/-1">+ '+(labels().length-24)+' more on the next sheet</p>':'')};
    prev();bg.querySelectorAll('input').forEach(i=>i.oninput=prev);
    bg.querySelector('#stf').onsubmit=async e=>{e.preventDefault();const msg=bg.querySelector('#st-msg');
      if(!window.jspdf){msg.textContent='The PDF maker did not load. Check the internet connection and reopen the page.';return}
      const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});const L=labels();const W=70,H=37.125;
      L.forEach((l,i)=>{const pos=i%24;if(i>0&&pos===0)doc.addPage();if(!l)return;const x=(pos%3)*W,y=Math.floor(pos/3)*H;
        doc.setFont('helvetica','bold');doc.setFontSize(22);doc.text(l.code,x+5,y+11);
        doc.setFontSize(9);doc.text(l.section||'',x+W-5,y+8,{align:'right'});
        doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text(l.name,x+5,y+18,{maxWidth:W-10});
        doc.text(niceDate(l.date)+'   Lot '+(l.lot||'-'),x+5,y+25);
        doc.text((l.tank?'Tank '+l.tank+'   ':'')+(l.batch?'Batch '+l.batch:''),x+5,y+31)});
      const blob=doc.output('blob');const fname='stickers-'+(p.code||'')+'-'+ss.date+(ss.lot?'-lot'+ss.lot:'')+'.pdf';
      if(!S.downloads){msg.textContent='Saving files is not available in this view.';return}
      try{await S.downloads.save({filename:fname,data:blob});msg.textContent='Saved '+fname+'. Print it at 100% scale (no "fit to page").'}catch(err){msg.textContent=err.code==='cancelled'||err.code==='declined'?'Download cancelled.':'Could not save the file ('+(err.code||err.message)+').'}}});
}

/* ---------- OVERVIEW (doctor) ---------- */
function overviewView(){
  const d=today();const note=S.daynotes[d]||{};
  const sessAll=Object.values(S.sessions).filter(s=>s.date===d);const sess=sessAll.filter(inCat);
  const all=sess.map(s=>({s,pr:sessionProgress(s)}));
  const tgt=all.reduce((a,x)=>a+x.pr.target,0),done=all.reduce((a,x)=>a+x.pr.done,0),bad=all.reduce((a,x)=>a+x.pr.bad,0);
  const live=Object.values(S.samples).filter(s=>inCat(s)&&s.live&&Date.now()-s.live.at<120000).sort((a,b)=>b.live.at-a.live.at);
  const recent=Object.values(S.samples).filter(s=>s.date===d&&inCat(s)).flatMap(s=>{const p=product(s.productId);return Object.entries(s.results||{}).map(([tid,r])=>({s,p,t:(p&&p.tests||[]).find(x=>x.id===tid),r}))}).filter(x=>x.t&&x.r.at&&kindOk(x.t)).sort((a,b)=>b.r.at-a.r.at).slice(0,14);
  const tiles=CATS.map(([k,n])=>{const ss=sessAll.filter(x=>catOfS(x)===k);const pr=ss.map(sessionProgress);const t=pr.reduce((a,x)=>a+x.target,0),dn=pr.reduce((a,x)=>a+x.done,0),b=pr.reduce((a,x)=>a+x.bad,0),m=pr.reduce((a,x)=>a+x.micro,0);
    return '<button class="ctile ct-'+k+(catSel()===k?' on':'')+'" data-cat="'+k+'"><span class="ci ci-'+k+'" aria-hidden="true"></span><b>'+n+'</b><span class="num big">'+dn+' / '+t+'</span><span class="small">'+(ss.length?ss.length+' running':'Nothing today')+'</span><span class="row small">'+(b?'<span class="pill bad">'+b+' out of limit</span>':'')+(m?'<span class="pill warn">'+m+' micro pending</span>':'')+'</span></button>'}).join('');
  let h='<div class="stack"><h1>Live overview · '+niceDate(d)+'</h1><div class="ctiles">'+tiles+'</div>'+catBar()+kindBar()+'<h2>'+esc(catLabel(catSel()))+'</h2>';
  h+='<div class="card row between"><div class="row"><b class="num" style="font-size:22px">'+done+' / '+tgt+'</b><span>samples tested today</span>'+(bad?'<span class="pill bad">'+bad+' out of limit</span>':'<span class="pill ok">No results out of limit</span>')+'</div><div class="bar" style="flex:1;min-width:120px;max-width:360px"><i style="width:'+(tgt?Math.round(100*done/tgt):0)+'%"></i></div></div>';
  h+='<div class="card stack"><h3>Note for the lab today</h3><textarea id="dn" placeholder="Shown at the top of the lab’s Today page">'+esc(note.text||'')+'</textarea><div class="row between"><span class="small muted">'+(note.at?'Last saved '+hhmm(note.at):'')+'</span><button class="primary" id="dnSave">Save note</button></div></div>';
  h+='<div class="card stack"><div class="row between"><h3>Working right now</h3><span class="small muted">Updates as they type</span></div>'+(live.length?'<table><tr><th>Who</th><th>Sample</th><th>Test</th><th>Entry</th><th>When</th></tr>'+live.map(s=>{const p=product(s.productId);const t=(p&&p.tests||[]).find(x=>x.id===s.live.testId);const r=resultOf(s,t||{});const val=t&&t.kind==='org'?(r.value||''):(r.in?Object.entries(r.in).map(([k,v])=>k+'='+v).join(' '):'');
      return '<tr><td><span class="live-dot"></span> '+esc(person(s.live.by).name)+'</td><td><button class="ghost" data-open-sample="'+s.id+'"><b class="mono">'+esc(s.code)+'</b></button> <span class="small muted">'+esc(p?p.name:'')+'</span></td><td>'+esc(t?t.name:'')+'</td><td class="mono small">'+esc(val)+'</td><td class="small muted">'+ago(s.live.at)+'</td></tr>'}).join('')+'</table>':'<p class="muted small">Nobody is typing at the moment.</p>')+'</div>';
  h+='<h2>Today’s testing</h2>'+(all.length?'<div class="grid">'+sess.map(sessCard).join('')+'</div>':'<div class="card muted">The lab has not started anything today.</div>');
  h+='<div class="card stack"><h3>Latest entries</h3>'+(recent.length?'<div class="tablewrap"><table><tr><th>Time</th><th>Sample</th><th>Test</th><th>Result</th><th>By</th></tr>'+recent.map(x=>{const st=x.t.kind==='org'?(x.r.value==='Not acceptable'?'bad':''):computeTest(x.t,x.r.in,x.r.k).some(o=>o.state==='bad')?'bad':'';
      return '<tr><td class="num small">'+hhmm(x.r.at)+'</td><td><button class="ghost" data-open-sample="'+x.s.id+'"><b class="mono">'+esc(x.s.code)+'</b></button></td><td>'+esc(x.t.name)+'</td><td class="mono small"><span class="out '+st+'">'+esc(x.t.kind==='org'?(x.r.value||''):computeTest(x.t,x.r.in,x.r.k).map(o=>o.label+' '+fmt(o.value,o.dp)).join(' · '))+'</span></td><td class="small">'+esc(person(x.r.by).name)+'</td></tr>'}).join('')+'</table></div>':'<p class="muted small">No results entered today.</p>')+'</div>';
  return h+'</div>';
}
function bindOverview(){
  $('#dnSave').onclick=()=>{const d=today();const v={text:$('#dn').value.trim(),by:S.me.id,at:Date.now()};S.daynotes[d]=v;queueWrite('daynotes/'+d,v);S.dirty=false;toast('Note saved for the lab')};
  bindCommon();
}

/* ---------- RECORDS ---------- */
let histFilter={product:'',from:addDays(dubaiToday(),-30)};
function historyView(){
  const ss=Object.values(S.sessions).filter(s=>inCat(s)&&(!histFilter.product||s.productId===histFilter.product)&&s.date>=histFilter.from).sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||0)-(a.createdAt||0));
  let h='<div class="stack">'+catBar()+'<div class="row between"><h1>Records · '+esc(catLabel(catSel()))+'</h1><div class="row"><select id="hf-p"><option value="">All</option>'+(S.cfg.products||[]).filter(p=>catSel()==='all'||catOfP(p)===catSel()).map(p=>'<option value="'+p.id+'"'+(histFilter.product===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select><label class="row small">From <input id="hf-f" type="date" value="'+histFilter.from+'"></label></div></div>';
  if(!ss.length)return h+'<div class="card muted">No records in this period.</div></div>';
  h+='<div class="card tablewrap"><table><tr><th>Date</th><th>Product</th><th>Section</th><th>Lot</th><th>Samples</th><th>Out of limit</th><th>Micro</th><th>Status</th></tr>'+ss.map(s=>{const p=product(s.productId);const pr=sessionProgress(s);
    return '<tr><td class="num">'+esc(s.date)+'</td><td><button class="ghost" data-open-session="'+s.id+'">'+esc(p?p.name:'?')+'</button></td><td>'+esc(s.section)+'</td><td class="num">'+esc(s.lot||'–')+'</td><td class="num">'+pr.done+'/'+pr.target+'</td><td>'+(pr.bad?'<span class="pill bad">'+pr.bad+'</span>':'<span class="muted">0</span>')+'</td><td>'+(pr.micro?'<span class="pill warn">'+pr.micro+' pending</span>':'<span class="muted">–</span>')+'</td><td>'+statusPill(s)+'</td></tr>'}).join('')+'</table></div>';
  return h+'</div>';
}
function bindHistory(){$('#hf-p').onchange=e=>{histFilter.product=e.target.value;render()};$('#hf-f').onchange=e=>{histFilter.from=e.target.value||histFilter.from;render()};bindCommon()}

/* ---------- MICRO PENDING ---------- */
function microList(){return Object.values(S.samples).flatMap(s=>{const p=product(s.productId);return sampleMicroPending(s,p).map(t=>({s,p,t,ready:addDays(s.date,Number(t.incubDays)||0)}))}).sort((a,b)=>a.ready.localeCompare(b.ready))}
function microPendingCount(){const d=today();return microList().filter(x=>x.ready<=d).length}
function microView(){
  const L=microList().filter(x=>catSel()==='all'||catOfP(x.p)===catSel());const d=today();
  let h='<div class="stack">'+catBar()+'<div><h1>Microbiology pending · '+esc(catLabel(catSel()))+'</h1><p class="muted">Plates waiting to be read. Ready items are counted on the tab.</p></div>';
  if(!L.length)return h+'<div class="card muted">No microbiology results are waiting.</div></div>';
  h+='<div class="card tablewrap"><table><tr><th>Read on</th><th>Sample</th><th>Product</th><th>Lot</th><th>Test</th><th></th></tr>'+L.map(x=>{const ss=S.sessions[x.s.sessionId]||{};
    return '<tr><td class="num">'+(x.ready<=d?'<span class="pill warn">'+niceDate(x.ready)+'</span>':niceDate(x.ready))+'</td><td class="mono"><b>'+esc(x.s.code)+'</b> <span class="small muted">'+esc(x.s.date)+'</span></td><td>'+esc(x.p?x.p.name:'')+'</td><td class="num">'+esc(ss.lot||'–')+'</td><td>'+esc(x.t.name)+'</td><td><button class="ghost" data-open-sample="'+x.s.id+'">Enter result</button></td></tr>'}).join('')+'</table></div>';
  return h+'</div>';
}
function bindMicro(){bindCommon()}

/* ---------- TASKS ---------- */
function tasksView(){
  const ts=Object.values(S.tasks).sort((a,b)=>(a.done-b.done)||(b.at-a.at));
  const mine=isDoctor()?ts:ts.filter(t=>!t.to||t.to===S.me.id);
  let h='<div class="stack"><h1>Tasks</h1>';
  if(isDoctor()){
    const todaySess=Object.values(S.sessions).filter(s=>s.date>=addDays(today(),-3));
    h+='<div class="card stack"><h3>Send a task to the lab</h3><form id="tf" class="stack"><textarea id="tf-t" required placeholder="e.g. Repeat Brix on GM tank 4 before 11:00"></textarea><div class="row"><label class="field" style="flex:1"><span>For</span><select id="tf-to"><option value="">Whole lab</option>'+Object.values(S.people).filter(p=>p.active!==false&&p.role==='lab').map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('')+'</select></label><label class="field" style="flex:1"><span>About (optional)</span><select id="tf-s"><option value="">–</option>'+todaySess.map(s=>'<option value="'+s.id+'">'+esc(s.date+' · '+sessLabel(s))+'</option>').join('')+'</select></label></div><div class="row" style="justify-content:flex-end"><button class="primary">Send task</button></div></form></div>';
  }
  h+=mine.length?'<div class="card tablewrap"><table><tr><th>Task</th><th>For</th><th>From</th><th>Sent</th><th>Status</th></tr>'+mine.map(t=>'<tr><td>'+esc(t.text)+(t.sessionId&&S.sessions[t.sessionId]?'<br><button class="ghost small" data-open-session="'+t.sessionId+'">'+esc(sessLabel(S.sessions[t.sessionId]))+'</button>':'')+'</td><td>'+esc(t.to?person(t.to).name:'Whole lab')+'</td><td>'+esc(person(t.from).name)+'</td><td class="small num">'+esc(new Date(t.at+4*3600e3).toISOString().slice(0,10))+' '+hhmm(t.at)+'</td><td>'+(t.done?'<span class="pill ok">Done · '+esc(person(t.doneBy).name.split(' ')[0])+'</span>':'<button data-taskdone="'+t.id+'">Mark done</button>')+'</td></tr>').join('')+'</table></div>':'<div class="card muted">No tasks.</div>';
  return h+'</div>';
}
function bindTasks(){const f=$('#tf');f&&(f.onsubmit=e=>{e.preventDefault();const text=$('#tf-t').value.trim();if(!text)return;const t={id:uid('t'),text,to:$('#tf-to').value,sessionId:$('#tf-s').value,from:S.me.id,at:Date.now(),done:false};S.tasks[t.id]=t;queueWrite('tasks/'+t.id,strip(t));S.dirty=false;render();toast('Task sent')});bindCommon()}

/* ---------- SETUP: products, tests, formulas, limits ---------- */
function draft(){if(!S.cfgDraft)S.cfgDraft=JSON.parse(JSON.stringify(S.cfg));return S.cfgDraft}
function setupView(){
  const c=draft();const prods=c.products||[];
  if(!S.setupProduct||!prods.find(p=>p.id===S.setupProduct))S.setupProduct=prods[0]&&prods[0].id;
  const p=prods.find(x=>x.id===S.setupProduct);
  const changedCfg=JSON.stringify(c)!==JSON.stringify(S.cfg);
  let h='<div class="stack"><div class="row between"><div><h1>Tests &amp; limits</h1><p class="muted">Each product keeps its own tests, solutions, formulas and limits. Results outside a limit show red.</p></div><div class="row">'+(changedCfg?'<span class="pill warn">Unsaved changes</span><button id="cfgReset">Discard</button>':'')+'<button class="primary" id="cfgSave"'+(changedCfg?'':' disabled')+'>Save changes</button></div></div>';
  h+='<div class="row"><select id="su-p">'+prods.map(x=>'<option value="'+x.id+'"'+(x.id===S.setupProduct?' selected':'')+'>'+esc(x.name)+' ('+esc(x.code)+')</option>').join('')+'</select><button id="su-addp">Add product / sample type</button></div>';
  if(!p)return h+'</div>';
  h+='<div class="card ed-row"><label class="field"><span>Name</span><input data-pf="name" value="'+esc(p.name)+'"></label><label class="field"><span>Sticker code</span><input data-pf="code" value="'+esc(p.code)+'"></label><label class="field"><span>Type</span><select data-pf="category">'+[['product','Product'],['water','Water'],['swab','Swab'],['raw','Raw material']].map(o=>'<option value="'+o[0]+'"'+((p.category||'product')===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></label><label class="field"><span>Standard</span><input data-pf="standard" value="'+esc(p.standard||'')+'"></label></div>';
  (p.tests||[]).forEach((t,ti)=>h+=testEditor(t,ti));
  h+='<div class="row"><button data-addtest="chem">Add chemical test</button><button data-addtest="micro">Add micro test</button><button data-addtest="org">Add organoleptic check</button></div>';
  h+='<details class="small muted"><summary>How formulas work</summary><p>Use the short names of the readings and solutions, for example <span class="formula">C*V/30*192.12</span>. You can use + − * / ( ) and a result name from a line above it (such as <span class="formula">density</span>). The live check under each test shows the answer for the example numbers you type.</p></details>';
  return h+'</div>';
}
function testEditor(t,ti){
  const ex=t._ex||{};
  const outs=t.kind==='org'?[]:computeTest(t,ex);
  let h='<div class="testcard" data-ti="'+ti+'"><div class="row between"><div class="row"><span class="pill acc">'+({chem:'Chemical',micro:'Micro',org:'Organoleptic'})[t.kind]+'</span><input data-tf="name" value="'+esc(t.name)+'" style="font-weight:700;min-width:200px"></div><div class="row"><button class="ghost" data-mv="-1" title="Move up">↑</button><button class="ghost" data-mv="1" title="Move down">↓</button><button class="ghost danger" data-deltest>Remove</button></div></div>';
  h+='<div class="ed-row"><label class="field"><span>Method</span><input data-tf="method" value="'+esc(t.method||'')+'"></label><label class="field"><span>Solution / medium</span><input data-tf="solution" value="'+esc(t.solution||'')+'"></label>'+
    (t.kind==='micro'?'<label class="field"><span>Read after (days)</span><input data-tf="incubDays" type="number" value="'+esc(t.incubDays||'')+'"></label><label class="field"><span>How often</span><select data-tf="everyDays">'+[['','Every sample'],['7','Once a week'],['14','Every 2 weeks'],['30','Once a month']].map(o=>'<option value="'+o[0]+'"'+(String(t.everyDays||'')===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></label>':'')+
    '<label class="field"><span>Frequency</span><input data-tf="freq" value="'+esc(t.freq||'')+'" placeholder="every batch"></label><label class="row small"><input type="checkbox" data-tf="optional"'+(t.optional?' checked':'')+'> Not needed on every sample</label></div>';
  if(t.kind==='org')return h+'<p class="small muted">Technicians choose Acceptable or Not acceptable and can comment. Not acceptable shows red.</p></div>';
  h+='<div class="label">Readings the technician types</div>'+(t.inputs||[]).map((i,k)=>'<div class="ed-row" data-row="inputs" data-k="'+k+'"><label class="field"><span>Short name</span><input class="formula" data-rf="key" value="'+esc(i.key)+'"></label><label class="field"><span>Label</span><input data-rf="label" value="'+esc(i.label)+'"></label><label class="field"><span>Unit</span><input data-rf="unit" value="'+esc(i.unit||'')+'"></label><label class="field"><span>Example</span><input class="num" data-ex="'+esc(i.key)+'" value="'+esc(ex[i.key]||'')+'"></label><button class="ghost danger" data-delrow>Remove</button></div>').join('')+'<div><button class="ghost" data-addrow="inputs">+ Reading</button></div>';
  h+='<div class="label">Solutions and fixed values</div>'+(t.consts||[]).map((c,k)=>'<div class="ed-row" data-row="consts" data-k="'+k+'"><label class="field"><span>Short name</span><input class="formula" data-rf="key" value="'+esc(c.key)+'"></label><label class="field"><span>Label</span><input data-rf="label" value="'+esc(c.label||'')+'"></label><label class="field"><span>Value</span><input class="num" data-rf="value" value="'+esc(c.value)+'"></label><label class="field"><span>Unit</span><input data-rf="unit" value="'+esc(c.unit||'')+'"></label><button class="ghost danger" data-delrow>Remove</button></div>').join('')+'<div><button class="ghost" data-addrow="consts">+ Solution or value</button></div>';
  h+='<div class="label">Results and limits</div>'+(t.outputs||[]).map((o,k)=>'<div class="ed-row" data-row="outputs" data-k="'+k+'"><label class="field"><span>Result name</span><input data-rf="label" value="'+esc(o.label)+'"></label><label class="field" style="grid-column:span 2"><span>Formula</span><input class="formula" data-rf="formula" value="'+esc(o.formula||'')+'"></label><label class="field"><span>Unit</span><input data-rf="unit" value="'+esc(o.unit||'')+'"></label><label class="field"><span>Min</span><input class="num" data-rf="min" value="'+esc(o.min==null?'':o.min)+'"></label><label class="field"><span>Max</span><input class="num" data-rf="max" value="'+esc(o.max==null?'':o.max)+'"></label><label class="field"><span>Decimals</span><input class="num" data-rf="dp" type="number" value="'+esc(o.dp==null?2:o.dp)+'"></label><label class="field"><span>Short name</span><input class="formula" data-rf="key" value="'+esc(o.key||'')+'"></label><button class="ghost danger" data-delrow>Remove</button></div>'+(o.past?'<div class="small muted">Past records: '+esc(o.past)+'</div>':'')).join('')+'<div><button class="ghost" data-addrow="outputs">+ Result</button></div>';
  h+='<div class="outs"><span class="small muted">Check with the example numbers:</span>'+outs.map(o=>'<span class="out '+o.state+'">'+esc(o.label)+': '+(o.value==null?'enter examples':isNaN(o.value)?'formula error':fmt(o.value,o.dp))+'</span>').join('')+'</div>';
  return h+'</div>';
}
function bindSetup(){
  const c=draft();const p=(c.products||[]).find(x=>x.id===S.setupProduct);
  const rerender=()=>{const y=window.scrollY;render();window.scrollTo(0,y)};
  $('#su-p').onchange=e=>{S.setupProduct=e.target.value;render()};
  $('#cfgSave').onclick=async()=>{const clean=JSON.parse(JSON.stringify(c,(k,v)=>k==='_ex'?undefined:v));try{await S.db.doc('config/main').set(clean);S.cfg=clean;S.cfgDraft=null;toast('Tests and limits saved');render()}catch(e){toast('Could not save: '+(e.code||e.message))}};
  const rs=$('#cfgReset');rs&&(rs.onclick=()=>{S.cfgDraft=null;render()});
  $('#su-addp').onclick=()=>modal('<h2>Add product or sample type</h2><form id="apf" class="stack"><label class="field"><span>Name</span><input id="ap-n" required></label><div class="row"><label class="field" style="flex:1"><span>Sticker code</span><input id="ap-c" required placeholder="e.g. HU"></label><label class="field" style="flex:1"><span>Type</span><select id="ap-t"><option value="product">Product</option><option value="water">Water</option><option value="swab">Swab</option><option value="raw">Raw material</option></select></label></div><div class="row" style="justify-content:flex-end"><button type="button" data-close>Cancel</button><button class="primary">Add</button></div></form>',(bg,close)=>{bg.querySelector('#apf').onsubmit=e=>{e.preventDefault();const np={id:uid('p'),name:bg.querySelector('#ap-n').value.trim(),code:bg.querySelector('#ap-c').value.trim().toUpperCase(),category:bg.querySelector('#ap-t').value,tests:[]};c.products.push(np);S.setupProduct=np.id;close();render()}});
  if(!p)return;
  document.querySelectorAll('[data-pf]').forEach(i=>i.addEventListener('change',()=>{p[i.dataset.pf]=i.dataset.pf==='code'?i.value.trim().toUpperCase():i.value;rerender()}));
  document.querySelectorAll('[data-addtest]').forEach(b=>b.onclick=()=>{const k=b.dataset.addtest;p.tests=p.tests||[];
    p.tests.push(k==='org'?{id:uid('t'),kind:'org',name:'Taste, smell, appearance'}:k==='micro'?{id:uid('t'),kind:'micro',name:'New micro test',incubDays:2,inputs:[{key:'cfu',label:'Count',unit:'CFU/mL'}],consts:[],outputs:[{key:'count',label:'Count',formula:'cfu',unit:'CFU/mL',min:'',max:'',dp:0}]}:{id:uid('t'),kind:'chem',name:'New test',inputs:[{key:'x',label:'Reading',unit:''}],consts:[],outputs:[{key:'result',label:'Result',formula:'x',unit:'',min:'',max:'',dp:2}]});rerender()});
  document.querySelectorAll('.testcard').forEach(card=>{const t=p.tests[Number(card.dataset.ti)];
    card.querySelectorAll('[data-tf]').forEach(i=>i.addEventListener('change',()=>{const k=i.dataset.tf;t[k]=i.type==='checkbox'?i.checked:(k==='incubDays'||k==='everyDays')?Number(i.value)||0:i.value;rerender()}));
    card.querySelectorAll('[data-row]').forEach(row=>{const arr=t[row.dataset.row];const item=arr[Number(row.dataset.k)];
      row.querySelectorAll('[data-rf]').forEach(i=>i.addEventListener('change',()=>{const k=i.dataset.rf;let v=i.value.trim();if(k==='key')v=v.replace(/[^A-Za-z0-9_]/g,'_').replace(/^(\d)/,'_$1');if(k==='dp')v=Number(v);if(k==='value')v=v.replace(',','.');item[k]=v;rerender()}));
      const d=row.querySelector('[data-delrow]');d&&(d.onclick=()=>{arr.splice(Number(row.dataset.k),1);rerender()})});
    card.querySelectorAll('[data-addrow]').forEach(b=>b.onclick=()=>{const k=b.dataset.addrow;t[k]=t[k]||[];t[k].push(k==='outputs'?{key:'r'+(t[k].length+1),label:'Result',formula:'',unit:'',min:'',max:'',dp:2}:k==='consts'?{key:'C'+(t[k].length+1),label:'Concentration',value:'',unit:''}:{key:'v'+(t[k].length+1),label:'Reading',unit:''});rerender()});
    card.querySelectorAll('[data-ex]').forEach(i=>i.addEventListener('change',()=>{t._ex=t._ex||{};t._ex[i.dataset.ex]=i.value;rerender()}));
    card.querySelector('[data-deltest]').onclick=function(){if(this.dataset.armed){p.tests.splice(Number(card.dataset.ti),1);rerender()}else{this.dataset.armed=1;this.textContent='Press again to remove'}};
    card.querySelectorAll('[data-mv]').forEach(b=>b.onclick=()=>{const i=Number(card.dataset.ti),j=i+Number(b.dataset.mv);if(j<0||j>=p.tests.length)return;const tmp=p.tests[i];p.tests[i]=p.tests[j];p.tests[j]=tmp;rerender()});
  });
}

/* ---------- SOLUTIONS & FORMULAS (lab account, lab manager, admin) ---------- */
function solUsedIn(id){const L=[];(S.cfg.products||[]).forEach(p=>(p.tests||[]).forEach(t=>{if((t.consts||[]).some(c=>c.sol===id))L.push(p.code+' '+t.name)}));return L}
function keyOf(label,taken){let k=String(label||'v').replace(/[^A-Za-z0-9]/g,'').slice(0,6)||'v';if(/^\d/.test(k))k='v'+k;let n=k,i=2;while(taken.includes(n))n=k+i++;return n}
function fbKeys(t){return [].concat((t.inputs||[]).map(x=>x.key),(t.consts||[]).map(x=>x.key),(t.outputs||[]).map(x=>x.key)).filter(Boolean)}
function chemView(){
  const sol=S.sol||[];const ed=canBuild();
  let h='<div class="stack"><div><h1>Solutions &amp; formulas</h1><p class="muted">Change a concentration here after you standardise a solution: every test that uses it takes the new value. Results already entered keep the value they were made with.</p></div>';
  h+='<h2>Solutions</h2><div class="solgrid">'+sol.map(x=>{const u=solUsedIn(x.id);const last=(x.history||[]).slice(-1)[0];
    return '<div class="solcard" data-sol="'+x.id+'"><div class="soltop"><span class="flaskmini" aria-hidden="true"></span><div><b>'+esc(x.name)+'</b><div class="small muted">'+esc(x.chem||'')+'</div></div></div>'+
    '<label class="field"><span>Concentration now ('+esc(x.unit||'N')+')</span><input class="num big" data-solf="conc" value="'+esc(x.conc)+'" inputmode="decimal"'+(ed?'':' disabled')+'></label>'+
    '<div class="small muted">Nominal '+esc(x.nominal==null?'–':x.nominal)+' '+esc(x.unit||'N')+(last?' · was '+esc(last.conc)+' until '+niceDate(new Date(last.at+4*3600e3).toISOString().slice(0,10))+' ('+esc(person(last.by).name)+')':'')+'</div>'+
    '<div class="small">'+(u.length?'Used in: '+u.map(esc).join(', '):'<span class="muted">Not used in a formula yet</span>')+'</div>'+
    (ed?'<details class="small"><summary>Edit name</summary><div class="row"><input data-solf="name" value="'+esc(x.name)+'"><input data-solf="chem" value="'+esc(x.chem||'')+'" placeholder="Chemical"><input data-solf="nominal" class="num" value="'+esc(x.nominal==null?'':x.nominal)+'" style="width:80px" placeholder="Nominal"><input data-solf="unit" value="'+esc(x.unit||'N')+'" style="width:60px"></div></details>':'')+'</div>'}).join('')+'</div>';
  if(ed)h+='<form id="solAdd" class="card row"><b>New solution</b><input id="sa-n" placeholder="Name, e.g. HCl 0.1 N" required style="flex:1"><input id="sa-c" placeholder="Chemical"><input id="sa-v" class="num" placeholder="Concentration" required inputmode="decimal" style="width:130px"><input id="sa-u" value="N" style="width:60px"><button class="primary">Add</button></form>';
  if(ed)h+=builderHTML();
  return h+'</div>';
}
function builderHTML(){
  const prods=S.cfg.products||[];
  if(!S.fb||!prods.find(p=>p.id===S.fb.pid)){const p=prods[0];S.fb={pid:p&&p.id,tid:''}}
  const p=prods.find(x=>x.id===S.fb.pid);if(!p)return'';
  const chem=(p.tests||[]).filter(t=>t.kind==='chem');
  if(S.fb.tid===''&&chem[0])S.fb.tid=chem[0].id;
  if(!S.fb.t||S.fb.t.id!==S.fb.tid){const src=(p.tests||[]).find(t=>t.id===S.fb.tid);S.fb.t=src?JSON.parse(JSON.stringify(src)):{id:uid('t'),kind:'chem',name:'New test',method:'',inputs:[{key:'V',label:'Volume',unit:'mL'}],consts:[],outputs:[{key:'r',label:'Result',formula:'V',unit:'',min:'',max:'',dp:2}],_new:1};S.fb.tid=S.fb.t.id}
  const t=S.fb.t;const sol=S.sol||[];const lim=isDoctor();
  const opts=CATS.map(([c,n])=>{const ps=prods.filter(x=>catOfP(x)===c);return ps.length?'<optgroup label="'+n+'">'+ps.map(x=>'<option value="'+x.id+'"'+(x.id===p.id?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</optgroup>':''}).join('');
  let h='<h2>Formula builder</h2><div class="card stack fb">';
  h+='<div class="row"><label class="field"><span>Product or sample</span><select id="fb-p">'+opts+'</select></label><label class="field"><span>Test</span><select id="fb-t">'+chem.map(x=>'<option value="'+x.id+'"'+(x.id===t.id?' selected':'')+'>'+esc(x.name)+'</option>').join('')+(t._new?'<option value="'+t.id+'" selected>'+esc(t.name)+' (new)</option>':'')+'<option value="__new">+ New test</option></select></label>'+
    '<label class="field" style="flex:1"><span>Test name</span><input data-fbt="name" value="'+esc(t.name)+'"></label><label class="field" style="flex:1"><span>Method</span><input data-fbt="method" value="'+esc(t.method||'')+'" placeholder="e.g. Titration"></label></div>';
  h+='<div class="fbcols"><div class="stack"><div class="label">1 · What you read</div>'+(t.inputs||[]).map((x,k)=>'<div class="fbrow" data-fr="inputs" data-k="'+k+'"><span class="chip key">'+esc(x.key)+'</span><input data-ff="label" value="'+esc(x.label)+'" placeholder="e.g. V NaOH"><input data-ff="unit" value="'+esc(x.unit||'')+'" placeholder="unit" style="width:70px"><button class="ghost danger" data-fdel>×</button></div>').join('')+'<button class="ghost" data-fadd="inputs">+ Reading</button>'+
    '<div class="label">2 · Solutions and fixed numbers</div>'+(t.consts||[]).map((x,k)=>'<div class="fbrow" data-fr="consts" data-k="'+k+'"><span class="chip key sol">'+esc(x.key)+'</span><select data-ff="sol"><option value="">Fixed number</option>'+sol.map(o=>'<option value="'+o.id+'"'+(x.sol===o.id?' selected':'')+'>'+esc(o.name)+'</option>').join('')+'</select>'+(x.sol?'<span class="small mono">'+esc((solOf(x.sol)||{}).conc||'')+' '+esc((solOf(x.sol)||{}).unit||'')+'</span>':'<input data-ff="label" value="'+esc(x.label||'')+'" placeholder="e.g. Sample volume"><input data-ff="value" class="num" value="'+esc(x.value||'')+'" style="width:90px" placeholder="value">')+'<button class="ghost danger" data-fdel>×</button></div>').join('')+
    '<div class="row"><button class="ghost" data-fadd="sol">+ Solution</button><button class="ghost" data-fadd="consts">+ Fixed number</button></div></div>';
  h+='<div class="stack"><div class="label">3 · Results (tap the chips to build the formula)</div>'+(t.outputs||[]).map((o,k)=>{const before=(t.outputs||[]).slice(0,k).map(x=>x.key);
    return '<div class="fbout" data-fr="outputs" data-k="'+k+'"><div class="row"><input data-ff="label" value="'+esc(o.label)+'" placeholder="Result name" style="flex:1"><input data-ff="unit" value="'+esc(o.unit||'')+'" placeholder="unit" style="width:70px"><label class="row small">Decimals <input data-ff="dp" type="number" class="num" value="'+esc(o.dp==null?2:o.dp)+'" style="width:60px"></label><button class="ghost danger" data-fdel>×</button></div>'+
      '<input class="formula fbformula" data-ff="formula" data-k="'+k+'" value="'+esc(o.formula||'')+'" placeholder="tap chips below">'+
      '<div class="chips">'+(t.inputs||[]).map(x=>'<button type="button" class="chip key" data-ins="'+esc(x.key)+'" title="'+esc(x.label)+'">'+esc(x.key)+'</button>').join('')+(t.consts||[]).map(x=>'<button type="button" class="chip key sol" data-ins="'+esc(x.key)+'" title="'+esc(x.sol?(solOf(x.sol)||{}).name:x.label)+'">'+esc(x.key)+'</button>').join('')+before.map(x=>'<button type="button" class="chip key res" data-ins="'+esc(x)+'">'+esc(x)+'</button>').join('')+
      ['+','−','×','÷','(',')','100','1000','⌫'].map(x=>'<button type="button" class="chip op" data-op="'+x+'">'+x+'</button>').join('')+'</div>'+
      '<div class="small">Limit: '+(lim?'min <input data-ff="min" class="num" value="'+esc(o.min==null?'':o.min)+'" style="width:70px"> max <input data-ff="max" class="num" value="'+esc(o.max==null?'':o.max)+'" style="width:70px">':(esc(limitText(o))||'none')+' <span class="muted">(the lab manager sets limits)</span>')+' · short name <span class="mono">'+esc(o.key)+'</span></div></div>'}).join('')+'<button class="ghost" data-fadd="outputs">+ Result</button></div></div>';
  const ex=S.fb.ex||{};const outs=computeTest(t,ex);
  h+='<div class="fbcheck"><b>Try it</b>'+(t.inputs||[]).map(x=>'<label class="row small">'+esc(x.label||x.key)+' <input class="num" data-fex="'+esc(x.key)+'" value="'+esc(ex[x.key]||'')+'" style="width:90px" inputmode="decimal"></label>').join('')+'<span id="fb-out">'+fbOuts(outs)+'</span></div>';
  h+='<div class="row between"><span class="small muted" id="fb-msg"></span><div class="row"><button id="fb-reset">Undo changes</button><button class="primary" id="fb-save">Save formula</button></div></div></div>';
  return h;
}
function fbOuts(outs){return outs.map(o=>'<span class="out '+o.state+'">'+esc(o.label)+': '+(o.value==null?'enter numbers':isNaN(o.value)?'formula error':fmt(o.value,o.dp)+' '+esc(o.unit||''))+'</span>').join('')}
let fbFocus=0;
function bindChem(){
  const keep=()=>{const y=window.scrollY;render();window.scrollTo(0,y)};
  const saveSol=async()=>{try{await S.db.doc('config/solutions').set({list:S.sol});toast('Saved')}catch(e){toast('Could not save: '+(e.code||e.message))}};
  document.querySelectorAll('[data-sol]').forEach(card=>{const x=S.sol.find(o=>o.id===card.dataset.sol);
    card.querySelectorAll('[data-solf]').forEach(i=>i.addEventListener('change',()=>{const k=i.dataset.solf;let v=i.value.trim();if(k==='conc'){v=v.replace(',','.');if(v===''||isNaN(Number(v))){toast('Type a number');i.value=x.conc;return}if(v===String(x.conc))return;x.history=(x.history||[]).concat([{conc:x.conc,by:S.me.id,at:Date.now()}]).slice(-30)}if(k==='nominal')v=v===''?null:Number(v.replace(',','.'));x[k]=v;x.at=Date.now();x.by=S.me.id;saveSol();keep()}))});
  const sa=$('#solAdd');sa&&(sa.onsubmit=e=>{e.preventDefault();const v=$('#sa-v').value.trim().replace(',','.');if(isNaN(Number(v))){toast('Concentration must be a number');return}S.sol=(S.sol||[]).concat([{id:uid('sol'),name:$('#sa-n').value.trim(),chem:$('#sa-c').value.trim(),nominal:null,conc:v,unit:$('#sa-u').value.trim()||'N',at:Date.now(),by:S.me.id,history:[]}]);S.dirty=false;saveSol();keep()});
  const fb=S.fb;if(!fb||!fb.t)return;const t=fb.t;
  $('#fb-p').onchange=e=>{S.fb={pid:e.target.value,tid:''};keep()};
  $('#fb-t').onchange=e=>{if(e.target.value==='__new'){S.fb.tid='__new';S.fb.t={id:uid('t'),kind:'chem',name:'New test',method:'',inputs:[{key:'V',label:'Volume',unit:'mL'}],consts:[],outputs:[{key:'r',label:'Result',formula:'V',unit:'',min:'',max:'',dp:2}],_new:1};S.fb.tid=S.fb.t.id}else{S.fb.tid=e.target.value;S.fb.t=null}S.fb.ex={};keep()};
  document.querySelectorAll('[data-fbt]').forEach(i=>i.addEventListener('change',()=>{t[i.dataset.fbt]=i.value;keep()}));
  document.querySelectorAll('[data-fr]').forEach(row=>{const arr=t[row.dataset.fr];const it=arr[Number(row.dataset.k)];
    row.querySelectorAll('[data-ff]').forEach(i=>{const k=i.dataset.ff;
      if(k==='formula'){i.addEventListener('focus',()=>fbFocus=Number(row.dataset.k));i.addEventListener('input',()=>{it.formula=i.value.replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-');$('#fb-out').innerHTML=fbOuts(computeTest(t,S.fb.ex||{}))});return}
      i.addEventListener('change',()=>{let v=i.value.trim();if(k==='dp')v=Number(v)||0;if(k==='value'||k==='min'||k==='max')v=v.replace(',','.');it[k]=v;if(k==='sol'&&v){const x=solOf(v);it.label=x?x.name:'';it.unit=x?x.unit:''}keep()})});
    const d=row.querySelector('[data-fdel]');d&&(d.onclick=()=>{arr.splice(Number(row.dataset.k),1);keep()})});
  document.querySelectorAll('[data-fadd]').forEach(b=>b.onclick=()=>{const k=b.dataset.fadd;const taken=fbKeys(t);
    if(k==='inputs')t.inputs.push({key:keyOf('m',taken),label:'Reading',unit:''});
    if(k==='consts')(t.consts=t.consts||[]).push({key:keyOf('F',taken),label:'Factor',value:'',unit:''});
    if(k==='sol'){const x=(S.sol||[])[0];(t.consts=t.consts||[]).push({key:keyOf('C',taken),label:x?x.name:'Concentration',value:x?x.conc:'',unit:x?x.unit:'N',sol:x?x.id:''})}
    if(k==='outputs')t.outputs.push({key:keyOf('r',taken),label:'Result',formula:'',unit:'',min:'',max:'',dp:2});keep()});
  document.querySelectorAll('.fbout').forEach(box=>{const k=Number(box.dataset.k);const o=t.outputs[k];const inp=box.querySelector('.fbformula');
    const put=txt=>{const a=inp.selectionStart==null?inp.value.length:inp.selectionStart,b=inp.selectionEnd==null?a:inp.selectionEnd;o.formula=inp.value.slice(0,a)+txt+inp.value.slice(b);inp.value=o.formula;inp.focus();inp.setSelectionRange(a+txt.length,a+txt.length);$('#fb-out').innerHTML=fbOuts(computeTest(t,S.fb.ex||{}))};
    box.querySelectorAll('[data-ins]').forEach(c=>c.onclick=()=>put(c.dataset.ins));
    box.querySelectorAll('[data-op]').forEach(c=>c.onclick=()=>{const m={'+':'+','−':'-','×':'*','÷':'/'}[c.dataset.op];if(c.dataset.op==='⌫'){const a=inp.selectionStart||inp.value.length;o.formula=inp.value.slice(0,Math.max(0,a-1))+inp.value.slice(a);inp.value=o.formula;inp.focus();inp.setSelectionRange(Math.max(0,a-1),Math.max(0,a-1));$('#fb-out').innerHTML=fbOuts(computeTest(t,S.fb.ex||{}));return}put(m||c.dataset.op)})});
  document.querySelectorAll('[data-fex]').forEach(i=>i.addEventListener('input',()=>{S.fb.ex=S.fb.ex||{};S.fb.ex[i.dataset.fex]=i.value.trim().replace(',','.');$('#fb-out').innerHTML=fbOuts(computeTest(t,S.fb.ex))}));
  $('#fb-reset').onclick=()=>{S.fb.t=null;if(t._new)S.fb.tid='';keep()};
  $('#fb-save').onclick=async()=>{const bad=(t.outputs||[]).find(o=>!o.formula||(SAFE.test(o.formula)&&isNaN(evalFormula(o.formula,Object.fromEntries(fbKeys(t).map((k,j)=>[k,1.3+j*0.37]))))));
    if(bad){$('#fb-msg').textContent='Check the formula of '+bad.label+': it uses a name that is not in this test.';return}
    const c=JSON.parse(JSON.stringify(S.cfg));const p=(c.products||[]).find(x=>x.id===S.fb.pid);const clean=JSON.parse(JSON.stringify(t));delete clean._new;
    p.tests=p.tests||[];const i=p.tests.findIndex(x=>x.id===clean.id);if(i>=0)p.tests[i]=clean;else p.tests.push(clean);
    try{await S.db.doc('config/main').set(c);S.cfg=c;S.cfgDraft=null;S.fb.t=null;toast('Formula saved for '+p.name);keep()}catch(e){$('#fb-msg').textContent='Could not save: '+(e.code||e.message)}};
}

/* ---------- PEOPLE (admin) ---------- */
function peopleView(){
  const ps=Object.values(S.people).sort((a,b)=>(a.active===false)-(b.active===false)||a.name.localeCompare(b.name));
  return '<div class="stack"><div><h1>People</h1><p class="muted">Who can sign in, who appears in "Tested by" and who can validate. PINs are a simple lock for the shared laptop.</p></div>'+
  '<div class="card stack" style="gap:6px"><b>Who sees what</b><span class="small muted"><b>Lab technician</b>: Today, Records, Micro pending and their tasks. <b>Lab manager (doctor)</b>: everything above plus the <b>Live overview</b> of all testing as it happens, assigning tasks, Tests &amp; limits. <b>Lab account (shared, username lab)</b>: opens straight into the lab with its own simple screen: Testing, Micro to read, Records, Solutions &amp; formulas. No tasks, no live overview, no people. Who tested is still signed with each person’s PIN. <b>Admin</b>: everything, plus this page. Only people whose website account has the <b>Lab</b> area (Admin page of the website) can open the lab at all.</span></div>'+
  '<div class="card tablewrap"><table><tr><th>Name</th><th>Website account</th><th>Role</th><th>Can test</th><th>Can validate</th><th>PIN</th><th>Active</th></tr>'+ps.map(p=>'<tr data-pid="'+p.id+'"><td><input data-pp="name" value="'+esc(p.name)+'"></td><td><select data-pp="uid"><option value="">— not linked —</option>'+(window.LAB_ACCOUNTS||[]).map(a=>'<option value="'+a.id+'"'+(p.uid===a.id?' selected':'')+'>'+esc(a.full_name||a.username)+((a.areas||[]).indexOf('lab')<0&&!a.is_owner?' (no Lab area)':'')+'</option>').join('')+'</select></td><td><select data-pp="role">'+[['lab','Lab technician'],['station','Lab account (shared)'],['doctor','Lab manager'],['admin','Admin']].map(o=>'<option value="'+o[0]+'"'+(p.role===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></td><td><input type="checkbox" data-pp="canTest"'+(p.canTest?' checked':'')+'></td><td><input type="checkbox" data-pp="canValidate"'+(p.canValidate?' checked':'')+'></td><td><input data-pp="pin" value="'+esc(p.pin||'')+'" style="width:90px" inputmode="numeric"></td><td><input type="checkbox" data-pp="active"'+(p.active!==false?' checked':'')+'></td></tr>').join('')+'</table></div>'+
  '<form id="npf" class="card row"><input id="np-n" placeholder="Full name" required style="flex:1"><select id="np-r"><option value="lab">Lab technician</option><option value="doctor">Lab manager</option><option value="admin">Admin</option></select><input id="np-pin" placeholder="PIN" inputmode="numeric" style="width:90px" required><button class="primary">Add person</button></form></div>';
}
function bindPeople(){
  document.querySelectorAll('[data-pid]').forEach(tr=>{const p=S.people[tr.dataset.pid];tr.querySelectorAll('[data-pp]').forEach(i=>i.addEventListener('change',()=>{const k=i.dataset.pp;p[k]=i.type==='checkbox'?i.checked:i.value.trim();queueWrite('people/'+p.id,strip(p));toast('Saved')}))});
  $('#npf').onsubmit=e=>{e.preventDefault();const r=$('#np-r').value;const p={id:uid('u'),name:$('#np-n').value.trim(),role:r,canTest:r==='lab',canValidate:r!=='lab',pin:$('#np-pin').value.trim(),active:true};if(!p.name||!p.pin)return;S.people[p.id]=p;queueWrite('people/'+p.id,strip(p));S.dirty=false;render();toast(p.name+' added')};
}

boot();
})();

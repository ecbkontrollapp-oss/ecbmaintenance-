// Offline code + synthetic Firestore fixture checks. No Firebase credentials required.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const app=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules.staged',import.meta.url),'utf8');
test('all app JavaScript blocks parse',()=>{
  let count=0;
  for(const match of app.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
    let js=match[2].trim();
    if(!js)continue;
    if(match[1].includes('type="module"'))js=js.replace(/^\s*import\b[^\n]*\n/gm,'');
    new vm.Script(js);
    count++;
  }
  assert.ok(count>=3);
});
test('historical collections and old user login remain integrated',()=>{
  assert.ok(app.includes("collection(db,'ecb_protocols')"));
  assert.ok(app.includes("collection(db,'ecb_dguv_devices')"));
  assert.ok(app.includes("collection(db,'dguv_devices')"));
  assert.ok(app.includes("const reference=doc(saveProtocols)"));
  assert.ok(app.includes('id="login-user"'));
  assert.ok(app.includes('id="login-pass"'));
  assert.ok(app.includes('signInWithEmailAndPassword'));
  assert.ok(!app.includes('signInWithCustomToken'));
  assert.ok(app.includes("const saved=await getDocFromServer(reference)"));
  assert.ok(!app.includes('DESIGN-DEMO'));
});
test('historical copies retain images, signature, checklists, and notes',()=>{
  const a=app.indexOf('function combine(sources,store){');
  const b=app.indexOf('function sourceDiagnostics(){',a);
  assert.ok(a>0&&b>a);
  const combine=vm.runInNewContext(app.slice(a,b)+'; combine;');
  const sources=[{name:'ecb_protocols'},{name:'backup'}];
  const store=new Map([
    ['ecb_protocols',{ready:true,docs:[{id:'orig',data:{id:'ECB-500392',machine:'WM 4',date:'27.9.2026',photos:['data:image/png;base64,ONE'],remarks:'Altbestand',points:[{title:'Prüfung',status:'erledigt'}]}}]}],
    ['backup',{ready:true,docs:[{id:'copy',data:{id:'ECB-500392',machine:'WM 4',date:'27.9.2026',photos:['data:image/png;base64,ONE','data:image/png;base64,TWO'],signature:'data:image/png;base64,SIGN',points:[{title:'Prüfung',status:'erledigt'},{title:'Test',status:'nicht erledigt'}]}}]}]
  ]);
  const merged=combine(sources,store);
  assert.equal(merged.complete,true);
  assert.equal(merged.docs.length,1);
  const item=merged.docs[0].data;
  assert.equal(item.photos.length,2);
  assert.equal(item.signature,'data:image/png;base64,SIGN');
  assert.equal(item.points.length,2);
  assert.equal(item.remarks,'Altbestand');
  assert.equal(store.get('ecb_protocols').docs[0].data.signature,undefined);
  store.set('backup',{ready:false,error:'permission-denied',docs:[]});
  const partial=combine(sources,store);
  assert.equal(partial.complete,false);
  assert.deepEqual(Array.from(partial.errors),['backup']);
});
test('username mapping matches deterministic private email alias',()=>{
  const hash=createHash('sha256').update('max').digest('hex').slice(0,48);
  assert.equal(('u'+hash+'@accounts.ecb.invalid').split('@')[0].length,49);
  assert.ok(app.includes("join('').slice(0,48)+'@accounts.ecb.invalid'"));
});
test('staged Firestore rules deny public reads and require staff claims',()=>{
  assert.ok(rules.includes('request.auth.token.ecbStaff == true'));
  assert.ok(rules.includes('allow read, write: if false;'));
  assert.ok(!/allow\s+read,\s*write:\s*if\s+true/.test(rules));
  assert.ok(rules.includes('match /ecb_users/{userId}'));
});


test('Firestore read errors retain already loaded records for the user',()=>{
  assert.match(app,/const previous=store\.get\(source\.name\)/);
  assert.match(app,/docs:previous\?\.docs\|\|\[\]/);
  assert.doesNotMatch(app,/store\.set\(source\.name,\{ready:false,docs:\[\],error:/);
});
test('backup distinguishes verified sources from incomplete historical data',()=>{
  assert.ok(app.includes('completeKnownSources:complete'));
  assert.ok(app.includes('sourceStatus:sources'));
  assert.ok(app.includes('UNVOLLSTÄNDIGER CLOUD-ABGLEICH'));
  assert.ok(app.includes('TEILBESTAND'));
  assert.ok(app.includes("allStatuses.every(row=>row.status==='Server bestätigt')"));
});

test('separate public preview reads Firebase only after login and exposes no write API',()=>{
  const preview=readFileSync(new URL('../testansicht/index.html',import.meta.url),'utf8');
  assert.ok(preview.includes('TESTANSICHT MIT ECHTER CLOUD-HISTORIE'));
  assert.ok(preview.includes("signInWithEmailAndPassword(auth,email,password)"));
  assert.ok(preview.includes("listen(protocolSources,protocolBySource,redrawProtocols)"));
  assert.ok(preview.includes('window.ECB_SAVE=null; // Read-only test'));
  assert.doesNotMatch(preview,/\b(?:setDoc|deleteDoc|addDoc|updateDoc|uploadBytes)\s*\(/);
  assert.doesNotMatch(preview,/import\s*\{[^}]*\b(?:setDoc|deleteDoc|addDoc|updateDoc|uploadBytes)\b/);
  assert.ok(preview.includes('id="login-pass"'));
  assert.ok(preview.includes("button.disabled=true"));
  const scripts=[...preview.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length>=4);
  for(const [,attrs,script] of scripts){
    let js=script.trim();
    if(!js)continue;
    if(attrs.includes('type="module"'))js=js.replace(/^\s*import\b[^\n]*\n/gm,'');
    new vm.Script(js);
  }
});

test('admin UI is connected without exposing a client-side privileged write',()=>{
 const admin=readFileSync(new URL('../admin/ecb-admin.mjs',import.meta.url),'utf8');
 assert.ok(app.includes('id="view-admin"'));
 assert.ok(app.includes('id="ecb-admin-create-user"'));
 assert.ok(app.includes('id="ecb-password-change-form"'));
 assert.ok(app.includes('data-ecb-mail'));
 assert.ok(app.includes('data-ecb-archive'));
 assert.ok(app.includes('src="./admin/ecb-admin.mjs"'));
 assert.ok(admin.includes("httpsCallable(funcs,name"));
 assert.ok(admin.includes("profile.mustChangePassword===true"));
 assert.ok(admin.includes("window.ECB_ADMIN_ROLE=role"));
 assert.ok(admin.includes("window.ECB_ARCHIVED_KEYS=new Set"));
 assert.ok(admin.includes("adminCreateUser"));
 assert.ok(admin.includes("changeMyPassword"));
 assert.ok(admin.includes("window.ECB_FREE_MAIL.send"));
 assert.ok(admin.includes("adminArchiveProtocol"));
 assert.ok(admin.includes("adminRestoreProtocol"));
 assert.ok(!/\b(?:setDoc|deleteDoc|updateDoc|addDoc)\s*\(/.test(admin));
});
test('server enforces claims, password-change restriction, mail deduplication and fixed recipient',()=>{
 const fn=readFileSync(new URL('../functions/index.js',import.meta.url),'utf8');
 const pdf=readFileSync(new URL('../functions/pdf.mjs',import.meta.url),'utf8');
 assert.ok(fn.includes("const DESTINATION='pb@ecb-system.de'"));
 assert.ok(fn.includes("user.customClaims?.ecbAdmin"));
 assert.ok(fn.includes("user.customClaims?.ecbStaff"));
 assert.ok(fn.includes("profile.data()?.mustChangePassword===true"));
 assert.ok(fn.includes("auth.createUser"));
 assert.ok(fn.includes("auth.updateUser(user.uid,{password:newPassword})"));
 assert.ok(fn.includes("randomBytes(24)"));
 assert.ok(fn.includes("changeMyPassword"));
 assert.ok(fn.includes("adminResetTemporaryPassword"));
 assert.ok(fn.includes("ecb_mail_jobs"));
 assert.ok(fn.includes("ecb_mail_locks"));
 assert.ok(fn.includes("ecb_mail_rate"));
 assert.ok(fn.includes("onNewMaintenance=onDocumentCreated"));
 assert.ok(fn.includes("onNewLegacyMaintenance=onDocumentCreated"));
 assert.ok(fn.includes("sendProtocolEmail=onCall"));
 assert.ok(!fn.includes("console.log(password)"));
 assert.ok(pdf.includes("signature"));
 assert.ok(pdf.includes("ORIGINALFOTOS"));
 assert.ok(pdf.includes("ecb-logo.b64"));
 const logo=Buffer.from(readFileSync(new URL('../functions/assets/ecb-logo.b64',import.meta.url),'utf8').trim(),'base64');
 assert.ok(logo.length>1000);
 assert.equal(logo.subarray(0,4).toString('ascii'),'RIFF');
});
test('new rules are staged only and protect passwords and legacy protocols',()=>{
 const rules=readFileSync(new URL('../firestore.rules.admin.staged',import.meta.url),'utf8');
 const firebase=JSON.parse(readFileSync(new URL('../firebase.json',import.meta.url),'utf8'));
 assert.equal(firebase.functions.source,'functions');
 assert.equal(firebase.firestore,undefined,'Do not accidentally deploy unreviewed Firestore rules');
 assert.ok(rules.includes('request.auth.token.ecbAdmin == true'));
 assert.ok(rules.includes('mustChangePassword == false'));
 assert.ok(rules.includes('match /ecb_users/{id}'));
 assert.ok(rules.includes('allow create, update, delete: if false;'));
 assert.ok(!/allow\s+read\s*,\s*write\s*:\s*if\s+true/.test(rules));
});

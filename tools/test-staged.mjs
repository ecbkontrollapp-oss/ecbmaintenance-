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

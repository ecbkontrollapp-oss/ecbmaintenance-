import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const server=readFileSync(new URL('../index.js',import.meta.url),'utf8');
const pdf=readFileSync(new URL('../pdf.mjs',import.meta.url),'utf8');
const web=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const browser=readFileSync(new URL('../../admin/ecb-admin.mjs',import.meta.url),'utf8');
const rules=readFileSync(new URL('../../firestore.rules.admin.staged',import.meta.url),'utf8');
test('browser module and admin UI parse without invoking Firebase',()=>{
 new vm.Script(browser.replace(/^\s*import\b[^\n]*$/gm,''));
 const blocks=[...web.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
 let scripts=0;
 for(const [,attributes,raw] of blocks){
   if(!raw.trim())continue;
   const js=attributes.includes('type="module"')?raw.replace(/^\s*import\b[^\n]*$/gm,''):raw;
   new vm.Script(js);
   scripts++;
 }
 assert.ok(scripts>=3);
 assert.ok(web.includes('<script type="module" src="./admin/ecb-admin.mjs"></script>'));
});
test('staff and admin controls exist and are not trusted as authority',()=>{
 for(const id of ['ecb-admin-nav','view-admin','ecb-admin-create-user','ecb-password-change-form',
   'ecb-admin-users','ecb-admin-temp-result','ecb-admin-archive-list','ecb-admin-mail-jobs'])
   assert.ok(web.includes('id="'+id+'"'),id);
 assert.ok(server.includes("identity(request,'admin')"));
 assert.ok(server.includes("identity(request,'staff',true)"));
 assert.ok(server.includes('ecbAdmin'));
 assert.ok(server.includes('ecbStaff'));
 assert.match(web,/token\.claims\.ecbAdmin===true/);
 assert.match(web,/mustChangePassword/);
});
test('temporary password is generated only on the server',()=>{
 assert.match(server,/randomBytes\(24\)/);
 assert.match(server,/auth\.createUser\(/);
 assert.match(server,/mustChangePassword:true/);
 assert.match(server,/mustChangePassword:false/);
 assert.match(server,/auth\.revokeRefreshTokens\(/);
 assert.match(browser,/ecb-admin-temp-password/);
 assert.doesNotMatch(browser,/createUserWithEmailAndPassword|randomBytes\(/);
});
test('free Cloudflare mail has one fixed automatic recipient and no Firebase SMTP triggers',()=>{
 const free=readFileSync(new URL('../../free-mail-worker/src/index.js',import.meta.url),'utf8');
 const client=readFileSync(new URL('../../features/free-mail-client.mjs',import.meta.url),'utf8');
 assert.match(free,/automatic\?'pb@ecb-system\.de'/);
 assert.match(free,/const MAIL='https:\/\/api\.resend\.com\/emails'/);
 assert.match(free,/Idempotency-Key/);
 assert.match(free,/mail_jobs/);
 assert.match(free,/ecbStaff/);
 assert.match(client,/async send\(\{mode,protocol/);
 assert.match(web,/mode:'automatic'/);
 assert.doesNotMatch(server,/onDocumentCreated|nodemailer|sendProtocolEmail=onCall/);
});
test('PDF rejects missing image and missing signature instead of claiming success',()=>{
 assert.match(pdf,/async function embedImage\(/);
 assert.match(pdf,/sharp\(/);
 assert.match(pdf,/p\.photos/);
 assert.match(pdf,/if\(!p\.signature\)throw/);
 assert.match(pdf,/signature=await embedImage/);
 assert.match(pdf,/ecb-logo\.b64/);
 const client=readFileSync(new URL('../../features/free-mail-client.mjs',import.meta.url),'utf8');
 assert.match(client,/await buildPdf\(protocol\)/);
});
test('admin archive is reversible and never deletes original maintenance docs',()=>{
 assert.match(server,/ecb_archived_protocols/);
 assert.match(server,/export const adminRestoreProtocol/);
 assert.doesNotMatch(server,/\.delete\(\);\s*\/\/.*(?:ecb_protocols|protocols)/);
 assert.match(web,/ECB_IS_ARCHIVED/);
 assert.match(browser,/adminArchiveProtocol/);
});
test('Firestore rules require role claims and prevent client user management',()=>{
 assert.match(rules,/request\.auth\.token\.ecbAdmin/);
 assert.match(rules,/request\.auth\.token\.ecbStaff/);
 assert.match(rules,/mustChangePassword == false/);
 assert.match(rules,/match \/ecb_staff_profiles/);
 assert.match(rules,/allow create, update, delete: if false/);
 assert.doesNotMatch(rules,/allow\s+read,\s*write:\s*if\s+true/);
});

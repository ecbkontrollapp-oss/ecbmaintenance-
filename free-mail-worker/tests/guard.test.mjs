import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import service from '../src/index.js';

const original=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const frontend=readFileSync(new URL('../../features/free-mail-client.mjs',import.meta.url),'utf8');
const app=readFileSync(new URL('../../index.html',import.meta.url),'utf8');

test('free mail worker responds with status without exposing credentials',async()=>{
 const result=await service.fetch(new Request('https://example.workers.dev/health'),{});
 assert.equal(result.status,200);
 assert.deepEqual(await result.json(),{status:'configured-only',service:'ECB Wartung Free Mail'});
});
test('CORS restricts browser origin and requires authentication',async()=>{
 const wrong=await service.fetch(new Request('https://example.workers.dev/send-protocol',{
  method:'POST',headers:{Origin:'https://untrusted.example','content-type':'application/json'},
  body:'{}'
 }),{ALLOWED_ORIGIN:'https://ecbkontrollapp-oss.github.io'});
 assert.equal(wrong.status,403);
 const preflight=await service.fetch(new Request('https://example.workers.dev/send-protocol',{
  method:'OPTIONS',headers:{Origin:'https://ecbkontrollapp-oss.github.io'}
 }),{ALLOWED_ORIGIN:'https://ecbkontrollapp-oss.github.io'});
 assert.equal(preflight.status,204);
 const noAuth=await service.fetch(new Request('https://example.workers.dev/send-protocol',{
  method:'POST',headers:{Origin:'https://ecbkontrollapp-oss.github.io','content-type':'application/json'},body:'{}'
 }),{RESEND_API_KEY:'placeholder',ECB_MAIL_FROM:'ECB Wartung <wartung@ecb-system.de>',MAIL_DB:{},FIREBASE_PROJECT_ID:'ecb-maintenance'});
 assert.equal(noAuth.status,401);
 assert.match(JSON.stringify(await noAuth.json()),/Bitte bei ECB Wartung anmelden/);
});
test('free mail rejects invalid signed JWT without calling an external API',async()=>{
 const invalid=await service.fetch(new Request('https://example.workers.dev/send-protocol',{
  method:'POST',headers:{Origin:'https://ecbkontrollapp-oss.github.io',Authorization:'Bearer invalid.token.parts','content-type':'application/json'},
  body:'{}'
 }),{RESEND_API_KEY:'placeholder',ECB_MAIL_FROM:'wartung@ecb-system.de',MAIL_DB:{},FIREBASE_PROJECT_ID:'ecb-maintenance'});
 assert.equal(invalid.status,401);
});
test('all required guards exist, with hard limits and no pay-as-you-go',()=>{
 assert.match(original,/p\.ecbStaff!==true/);
 assert.match(original,/ecb_staff_profiles/);
 assert.match(original,/auth_time<=now/);
 assert.match(original,/RSASSA-PKCS1-v1_5/);
 assert.match(original,/const MAIL='https:\/\/api\.resend\.com\/emails'/);
 assert.match(original,/90\|\|\(monthly\?\.n\|\|0\)>=2700/);
 assert.match(original,/Idempotency-Key/);
 assert.match(original,/INSERT OR IGNORE INTO mail_jobs/);
 assert.match(original,/const automatic=data\.mode==='automatic'/);
 assert.match(original,/automatic\?'pb@ecb-system\.de'/);
 assert.doesNotMatch(original,/nodemailer|firebase-functions|SMTP_SECRET/);
});
test('browser composes the actual PDF and only sends after saved Firebase write',()=>{
 const noImports=frontend.replace(/^\s*import\s+\{[^}]+\}\s+from\s+'[^']+';\s*$/gm,'');
 new vm.Script(noImports);
 assert.match(frontend,/window\.imageToPdfData/);
 assert.match(frontend,/ORIGINALFOTOS/);
 assert.match(frontend,/UNTERSCHRIFT/);
 assert.match(frontend,/window\.ECB_FREE_MAIL_ENDPOINT/);
 assert.match(app,/p\.id=await window\.ECB_SAVE\(p\)/);
 assert.match(app,/window\.ECB_FREE_MAIL\.send/);
 assert.match(app,/window\.ECB_LAST_SAVED_PATH/);
 assert.doesNotMatch(app,/RESEND_API_KEY|SMTP_PASSWORD/);
});

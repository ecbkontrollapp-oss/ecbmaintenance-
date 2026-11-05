// No-charge mail gateway for the ECB Wartung app.
// Cloudflare Workers Free + D1 Free + Resend Free. No Firebase Cloud Functions needed for email.
// NOT DEPLOYED: domain verification, secrets and end-to-end validation are required.
const KEYS='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAIL='https://api.resend.com/emails';
const json=(data,status=200,origin='')=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json;charset=UTF-8',
 ...(origin?{'access-control-allow-origin':origin,'vary':'Origin'}:{})}
});
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const emailPattern=/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const segment=/^[a-zA-Z0-9_.-]{1,140}$/;
const b64url=input=>Uint8Array.from(atob(input.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-input.length%4)%4)),c=>c.charCodeAt(0));
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
const readJwt=async(value,project)=>{
 if(!value||value.length>8192)throw error('Firebase-Anmeldung fehlt.',401);
 const pieces=value.split('.');if(pieces.length!==3)throw error('Ungültige Firebase-Sitzung.',401);
 let h,p;
 try{h=JSON.parse(new TextDecoder().decode(b64url(pieces[0])));p=JSON.parse(new TextDecoder().decode(b64url(pieces[1])));}
 catch{throw error('Ungültige Firebase-Sitzung.',401)}
 const now=Math.floor(Date.now()/1000);
 if(h.alg!=='RS256'||typeof h.kid!=='string'||h.kid.length>200||
   p.aud!==project||p.iss!=='https://securetoken.google.com/'+project||
   typeof p.sub!=='string'||!p.sub||p.sub.length>128||
   !(p.exp>now)||!(p.iat<=now)||!(p.auth_time<=now)||
   p.iat<now-86400)throw error('Firebase-Sitzung ungültig oder abgelaufen.',401);
 const result=await fetch(KEYS);
 if(!result.ok)throw error('Firebase-Schlüsselserver nicht erreichbar.',503);
 const data=await result.json(),jwk=data.keys?.find(k=>k.kid===h.kid&&k.kty==='RSA');
 if(!jwk)throw error('Firebase-Schlüssel nicht erkannt.',401);
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64url(pieces[2]),new TextEncoder().encode(pieces[0]+'.'+pieces[1]));
 if(!valid)throw error('Ungültige Firebase-Signatur.',401);
 // Admin/staff grants are created exclusively through verified backend operations.
 if(p.ecbStaff!==true)throw error('Mitarbeiterkonto noch nicht freigeschaltet.',403);
 return p;
};
const firestoreValue=v=>{
 if(!v||typeof v!=='object')return null;
 if('stringValue'in v)return v.stringValue;
 if('integerValue'in v)return Number(v.integerValue);
 if('doubleValue'in v)return Number(v.doubleValue);
 if('booleanValue'in v)return v.booleanValue;
 if('nullValue'in v)return null;
 if('timestampValue'in v)return v.timestampValue;
 if('arrayValue'in v)return (v.arrayValue.values||[]).map(firestoreValue);
 if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,t])=>[k,firestoreValue(t)]));
 return null;
};
const docUrl=(project,path)=>'https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(project)+'/databases/(default)/documents/'+path.split('/').map(encodeURIComponent).join('/');
async function getDoc(project,path,token){
 const res=await fetch(docUrl(project,path),{headers:{Authorization:'Bearer '+token}});
 if(!res.ok){
   if(res.status===403)throw error('Keine Firestore-Leseberechtigung für diesen Datensatz.',403);
   if(res.status===404)throw error('Firebase-Protokoll nicht gefunden.',404);
   throw error('Firestore-Prüfung fehlgeschlagen ('+res.status+').',502);
 }
 const body=await res.json();
 return Object.fromEntries(Object.entries(body.fields||{}).map(([k,value])=>[k,firestoreValue(value)]));
}
const protocolPath=path=>typeof path==='string'&&(
 /^ecb_protocols\/[^/]+$/.test(path)||
 /^artifacts\/(?:ecb-maintenance|ecb-maintenance-live)\/public\/data\/protocols\/[^/]+$/.test(path)
 )&&path.split('/').every(part=>segment.test(part));
async function ensureProfile(project,uid,token){
 const profile=await getDoc(project,'ecb_staff_profiles/'+uid,token);
 if(profile.disabled||profile.mustChangePassword||!profile.username)
   throw error('Mitarbeiterprofil gesperrt oder Passwortwechsel erforderlich.',403);
}
async function reserveMail(env,key,protocol,to,uid,path,mode){
 const now=Date.now(),today=now-86400000,month=now-31*86400000;
 const [recent,daily,monthly]=await Promise.all([
 env.MAIL_DB.prepare('SELECT 1 FROM mail_jobs WHERE protocol_id=? AND recipient=? AND created_at>? LIMIT 1').bind(protocol,to,now-120000).first(),
 env.MAIL_DB.prepare('SELECT COUNT(*) AS n FROM mail_jobs WHERE created_at>?').bind(today).first(),
 env.MAIL_DB.prepare('SELECT COUNT(*) AS n FROM mail_jobs WHERE created_at>?').bind(month).first()
 ]);
 if(recent)throw error('Dieser Empfänger hat für das Protokoll gerade einen Versandauftrag erhalten. Doppelversand verhindert.',409);
 if((daily?.n||0)>=90||(monthly?.n||0)>=2700)
   throw error('Kostenloses Versandkontingent vorsorglich erreicht. Keine E-Mail versendet.',429);
 const result=await env.MAIL_DB.prepare(
   "INSERT OR IGNORE INTO mail_jobs(job_id,protocol_id,recipient,requested_by,source_path,mode,created_at,status) VALUES(?,?,?,?,?,?,?,'pending')"
 ).bind(key,protocol,to,uid,path,mode,now).run();
 if(!result.meta?.changes)return {duplicate:true};
 return {duplicate:false};
}
async function send(request,env){
 if(!env.MAIL_DB||!env.RESEND_API_KEY||!env.ECB_MAIL_FROM)
   throw error('Kostenloser Maildienst ist noch nicht vollständig eingerichtet.',503);
 const authHeader=request.headers.get('Authorization')||'';
 if(!authHeader.startsWith('Bearer '))throw error('Bitte bei ECB Wartung anmelden.',401);
 const token=authHeader.slice(7),project=env.FIREBASE_PROJECT_ID||'ecb-maintenance';
 const claims=await readJwt(token,project);
 await ensureProfile(project,claims.sub,token);
 const contentLength=Number(request.headers.get('content-length')||0);
 if(contentLength>13*1024*1024)throw error('PDF ist für den kostenlosen Versand zu groß.',413);
 let data;try{data=await request.json()}catch{throw error('Ungültige Versanddaten.')}
 const id=String(data.protocolId||'').trim(),path=data.sourcePath;
 if(!/^[a-zA-Z0-9_.-]{1,120}$/.test(id)||!protocolPath(path))throw error('Ungültige Protokollreferenz.');
 const automatic=data.mode==='automatic';
 if(data.mode!=='manual'&&!automatic)throw error('Unbekannter Versandmodus.');
 const to=automatic?'pb@ecb-system.de':String(data.recipient||'pb@ecb-system.de').trim().toLowerCase();
 if(!emailPattern.test(to)||to.length>254)throw error('Ungültige Empfängeradresse.');
 if(!automatic&&!/^[0-9a-z-]{16,80}$/i.test(String(data.requestId||'')))throw error('Versandkennung fehlt.');
 const pdf=String(data.pdfBase64||'').replace(/\s/g,'');
 if(pdf.length<500||pdf.length>8*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(pdf)||
   !atob(pdf.slice(0,12)).startsWith('%PDF-'))throw error('Vollständige PDF-Datei ist erforderlich (maximal ca. 6 MB).',413);
 const protocol=await getDoc(project,path,token);
 if(String(protocol.id||path.split('/').at(-1))!==id)throw error('Protokollnummer stimmt nicht mit Firebase überein.',409);
 if(!Array.isArray(protocol.photos)||!Array.isArray(protocol.points)||!protocol.signature)
   throw error('Fotos, Prüfpunkte oder Unterschrift fehlen im gespeicherten Originalprotokoll.',409);
 const key=await digest((automatic?'auto|'+path+'|'+to:'manual|'+claims.sub+'|'+data.requestId));
 const reserved=await reserveMail(env,key,id,to,claims.sub,path,data.mode);
 if(reserved.duplicate)return json({ok:false,status:'already-requested',noDuplicate:true},200,request.headers.get('Origin'));
 let status='needs-review',providerId=null,lastError=null;
 try{
   const result=await fetch(MAIL,{method:'POST',headers:{
     Authorization:'Bearer '+env.RESEND_API_KEY,
     'content-type':'application/json',
     'Idempotency-Key':'ecb-'+key
   },body:JSON.stringify({
     from:env.ECB_MAIL_FROM,to:[to],
     subject:'ECB Wartungsprotokoll '+id+' – '+String(protocol.machine||'Wartung').replace(/[\r\n]/g,' ').slice(0,90),
     text:'Das Wartungsprotokoll '+id+' wurde in ECB Wartung gespeichert. Das vollständige PDF ist angehängt.\n\nE.C.B. Reinigungssysteme GmbH',
     attachments:[{filename:'ECB_Protokoll_'+id+'.pdf',content:pdf}]
   })});
   const body=await result.json().catch(()=>({}));
   if(!result.ok||!body.id)throw error('E-Mail-Provider hat den Versand nicht bestätigt ('+result.status+').',502);
   status='sent';providerId=String(body.id).slice(0,120);
 }catch(e){lastError=String(e.message||'Versand unbestätigt').slice(0,180);}
 await env.MAIL_DB.prepare('UPDATE mail_jobs SET status=?, provider_id=?, last_error=? WHERE job_id=?')
   .bind(status,providerId,lastError,key).run();
 if(status!=='sent')throw error('Versand nicht bestätigt. Bitte im Adminbereich prüfen; nicht erneut versenden.',502);
 return json({ok:true,status:'sent',jobId:key},200,request.headers.get('Origin'));
}
export default {
 async fetch(request,env){
   const origin=request.headers.get('Origin')||'';
   const allowed=env.ALLOWED_ORIGIN||'https://ecbkontrollapp-oss.github.io';
   if(request.method==='OPTIONS'){
     if(origin!==allowed)return new Response(null,{status:403});
     return new Response(null,{status:204,headers:{
       'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'POST, OPTIONS',
       'Access-Control-Allow-Headers':'Authorization, Content-Type',
       'Access-Control-Max-Age':'600','Vary':'Origin'
     }});
   }
   if(new URL(request.url).pathname==='/health')return json({status:'configured-only',service:'ECB Wartung Free Mail'});
   if(request.method!=='POST'||new URL(request.url).pathname!=='/send-protocol')return json({error:'Nicht gefunden'},404);
   if(origin!==allowed)return json({error:'Diese App-Adresse ist nicht freigegeben.'},403);
   try{return await send(request,env)}catch(e){return json({ok:false,error:e.message||'Versand fehlgeschlagen'},e.status||500,allowed);}
 }
};

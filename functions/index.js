// Privileged ECB Wartung operations. DEPLOY ONLY AFTER verified backup, role bootstrap,
// Firebase Auth migration and reviewed Firestore rules. Mail uses Cloudflare Free.
import {createHash,randomBytes} from 'node:crypto';
import {initializeApp,getApps} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';

if(!getApps().length)initializeApp();
const auth=getAuth(),db=getFirestore(),region='europe-west3';
const callable={region,timeoutSeconds:90,memory:'512MiB',maxInstances:3};
const hash=s=>createHash('sha256').update(s).digest('hex');
const normalizedName=s=>String(s??'').normalize('NFKC').trim().toLocaleLowerCase('de-DE');
const emailAlias=s=>'u'+hash(normalizedName(s)).slice(0,48)+'@accounts.ecb.invalid';
const safeString=(v,max=100)=>typeof v==='string'?v.trim().slice(0,max):'';
const requireString=(v,limit)=>{const s=safeString(v,limit+1);if(!s||s.length>limit)throw new HttpsError('invalid-argument','Ungültige Eingabe');return s;};
async function identity(request,role='staff',allowPasswordChange=false){
 if(!request.auth?.uid)throw new HttpsError('unauthenticated','Bitte anmelden.');
 const user=await auth.getUser(request.auth.uid);
 if(user.disabled)throw new HttpsError('permission-denied','Zugang ist gesperrt.');
 if(!user.customClaims?.ecbStaff)throw new HttpsError('permission-denied','Mitarbeiterrolle noch nicht freigeschaltet.');
 if(role==='admin'&&!user.customClaims?.ecbAdmin)throw new HttpsError('permission-denied','Nur Administratoren.');
 const profile=await db.collection('ecb_staff_profiles').doc(user.uid).get();
 // Existing owner account can bootstrap as admin; other users always need their profile.
 if(!profile.exists)throw new HttpsError('failed-precondition','Mitarbeiterprofil fehlt. Admin-Freischaltung erforderlich.');
 if(!allowPasswordChange&&profile.data()?.mustChangePassword===true)
   throw new HttpsError('failed-precondition','Bitte zuerst das temporäre Passwort ändern.');
 if(profile.data()?.disabled===true)throw new HttpsError('permission-denied','Zugang ist gesperrt.');
 return {user,profile:profile.data()};
}
const NAME=/^[\p{L}\p{N}_.-]{3,50}$/u;
const generatedPassword=()=>randomBytes(24).toString('base64url');
export const adminCreateUser=onCall(callable,async request=>{
 await identity(request,'admin');
 const username=requireString(request.data?.username,50);
 const displayName=requireString(request.data?.displayName,100);
 if(!NAME.test(username))throw new HttpsError('invalid-argument','Benutzername: 3–50 Zeichen, Buchstaben, Zahlen, Punkt, Unterstrich oder Bindestrich.');
 const email=emailAlias(username),tempPassword=generatedPassword();
 let user;
 try{user=await auth.createUser({email,displayName,password:tempPassword,disabled:false});}
 catch(e){if(e.code==='auth/email-already-exists')throw new HttpsError('already-exists','Benutzername existiert bereits.');throw e;}
 try{
   await auth.setCustomUserClaims(user.uid,{ecbStaff:true,ecbAdmin:false});
   await db.collection('ecb_staff_profiles').doc(user.uid).create({
     username,displayName,role:'staff',disabled:false,mustChangePassword:true,
     createdBy:request.auth.uid,createdAt:FieldValue.serverTimestamp()
   });
 }catch(error){await auth.deleteUser(user.uid).catch(()=>{});throw error;}
 // Password is shown once and is never stored in Firestore, Github, logs or email.
 return {uid:user.uid,username,displayName,temporaryPassword:tempPassword};
});
export const adminListUsers=onCall(callable,async request=>{
 await identity(request,'admin');
 const snap=await db.collection('ecb_staff_profiles').orderBy('username').limit(250).get();
 return {users:snap.docs.map(d=>({uid:d.id,username:d.data().username,displayName:d.data().displayName,
   role:d.data().role||'staff',disabled:!!d.data().disabled,mustChangePassword:!!d.data().mustChangePassword}))};
});
export const adminSetUserActive=onCall(callable,async request=>{
 await identity(request,'admin');
 const uid=requireString(request.data?.uid,128),active=request.data?.active;
 if(typeof active!=='boolean'||uid===request.auth.uid)throw new HttpsError('invalid-argument','Ungültige Kontoänderung');
 const target=await auth.getUser(uid);
 if(target.customClaims?.ecbAdmin)throw new HttpsError('permission-denied','Administratorkonto kann hier nicht gesperrt werden.');
 await db.collection('ecb_staff_profiles').doc(uid).update({disabled:!active,updatedAt:FieldValue.serverTimestamp()});
 await auth.updateUser(uid,{disabled:!active});
 if(!active)await auth.revokeRefreshTokens(uid);
 return {ok:true};
});
export const adminResetTemporaryPassword=onCall(callable,async request=>{
 await identity(request,'admin');
 const uid=requireString(request.data?.uid,128);
 if(uid===request.auth.uid)throw new HttpsError('invalid-argument','Eigenes Admin-Passwort nicht hier zurücksetzen.');
 const target=await auth.getUser(uid);
 if(target.customClaims?.ecbAdmin)throw new HttpsError('permission-denied','Admin-Passwort nur über den gesonderten Sicherheitsprozess.');
 const password=generatedPassword();
 // Lock the account against data access BEFORE rotating the password.
 await db.collection('ecb_staff_profiles').doc(uid).update({mustChangePassword:true,updatedAt:FieldValue.serverTimestamp()});
 await auth.updateUser(uid,{password});
 await auth.revokeRefreshTokens(uid);
 return {temporaryPassword:password};
});
export const changeMyPassword=onCall(callable,async request=>{
 const {user}=await identity(request,'staff',true);
 const lastLogin=Number(request.auth?.token?.auth_time||0);
 if(!lastLogin||Math.abs(Date.now()/1000-lastLogin)>900)
   throw new HttpsError('failed-precondition','Für den Passwortwechsel bitte erneut anmelden (Sitzung älter als 15 Minuten).');
 const newPassword=requireString(request.data?.newPassword,128);
 if(newPassword.length<12)throw new HttpsError('invalid-argument','Neues Passwort: mindestens 12 Zeichen.');
 await auth.updateUser(user.uid,{password:newPassword});
 await db.collection('ecb_staff_profiles').doc(user.uid).update({
   mustChangePassword:false,passwordChangedAt:FieldValue.serverTimestamp()
 });
 await auth.revokeRefreshTokens(user.uid);
 // Client signs out and requires fresh sign-in using the new password.
 return {ok:true,requiresSignIn:true};
});
const archiveKey=p=>String(p.id||'')+'|'+String(p.machine||'').trim().toLowerCase()+'|'+String(p.date||'').trim();
export const adminArchiveProtocol=onCall(callable,async request=>{
 await identity(request,'admin');
 const id=requireString(request.data?.protocolId,120);
 const p=await readProtocol(id);
 const key=archiveKey(p);
 await db.collection('ecb_archived_protocols').doc(hash(key)).set({
   key,id:p.id,machine:p.machine,date:p.date,archivedBy:request.auth.uid,
   archivedAt:FieldValue.serverTimestamp(),state:'archived'
 });
 // Deliberately reversible. Original legacy docs, photos and signatures stay intact.
 return {ok:true,archivedKey:key,reversible:true};
});
export const adminRestoreProtocol=onCall(callable,async request=>{
 await identity(request,'admin');
 const archiveId=requireString(request.data?.archiveId,64);
 if(!/^[0-9a-f]{64}$/.test(archiveId))throw new HttpsError('invalid-argument','Ungültige Archiv-ID.');
 await db.collection('ecb_archived_protocols').doc(archiveId).delete();
 return {ok:true};
});
const sources=[
 db.collection('ecb_protocols'),
 db.collection('artifacts').doc('ecb-maintenance').collection('public').doc('data').collection('protocols'),
 db.collection('artifacts').doc('ecb-maintenance-live').collection('public').doc('data').collection('protocols')
];
async function readProtocol(id){
 const found=[];
 for(const coll of sources){
   const snaps=await coll.where('id','==',id).limit(5).get();
   for(const doc of snaps.docs)found.push({id:doc.id,...doc.data()});
   if(snaps.empty){const direct=await coll.doc(id).get();if(direct.exists)found.push({id:direct.id,...direct.data()});}
 }
 if(!found.length)throw new HttpsError('not-found','Protokoll nicht in Firebase gefunden.');
 const keys=new Set(found.map(p=>archiveKey(p)));
 if(keys.size!==1)throw new HttpsError('failed-precondition','Mehrere unterschiedliche Protokolle mit gleicher Nummer. Bitte Admin prüfen lassen.');
 const base={...found[0]},seen=new Set(),photos=[];
 for(const rec of found){
   for(const ph of Array.isArray(rec.photos)?rec.photos:[]){
     const key=typeof ph==='string'?ph:JSON.stringify(ph);
     if(!seen.has(key)){photos.push(ph);seen.add(key);}
   }
   if(!base.signature&&rec.signature)base.signature=rec.signature;
   if((rec.points?.length||0)>(base.points?.length||0))base.points=rec.points;
   if(!base.remarks&&rec.remarks)base.remarks=rec.remarks;
 }
 base.photos=photos;
 return base;
}
// Email is handled EXCLUSIVELY by free-mail-worker (Cloudflare Free + Resend Free).
// Never deploy a parallel SMTP/Firestore mail trigger, which could duplicate emails.

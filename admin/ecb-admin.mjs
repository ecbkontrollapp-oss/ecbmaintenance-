// ECB Wartung: admin UI and self-service password change.
// All privileged actions go through Firebase callable functions (server checks claims).
import {getApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getFirestore,collection,doc,onSnapshot,query,orderBy,limit} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const app=getApp(),auth=getAuth(app),db=getFirestore(app),funcs=getFunctions(app,'europe-west3');
const $=id=>document.getElementById(id);
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;'}[c]));
const request=async(name,data={})=>(await httpsCallable(funcs,name,{timeout:90000})(data)).data;
const explain=e=>{
  if(String(e?.code||'').includes('not-found'))return 'Der ECB-Serverdienst wurde noch nicht freigeschaltet. Bitte erst die geprüften Firebase Functions bereitstellen.';
  if(String(e?.code||'').includes('permission-denied'))return 'Keine Berechtigung für diese Aktion. Adminrolle oder erster Passwortwechsel fehlt.';
  if(String(e?.code||'').includes('unauthenticated'))return 'Bitte erneut anmelden.';
  return String(e?.message||'Aktion fehlgeschlagen').slice(0,300);
};
const status=(message,isError=false)=>{const el=$('ecb-admin-status');if(el){el.textContent=message;el.style.color=isError?'#ad3535':'#386927';}};
let currentUid='',profileStop=null,archiveStop=null,mailStop=null,lastTemp='',mailInFlight=new Set(),passwordForced=false;
const nav=$('ecb-admin-nav');
const setPasswordWall=open=>{
  const show=!!open||passwordForced;
  document.body.classList.toggle('ecb-password-pending',show);
  const wall=$('ecb-password-wall');if(wall)wall.hidden=!show;
  const cancel=$('ecb-password-change-cancel');if(cancel)cancel.hidden=passwordForced;
};
const clearSecrets=()=>{
 lastTemp='';const cell=$('ecb-admin-temp-password');
 if(cell)cell.textContent='';
 if($('ecb-admin-temp-result'))$('ecb-admin-temp-result').hidden=true;
};
const showTemporary=(value)=>{
 lastTemp=value;
 $('ecb-admin-temp-password').textContent=value;
 $('ecb-admin-temp-result').hidden=false;
 status('Temporäres Passwort erstellt. Es wird nur einmal angezeigt. Bitte sicher an den Mitarbeiter weitergeben.');
};
const renderUsers=users=>{
 const parent=$('ecb-admin-users');
 if(!users.length){parent.textContent='Noch keine Mitarbeiter in der neuen Benutzerverwaltung.';return;}
 parent.innerHTML=users.map(u=>'<div class="ecb-user-row"><div><strong>'+safe(u.displayName)+'</strong><small>'+
   safe(u.username)+' · '+(u.role==='admin'?'Admin':'Mitarbeiter')+' · '+
   (u.disabled?'Gesperrt':u.mustChangePassword?'Passwortwechsel ausstehend':'Aktiv')+
   '</small></div>'+(u.role==='admin'?'':('<div class="ecb-user-actions"><button type="button" class="button subtle" data-ecb-reset="'+safe(u.uid)+'">Startpasswort</button>'+
   '<button type="button" class="button subtle" data-ecb-toggle="'+safe(u.uid)+'" data-ecb-active="'+String(u.disabled)+'">'+
   (u.disabled?'Entsperren':'Sperren')+'</button></div>'))+'</div>').join('');
};
const loadUsers=async()=>{
 try{const value=await request('adminListUsers');renderUsers(value.users||[]);}
 catch(e){status(explain(e),true);}
};
$('ecb-admin-users')?.addEventListener('click',async e=>{
 const btn=e.target.closest('button');if(!btn||btn.disabled)return;
 btn.disabled=true;clearSecrets();
 try{
   if(btn.dataset.ecbReset){
     if(!confirm('Neues einmaliges Startpasswort für diesen Mitarbeiter erzeugen? Das bisherige Passwort funktioniert danach nicht mehr.'))return;
     const result=await request('adminResetTemporaryPassword',{uid:btn.dataset.ecbReset});
     showTemporary(result.temporaryPassword);
   }else if(btn.dataset.ecbToggle){
     const active=btn.dataset.ecbActive==='true';
     if(!confirm('Mitarbeiter '+(active?'entsperren':'sperren')+'?'))return;
     await request('adminSetUserActive',{uid:btn.dataset.ecbToggle,active});
     status('Mitarbeiterkonto aktualisiert.');await loadUsers();
   }
 }catch(err){status(explain(err),true);}finally{btn.disabled=false;}
});
$('ecb-admin-create-user')?.addEventListener('submit',async event=>{
 event.preventDefault();const btn=$('ecb-admin-create-btn');if(btn.disabled)return;
 clearSecrets();btn.disabled=true;status('Mitarbeiterkonto wird sicher erstellt …');
 try{
   const username=$('ecb-user-name').value.trim(),displayName=$('ecb-user-fullname').value.trim();
   const result=await request('adminCreateUser',{username,displayName});
   showTemporary(result.temporaryPassword);
   event.currentTarget.reset();await loadUsers();
 }catch(e){status(explain(e),true);}finally{btn.disabled=false;}
});
$('ecb-admin-copy-temp')?.addEventListener('click',async()=>{
 if(!lastTemp)return;
 try{await navigator.clipboard.writeText(lastTemp);status('Startpasswort kopiert. Bitte sicher übermitteln.');}
 catch{status('Kopieren ist auf diesem Gerät nicht verfügbar.',true);}
});
$('ecb-password-change-form')?.addEventListener('submit',async event=>{
 event.preventDefault();const password=$('ecb-new-password').value,repeat=$('ecb-repeat-password').value,
 btn=$('ecb-change-password-btn'),message=$('ecb-password-change-error');
 if(password.length<12){message.textContent='Mindestens 12 Zeichen erforderlich.';return}
 if(password!==repeat){message.textContent='Die Passwörter stimmen nicht überein.';return}
 btn.disabled=true;message.textContent='Passwort wird geändert …';
 try{
   await request('changeMyPassword',{newPassword:password});
   event.currentTarget.reset();message.textContent='Gespeichert. Bitte jetzt mit deinem neuen Passwort anmelden.';
   passwordForced=false;
   await signOut(auth);setPasswordWall(false);
 }catch(e){message.textContent=explain(e);}finally{btn.disabled=false;}
});
$('ecb-open-password-change')?.addEventListener('click',()=>setPasswordWall(true));
$('ecb-password-change-cancel')?.addEventListener('click',()=>setPasswordWall(false));

const archiveKey=p=>String(p.id||'')+'|'+String(p.machine||'').trim().toLowerCase()+'|'+String(p.date||'').trim();
const loadArchives=()=>{
 archiveStop?.();archiveStop=onSnapshot(collection(db,'ecb_archived_protocols'),snapshot=>{
   const values=snapshot.docs.map(d=>({archiveId:d.id,...d.data()}));
   window.ECB_ARCHIVED_KEYS=new Set(values.map(p=>p.key));
   if(window.ECB_LAST_RAW_DOCS)window.ECB_ACCEPT_SNAPSHOT?.(window.ECB_LAST_RAW_DOCS,!!window.ECB_LAST_FROM_CACHE);
   const container=$('ecb-admin-archive-list');if(!container)return;
   container.innerHTML=values.length?values.map(r=>'<div class="ecb-user-row"><div><strong>'+safe(r.id)+'</strong><small>'+
     safe(r.machine)+' · '+safe(r.date)+'</small></div><button class="button subtle" data-ecb-restore="'+safe(r.archiveId)+'">Wiederherstellen</button></div>').join(''):'Keine archivierten Protokolle.';
 },error=>status('Archiv: '+explain(error),true));
};
$('ecb-admin-archive-list')?.addEventListener('click',async e=>{
 const button=e.target.closest('[data-ecb-restore]');if(!button||button.disabled)return;
 if(!confirm('Dieses Protokoll wieder in der aktiven Historie anzeigen?'))return;
 button.disabled=true;
 try{await request('adminRestoreProtocol',{archiveId:button.dataset.ecbRestore});status('Protokoll wiederhergestellt.');}
 catch(err){status(explain(err),true);}finally{button.disabled=false;}
});
$('history-body')?.addEventListener('click',async event=>{
 const button=event.target.closest('[data-ecb-mail],[data-ecb-archive]');
 if(!button||button.disabled)return;
 const protocolId=button.dataset.ecbMail||button.dataset.ecbArchive;
 const selected=(window.ECB_LAST_RAW_DOCS||[]).find(row=>String(row.data?.id||row.id)===String(protocolId));
 if(!selected){alert('Protokoll nicht gefunden. Bitte Cloud-Abgleich prüfen.');return;}
 const p={id:selected.data?.id||selected.id,...selected.data};
 button.disabled=true;
 try{
   if(button.hasAttribute('data-ecb-mail')){
     const recipient=prompt('Wohin soll das vollständige PDF-Protokoll gesendet werden?', 'pb@ecb-system.de');
     if(recipient===null)return;
     const to=recipient.trim()||'pb@ecb-system.de';
     if(!confirm('Protokoll '+p.id+' einmalig als PDF an '+to+' senden?'))return;
     const id=crypto.randomUUID();
     if(mailInFlight.has(p.id))return;mailInFlight.add(p.id);
     try{
       const result=await request('sendProtocolEmail',{protocolId:p.id,recipient:to,requestId:id});
       alert(result.ok?'E-Mail erfolgreich vom Mailserver angenommen.':'Versand wurde bereits angefordert. Kein Doppelversand.');
     }finally{mailInFlight.delete(p.id);}
   }else{
     if(window.ECB_ADMIN_ROLE!=='admin')throw Error('Nur Administratoren dürfen Protokolle archivieren.');
     if(!confirm('Protokoll '+p.id+' aus der aktiven Ansicht entfernen? Die Originaldaten bleiben für eine Wiederherstellung erhalten.'))return;
     await request('adminArchiveProtocol',{protocolId:p.id});
     alert('Protokoll archiviert und wiederherstellbar.');
   }
 }catch(err){alert(explain(err));}finally{button.disabled=false;}
});
onAuthStateChanged(auth,async user=>{
 profileStop?.();archiveStop?.();mailStop?.();profileStop=null;archiveStop=null;mailStop=null;clearSecrets();
 passwordForced=false;currentUid=user?.uid||'';window.ECB_ADMIN_ROLE=null;window.ECB_ARCHIVED_KEYS=new Set();
 if(nav)nav.hidden=true;
 setPasswordWall(false);
 if(!user)return;
 let role;
 try{
   const token=await user.getIdTokenResult(true);
   if(currentUid!==user.uid)return;
   role=token.claims.ecbAdmin?'admin':token.claims.ecbStaff?'staff':'unassigned';
 }catch(e){status('Anmeldestatus: '+explain(e),true);return;}
 window.ECB_ADMIN_ROLE=role;
 if(nav)nav.hidden=role!=='admin';
 window.renderHistory?.();
 if(role==='unassigned'){status('Firebase-Konto besteht, aber die Mitarbeiter-/Adminfreigabe wurde noch nicht vorgenommen.',true);return;}
 profileStop=onSnapshot(doc(db,'ecb_staff_profiles',user.uid),snapshot=>{
   const profile=snapshot.data();
   if(!profile){status('Mitarbeiterprofil fehlt. Firebase-Adminfreigabe erforderlich.',true);return;}
   if(profile.disabled){signOut(auth).catch(()=>{});return;}
   passwordForced=profile.mustChangePassword===true;
   setPasswordWall(passwordForced);
 },err=>status('Profil: '+explain(err),true));
 loadArchives();
 if(role==='admin'){
   await loadUsers();
   mailStop=onSnapshot(query(collection(db,'ecb_mail_jobs'),orderBy('createdAt','desc'),limit(30)),snapshot=>{
     const jobs=snapshot.docs.map(d=>d.data());
     const panel=$('ecb-admin-mail-jobs');if(!panel)return;
     panel.innerHTML=jobs.length?jobs.map(j=>'<div class="ecb-user-row"><div><strong>'+safe(j.protocolId)+
       '</strong><small>'+safe(j.recipient)+' · '+(j.automatic?'Automatisch':'Manuell')+'</small></div><b>'+
       safe(j.status)+'</b></div>').join(''):'Noch keine E-Mail-Aufträge.';
   },e=>status('Versandstatus: '+explain(e),true));
 }
});

/* ECB Wartung – staff/admin UI. Firebase privileges are always enforced by callable server functions. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const escape=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 let admin=false,staff=false,mustChangePassword=false,loggedIn=false,users=[],busy=false;
 const needBackend=()=>{
   if(!window.ECB_FUNCTIONS)throw Error('Die sicheren Admin- und E-Mail-Dienste sind noch nicht auf Firebase aktiviert.');
   return window.ECB_FUNCTIONS;
 };
 const msg=(id,t,success=false)=>{
   const element=$(id);if(!element)return;
   element.textContent=t;element.style.color=success?'#246f42':'#ad452a';
 };
 const secured=async(fn)=>{
   if(busy)throw Error('Vorgang wird bereits ausgeführt.');
   busy=true;
   try{return await fn()}finally{busy=false}
 };
 const showPassword=value=>{
   const holder=$('one-time-password');
   if(!holder)return;
   holder.style.display='block';
   $('one-time-password-value').textContent=value;
   $('one-time-password-status').textContent='Dieses zufällig erzeugte Passwort wird nur einmal angezeigt und nicht gespeichert. Bitte sicher an den Mitarbeiter übergeben.';
   $('one-time-password-copy').onclick=()=>navigator.clipboard?.writeText(value).then(()=>msg('one-time-password-status','Temporäres Passwort kopiert.',true)).catch(()=>msg('one-time-password-status','Bitte das angezeigte Passwort manuell kopieren.'));
 };
 function checkRole(){
   $('nav-account').style.display=loggedIn?'':'none';
   $('nav-admin').style.display=admin&&!mustChangePassword?'':'none';
   const who=$('staff-role-status');
   if(who)who.textContent=admin?'Administrator':staff?'Mitarbeiter':'Zugang nicht freigegeben';
   $('must-change-panel').style.display=loggedIn&&mustChangePassword?'block':'none';
   const alert=$('change-pwd-warning');
   if(alert)alert.textContent=mustChangePassword?'Sicherheitsprüfung: Bitte ändere jetzt dein temporäres Passwort. Bis dahin bleiben Protokolle und Wartungen gesperrt.':'Du kannst dein persönliches Passwort hier selbst ändern.';
   if(loggedIn&&mustChangePassword&&typeof goto==='function')goto('account');
   if(!admin&&document.getElementById('view-admin')?.classList.contains('active')&&typeof goto==='function')goto('dashboard');
 }
 window.ECB_UI_ADMIN=()=>admin&&!mustChangePassword;
 window.ECB_UI_STAFF=()=>staff&&!mustChangePassword;
 window.addEventListener('ecb-auth-state',event=>{
   const detail=event.detail||{};
   loggedIn=!!detail.loggedIn;staff=!!detail.staff;admin=!!detail.admin;mustChangePassword=!!detail.mustChangePassword;
   users=[];checkRole();
   if(admin&&!mustChangePassword)refreshUsers();
 });
 window.addEventListener('ecb-archive-changed',()=>{
   if(typeof renderHistory==='function')renderHistory();
   if(typeof renderDashboard==='function')renderDashboard();
   renderArchives();
 });
 const sendButton=(protocolId)=>{
   if(!window.ECB_UI_STAFF())return;
   openModal('Protokoll per E-Mail versenden','Das vollständige PDF mit Bildern und Unterschrift wird serverseitig erstellt.', '<form id="email-protocol-form">'+
     '<input type="hidden" id="email-protocol-id" value="'+escape(protocolId)+'">'+
     '<div class="field"><label for="email-protocol-recipient">Empfängeradresse</label><input id="email-protocol-recipient" type="email" value="pb@ecb-system.de" autocomplete="email" required></div>'+
     '<p class="muted" style="margin:11px 0">Wähle Versenden nur einmal; der Server verhindert doppelte Versandanfragen.</p>'+
     '<button class="button primary" type="submit" id="email-confirm-button">PDF per E-Mail versenden</button>'+
     '<p id="email-protocol-status" role="status" class="muted"></p></form>');
 };
 $('history-body').addEventListener('click',event=>{
   const mail=event.target.closest('[data-email-protocol]');
   if(mail){sendButton(mail.dataset.emailProtocol);return;}
   const archive=event.target.closest('[data-archive-protocol]');
   if(archive&&admin){
     const id=archive.dataset.archiveProtocol;
     if(!confirm('Protokoll '+id+' aus der aktiven Ansicht archivieren? Die Originaldaten bleiben erhalten und können wiederhergestellt werden.'))return;
     secured(async()=>{
       const result=await needBackend().adminArchiveProtocol({protocolId:id});
       if(!result?.data?.ok)throw Error('Archivierung nicht bestätigt');
       alert('Protokoll wurde archiviert. Die alten Firebase-Daten wurden nicht gelöscht.');
     }).catch(e=>alert('Archivieren fehlgeschlagen: '+(e.message||e)));
   }
 });
 $('modal-content').addEventListener('submit',async event=>{
   if(event.target.id!=='email-protocol-form')return;
   event.preventDefault();
   const btn=$('email-confirm-button'),pId=$('email-protocol-id')?.value,recipient=$('email-protocol-recipient')?.value.trim();
   if(!pId||!recipient)return;
   btn.disabled=true;msg('email-protocol-status','PDF wird erstellt und Versand geprüft ...',true);
   try{
     const requestId=crypto.randomUUID();
     const result=await needBackend().sendProtocolEmail({protocolId:pId,recipient,requestId});
     if(result.data?.ok&&result.data?.status==='sent')msg('email-protocol-status','E-Mail wurde vom Mailserver angenommen.',true);
     else msg('email-protocol-status','Die Versandanforderung liegt bereits vor. Bitte Status prüfen, nicht erneut senden.');
   }catch(e){msg('email-protocol-status','Versand noch nicht bestätigt: '+(e.message||e)+' Bitte nicht mehrfach versenden.');}
   finally{btn.disabled=false;}
 });
 async function refreshUsers(){
   if(!admin)return;
   try{
     const result=await needBackend().adminListUsers({});
     users=Array.isArray(result.data?.users)?result.data.users:[];
     renderUsers();
     msg('admin-feedback',users.length+' Benutzerkonten geladen.',true);
   }catch(e){msg('admin-feedback',e.message||String(e));}
 }
 function renderUsers(){
   $('admin-users-list').innerHTML=users.map(user=>'<div class="admin-user-row">'+
     '<div><strong>'+escape(user.displayName)+'</strong><small>'+escape(user.username)+' · '+(user.disabled?'Gesperrt':user.mustChangePassword?'Startpasswort aktiv':'Aktiv')+'</small></div>'+
     '<div class="admin-row-actions"><button class="button subtle" type="button" data-reset-uid="'+escape(user.uid)+'">Startpasswort</button>'+
     '<button class="button subtle" type="button" data-toggle-uid="'+escape(user.uid)+'" data-active="'+String(!!user.disabled)+'">'+(user.disabled?'Freigeben':'Sperren')+'</button></div></div>').join('')||'<p class="muted">Noch keine Mitarbeiter erfasst.</p>';
 }
 $('admin-users-list').addEventListener('click',async event=>{
   if(!admin)return;
   const reset=event.target.closest('[data-reset-uid]');
   const toggle=event.target.closest('[data-toggle-uid]');
   if(!reset&&!toggle)return;
   const uid=(reset||toggle).dataset.resetUid||(toggle?.dataset.toggleUid);
   if(reset&&!confirm('Für diesen Mitarbeiter ein neues einmaliges Startpasswort ausstellen? Sein bisheriges Passwort wird ungültig.'))return;
   if(toggle&&!confirm('Mitarbeiterzugang wirklich '+(toggle.dataset.active==='true'?'freigeben':'sperren')+'?'))return;
   try{
     await secured(async()=>{
       if(reset){
         const r=await needBackend().adminResetTemporaryPassword({uid});
         if(!r.data?.temporaryPassword)throw Error('Startpasswort nicht bestätigt');
         showPassword(r.data.temporaryPassword);
       }else{
         const r=await needBackend().adminSetUserActive({uid,active:toggle.dataset.active==='true'});
         if(!r.data?.ok)throw Error('Zugang wurde nicht geändert');
       }
     });
     await refreshUsers();
   }catch(e){msg('admin-feedback',e.message||String(e));}
 });
 $('admin-create-user').addEventListener('submit',async e=>{
   e.preventDefault();if(!admin)return;
   const username=$('admin-new-username').value.trim();
   const displayName=$('admin-new-name').value.trim();
   const btn=$('admin-create-submit');btn.disabled=true;
   try{
     const r=await secured(()=>needBackend().adminCreateUser({username,displayName}));
     if(!r.data?.temporaryPassword)throw Error('Benutzererstellung nicht bestätigt');
     showPassword(r.data.temporaryPassword);
     e.target.reset();msg('admin-feedback','Mitarbeiter angelegt. Das einmalige Passwort wird unten angezeigt.',true);
     await refreshUsers();
   }catch(err){msg('admin-feedback',err.message||String(err))}
   finally{btn.disabled=false;}
 });
 $('account-password-form').addEventListener('submit',async e=>{
   e.preventDefault();
   const password=$('account-new-password').value;
   const check=$('account-repeat-password').value;
   if(password.length<12||password!==check){msg('account-password-feedback','Mindestens 12 Zeichen; beide Eingaben müssen übereinstimmen.');return;}
   const btn=$('account-change-submit');btn.disabled=true;
   try{
     const r=await secured(()=>needBackend().changeMyPassword({newPassword:password}));
     if(!r.data?.ok)throw Error('Passwortänderung nicht bestätigt');
     e.target.reset();
     msg('account-password-feedback','Passwort geändert. Bitte melde dich mit dem neuen Passwort erneut an.',true);
     await window.ECB_LOGOUT?.();
   }catch(err){msg('account-password-feedback','Passwortänderung fehlgeschlagen: '+(err.message||err));}
   finally{btn.disabled=false;}
 });
 function renderArchives(){
   const container=$('admin-archives-list');
   if(!container)return;
   const archived=window.ECB_ARCHIVED_ITEMS?.()||[];
   container.innerHTML=!admin?'<p>Nur für Administratoren.</p>':archived.map(item=>
     '<div class="admin-user-row"><div><b>'+escape(item.id)+'</b><small>'+escape(item.machine)+' · '+escape(item.date)+'</small></div>'+
     '<button class="button subtle" type="button" data-restore-archive="'+escape(item.archiveId)+'">Wiederherstellen</button></div>'
   ).join('')||'<p class="muted">Keine archivierten Protokolle.</p>';
 }
 $('admin-archives-list').addEventListener('click',async e=>{
   if(!admin)return;
   const restore=e.target.closest('[data-restore-archive]');if(!restore)return;
   if(!confirm('Archiviertes Protokoll in der Übersicht wiederherstellen?'))return;
   try{const r=await secured(()=>needBackend().adminRestoreProtocol({archiveId:restore.dataset.restoreArchive}));
     if(!r.data?.ok)throw Error('Wiederherstellung nicht bestätigt');
     msg('admin-feedback','Protokoll wurde wieder sichtbar gemacht.',true);
   }catch(error){msg('admin-feedback',error.message||String(error));}
 });
 $('admin-refresh-users').addEventListener('click',refreshUsers);
 checkRole();
})();
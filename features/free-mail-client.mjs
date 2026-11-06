// Free mail client for ECB Wartung. No sender key or SMTP password is in the browser.
// The Cloudflare Worker checks the Firebase token, persisted protocol and staff claims.
import {getApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const PHOTO_MAX=6*1024*1024,DESTINATION='pb@ecb-system.de';
window.ECB_FREE_MAIL_ENDPOINT=window.ECB_FREE_MAIL_ENDPOINT||'https://ecb-wartung-free-mail.ecbmaintenance-mail.workers.dev/send-protocol';
const urlOf=x=>typeof x==='string'?x:x?.dataUrl||x?.data||x?.url||x?.src||'';
const clean=v=>String(v??'').replace(/[\r\n]+/g,' ');
async function buildPdf(p){
 if(!p?.id||!p.machine||!Array.isArray(p.points)||!p.signature)
   throw Error('Das vollständig gespeicherte Protokoll mit Unterschrift ist erforderlich.');
 const API=window.jspdf?.jsPDF;
 if(!API)throw Error('PDF-Bibliothek ist nicht geladen. Kein Versand erfolgt.');
 const pdf=new API({format:'a4',unit:'mm'});
 const margin=16,usable=178;
 let y=14;
 const next=h=>{if(y+h>274){pdf.addPage();y=18;}};
 const line=(v,size=10,bold=false)=>{
   pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);
   for(const l of pdf.splitTextToSize(clean(v),usable)){next(5);pdf.text(l,margin,y);y+=5;}
   y+=3;
 };
 // imageToPdfData is the app's original image-loading helper. It rejects broken photos.
 const originalLogo=document.querySelector('img[data-ecb-logo]')?.src;
 if(!originalLogo)throw Error('ECB-Original-Logo fehlt. PDF wird nicht versendet.');
 const logo=await window.imageToPdfData(originalLogo,'PNG');
 next(28);pdf.addImage(logo.data,'PNG',margin,y,48,Math.min(24,48*logo.height/logo.width));
 pdf.setFont('helvetica','bold');pdf.setFontSize(14);
 pdf.text('E.C.B. Reinigungssysteme GmbH',65,y+9);
 pdf.setFont('helvetica','normal');pdf.setFontSize(9);
 pdf.text('Digitales Wartungs- und Prüfprotokoll',65,y+15);
 y+=32;
 line('Protokoll: '+p.id,12,true);
 line('Anlage: '+p.machine,10,true);
 line('Datum: '+(p.date||''));
 line('Techniker: '+(p.employee||''));
 if(p.runtime)line('Betriebsstunden: '+p.runtime);
 y+=5;line('PRÜFPUNKTE',11,true);
 for(const [i,pt] of p.points.entries())line((i+1)+'. '+(pt.title||pt.name||'Prüfung')+' – '+(pt.status||'offen'),9);
 if(p.remarks){y+=5;line('BEMERKUNGEN',11,true);line(p.remarks,9);}
 const photos=Array.isArray(p.photos)?p.photos:[];
 if(photos.length){y+=5;line('ORIGINALFOTOS ('+photos.length+')',11,true);}
 for(const [i,item] of photos.entries()){
   const u=urlOf(item);if(!u)throw Error('Originalfoto '+(i+1)+' fehlt. Kein Versand erfolgt.');
   const img=await window.imageToPdfData(u,'JPEG');
   const scale=Math.min(1,usable/img.width*0.2645833,100/img.height*0.2645833);
   const width=Math.max(1,img.width*scale*0.2645833),height=Math.max(1,img.height*scale*0.2645833);
   next(height+18);pdf.addImage(img.data,'JPEG',margin,y,width,height);
   y+=height+5;line('Foto '+(i+1),8);
 }
 const sigUrl=urlOf(p.signature);
 if(!sigUrl)throw Error('Original-Unterschrift fehlt. Kein Versand erfolgt.');
 const sig=await window.imageToPdfData(sigUrl,'PNG');
 y+=5;line('UNTERSCHRIFT',11,true);
 const sigH=Math.min(38,115*sig.height/sig.width),sigW=Math.min(115,38*sig.width/sig.height);
 next(sigH+7);pdf.addImage(sig.data,'PNG',margin,y,sigW,sigH);
 const count=pdf.getNumberOfPages();
 for(let page=1;page<=count;page++){
   pdf.setPage(page);pdf.setFontSize(8);pdf.setTextColor(110);
   pdf.text('ECB Wartung | '+clean(p.id)+' | '+page+' / '+count,margin,288);
 }
 const base64=pdf.output('datauristring').split(',')[1];
 if(!base64||base64.length>PHOTO_MAX*4/3)throw Error('PDF überschreitet das kostenlose Versandlimit.');
 return base64;
}
window.ECB_FREE_MAIL={
 async send({mode,protocol,recipient=DESTINATION,requestId=crypto.randomUUID(),sourcePath}){
  const endpoint=String(window.ECB_FREE_MAIL_ENDPOINT||'').trim();
  if(!/^https:\/\/[a-zA-Z0-9.-]+\/send-protocol$/.test(endpoint))
    throw Error('Der kostenlose ECB-Maildienst wurde noch nicht eingerichtet. Wartung bleibt gespeichert.');
  if(!protocol?.id||!sourcePath)throw Error('Cloud-Quelle des Protokolls unbekannt. Es wurde keine E-Mail verschickt.');
  const app=getApp(),auth=getAuth(app),user=auth.currentUser;
  if(!user)throw Error('Bitte zuerst anmelden.');
  // Build and verify the entire PDF locally. No PDF content is stored in Cloudflare.
  const pdfBase64=await buildPdf(protocol);
  const token=await user.getIdToken();
  const response=await fetch(endpoint,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({mode,protocolId:protocol.id,sourcePath,recipient,requestId,pdfBase64})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok){
    throw Error(result.error||'E-Mail nicht bestätigt. Bitte Versandstatus prüfen, nicht blind erneut senden.');
  }
  return result;
 }
};

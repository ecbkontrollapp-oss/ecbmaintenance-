import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {PDFDocument,PDFName} from 'pdf-lib';
import {buildProtocolPdf} from '../pdf.mjs';
const asData=buf=>'data:image/png;base64,'+buf.toString('base64');
test('server PDF embeds the original ECB logo, photos, and signature',async()=>{
 const photo=await sharp({create:{width:120,height:90,channels:4,
   background:{r:160,g:190,b:130,alpha:1}}}).png().toBuffer();
 const signature=await sharp({create:{width:200,height:70,channels:4,
   background:{r:255,g:255,b:255,alpha:1}}}).png().toBuffer();
 const input={id:'ECB-TEST-001',machine:'Waschmaschine 4',date:'05.11.2026',
   category:'Wartung',employee:'Test-Techniker',points:[{title:'Schutzleiter prüfen',status:'erledigt'}],
   photos:[asData(photo)],signature:asData(signature),remarks:'Funktionsprüfung bestanden'};
 const bytes=await buildProtocolPdf(input);
 assert.ok(bytes.length>2000);
 assert.equal(bytes.subarray(0,5).toString('ascii'),'%PDF-');
 const pdf=await PDFDocument.load(bytes);
 assert.ok(pdf.getPageCount()>=1);
 const imageCount=[...pdf.context.enumerateIndirectObjects()].filter(([,obj])=>
   obj?.dict?.get?.(PDFName.of('Subtype'))?.toString()==='/Image').length;
 assert.ok(imageCount>=3,'Logo + photo + technician signature must be embedded');
});
test('server refuses an incomplete PDF without a signature',async()=>{
 await assert.rejects(buildProtocolPdf({id:'X',machine:'Waschmaschine',points:[],photos:[]}),
   /Unterschrift fehlt/);
});
test('server refuses to silently omit a malformed original photo',async()=>{
 await assert.rejects(buildProtocolPdf({id:'X',machine:'Waschmaschine',points:[],
   photos:['https://unknown.example/photo.png'],signature:'data:image/png;base64,AAA='}),
   /Originalfoto/);
});

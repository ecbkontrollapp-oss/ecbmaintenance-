// Original Firestore data -> standalone PDF attachment. Never silently omit a photo or signature.
import {readFile} from 'node:fs/promises';
import {PDFDocument, StandardFonts, rgb} from 'pdf-lib';
import sharp from 'sharp';
const MAX_IMAGE=12*1024*1024;
const MAX_PDF=18*1024*1024;
const safe=v=>String(v??'').replace(/[\u0000-\u001f]/g,' ').replace(/[^\u0020-\u00ff]/g,'?');
const photoData=p=>typeof p==='string'?p:(p?.dataUrl||p?.data||p?.src||p?.url||'');
async function embedImage(pdf,item){
  const data=photoData(item);
  const m=/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(data);
  if(!m)throw Error('Bild ist kein unterstütztes eingebettetes Originalfoto');
  const bytes=Buffer.from(m[2].replace(/\s/g,''),'base64');
  if(!bytes.length||bytes.length>MAX_IMAGE)throw Error('Bilddaten fehlen oder sind zu groß');
  const png=await sharp(bytes,{failOn:'error',limitInputPixels:30_000_000}).rotate().png().toBuffer();
  return pdf.embedPng(png);
}
export async function buildProtocolPdf(p){
  if(!p||!p.id||!p.machine||!Array.isArray(p.points))throw Error('Unvollständiges Wartungsprotokoll');
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),
    bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const A4=[595.28,841.89],margin=42,green=rgb(.30,.54,.19),ink=rgb(.11,.18,.15);
  let page=pdf.addPage(A4),y=794;
  const next=(height=25)=>{if(y-height<48){page=pdf.addPage(A4);y=794;}};
  const line=(text,{size=10,strong=false,color=ink,space=17}={})=>{
    const str=safe(text),f=strong?bold:font,max=510;
    let current='';
    const words=str.split(/\s+/);
    for(const w of words){
      let joined=current?current+' '+w:w;
      if(f.widthOfTextAtSize(joined,size)>max&&current){next(space);page.drawText(current,{x:margin,y,size,font:f,color});y-=space;current=w;}
      else current=joined;
      // split long tokens conservatively, preventing off-page overflows
      while(current.length>1&&f.widthOfTextAtSize(current,size)>max){
        let cut=current.length-1;while(cut>1&&f.widthOfTextAtSize(current.slice(0,cut),size)>max)cut--;
        next(space);page.drawText(current.slice(0,cut),{x:margin,y,size,font:f,color});y-=space;current=current.slice(cut);
      }
    }
    next(space);if(current)page.drawText(current,{x:margin,y,size,font:f,color});y-=space;
  };
  try{
    const b64=(await readFile(new URL('./assets/ecb-logo.b64',import.meta.url),'utf8')).trim();
    const image=await pdf.embedPng(await sharp(Buffer.from(b64,'base64')).png().toBuffer());
    page.drawImage(image,{x:margin,y:744,width:83,height:65});
  }catch{throw Error('ECB-Original-Logo für PDF fehlt');}
  page.drawText('E.C.B. REINIGUNGSSYSTEME GmbH',{x:145,y:783,size:14,font:bold,color:green});
  page.drawText('Digitales Wartungsprotokoll',{x:145,y:760,size:11,font,color:ink});
  y=722;
  line('Protokoll: '+p.id,{size:12,strong:true,space:24});
  line('Maschine: '+p.machine,{strong:true});
  line('Kategorie: '+(p.category||p.type||''));
  line('Datum: '+(p.date||''));
  line('Techniker: '+(p.employee||''));
  if(p.runtime)line('Betriebsstunden: '+p.runtime);
  y-=12;
  line('PRÜFPUNKTE',{size:11,strong:true,color:green,space:22});
  for(const [idx,pt] of p.points.entries()){
    line((idx+1)+'. '+(pt.title||'Prüfung')+' — '+(pt.status||'offen'),{space:17});
  }
  if(p.remarks){y-=10;line('BEMERKUNGEN',{size:11,strong:true,color:green,space:21});line(p.remarks);}
  const photos=Array.isArray(p.photos)?p.photos:[];
  if(photos.length){
    y-=12;line('ORIGINALFOTOS ('+photos.length+')',{size:11,strong:true,color:green,space:22});
    for(let i=0;i<photos.length;i++){
      const img=await embedImage(pdf,photos[i]),s=img.scale(1);
      const ratio=Math.min(1,490/s.width,280/s.height);
      const width=s.width*ratio,height=s.height*ratio;
      next(height+35);line('Foto '+(i+1),{size:9,strong:true,space:16});
      next(height+10);page.drawImage(img,{x:margin,y:y-height,width,height});y-=height+15;
    }
  }
  if(!p.signature)throw Error('Original-Unterschrift fehlt – PDF/E-Mail nicht vollständig');
  const signature=await embedImage(pdf,p.signature);
  y-=12;line('UNTERSCHRIFT TECHNIKER',{size:11,strong:true,color:green,space:22});
  const scale=Math.min(1,260/signature.width,75/signature.height);
  const w=signature.width*scale,h=signature.height*scale;
  next(h+12);page.drawImage(signature,{x:margin,y:y-h,width:w,height:h});y-=h+14;
  const bytes=Buffer.from(await pdf.save());
  if(bytes.length>MAX_PDF)throw Error('PDF zu groß für E-Mail-Anhang');
  return bytes;
}

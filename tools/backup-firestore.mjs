// Read-only Firestore backup of known ECB historical collections.
// Requires Google Application Default Credentials with project read access.
// Backups may contain personal data, image data URLs and signatures; NEVER upload to GitHub.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const PROJECT='ecb-maintenance';
const collections=[
  'ecb_protocols','ecb_dguv_devices','dguv_devices','ecb_users',
  'artifacts/ecb-maintenance/public/data/protocols',
  'artifacts/ecb-maintenance/public/data/dguv_devices',
  'artifacts/ecb-maintenance-live/public/data/protocols',
  'artifacts/ecb-maintenance-live/public/data/dguv_devices'
];
initializeApp({credential:applicationDefault(),projectId:PROJECT});
const db=getFirestore();
const root=resolve('.backups','ecb-maintenance-'+new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(root,{recursive:true,mode:0o700});
const summary={project:PROJECT,createdAt:new Date().toISOString(),collections:{},storage:null};
for(const collectionPath of collections){
  const name=collectionPath.replaceAll('/','__')+'.json';
  try {
    const snapshot=await db.collection(collectionPath).get();
    const data=snapshot.docs.map(doc=>({docId:doc.id,fields:doc.data()}));
    const payload=JSON.stringify({path:collectionPath,documents:data},(key,value)=>{
      if(value&&typeof value.toDate==='function')return {__firebaseTimestamp:value.toDate().toISOString()};
      return value;
    },2);
    const target=join(root,name);
    writeFileSync(target,payload,{mode:0o600,flag:'wx'});
    summary.collections[collectionPath]={count:data.length,sha256:createHash('sha256').update(payload).digest('hex')};
  } catch(error){
    // Never misrepresent failed reads as empty collections.
    summary.collections[collectionPath]={error:String(error?.code||error?.message||error)};
  }
}
// Optional: also back up the Firebase Storage bucket if its name is verified.
if(process.env.ECB_FIREBASE_STORAGE_BUCKET){
  const bucket=getStorage().bucket(process.env.ECB_FIREBASE_STORAGE_BUCKET);
  const [objects]=await bucket.getFiles({autoPaginate:true});
  const storageDir=join(root,'storage');
  mkdirSync(storageDir,{recursive:true,mode:0o700});
  let saved=0,failed=0;
  for(const object of objects){
    const filename=resolve(storageDir,object.name);
    if(!filename.startsWith(storageDir+'/')) {failed++;continue;}
    try {
      mkdirSync(resolve(filename,'..'),{recursive:true,mode:0o700});
      await object.download({destination:filename});
      saved++;
    }catch {failed++;}
  }
  summary.storage={bucket:bucket.name,filesSaved:saved,filesFailed:failed};
}
const json=JSON.stringify(summary,null,2);
writeFileSync(join(root,'manifest.json'),json,{mode:0o600,flag:'wx'});
console.log('Backup created locally: '+root);
console.log(json);
console.log('IMPORTANT: counts and hashes must be verified before migration. Browser-only local data is not included.');
if(Object.values(summary.collections).some(x=>x.error)||summary.storage?.filesFailed) process.exitCode=2;

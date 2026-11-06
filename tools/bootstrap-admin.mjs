// One-time local administrator bootstrap. It does not change passwords.
// Default DRY_RUN. Use --apply only after verified backup and authorization.
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
const PROJECT='ecb-maintenance',username='ECB_Wartung',apply=process.argv.includes('--apply');
const norm=username.normalize('NFKC').trim().toLocaleLowerCase('de-DE');
const alias='u'+createHash('sha256').update(norm).digest('hex').slice(0,48)+'@accounts.ecb.invalid';
initializeApp({credential:applicationDefault(),projectId:PROJECT});
const auth=getAuth(),db=getFirestore();
const user=await auth.getUserByEmail(alias);
if(user.disabled)throw Error('Refusing to bootstrap a disabled account.');
const ref=db.collection('ecb_staff_profiles').doc(user.uid),profile=await ref.get();
if(profile.exists&&(profile.data()?.username||'').toLowerCase()!==norm)throw Error('Refusing to overwrite a different user profile.');
const claims={...(user.customClaims||{}),ecbStaff:true,ecbAdmin:true};
console.log(JSON.stringify({mode:apply?'APPLY':'DRY_RUN',projectId:PROJECT,username,
 accountExists:true,profileExists:profile.exists,willGrant:'ecbStaff, ecbAdmin',
 warning:'No password or old protocol is read, printed, reset or changed.'},null,2));
if(apply){
 await auth.setCustomUserClaims(user.uid,claims);
 await ref.set({username,displayName:user.displayName||'ECB Wartung',role:'admin',
  disabled:false,mustChangePassword:false,updatedAt:FieldValue.serverTimestamp()},{merge:true});
 console.log('Bootstrap completed; the admin must sign out and sign in again to refresh claims.');
}

// Administration only. Never copy service-account keys or passwords into this public repository.
// Default mode is a read-only inventory. Use --apply with an approved roster only after validation.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT = 'ecb-maintenance';
const apply = process.argv.includes('--apply');
const rosterArgument = process.argv.find(arg => arg.startsWith('--approved='));
const approvedFile = rosterArgument ? rosterArgument.slice('--approved='.length) : '';
const normalize = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('de-DE');
const accountAlias = username => {
  const name = normalize(username);
  if (!name || name.length > 80) throw Error('Invalid username');
  const hash = createHash('sha256').update(name).digest('hex').slice(0, 48);
  return 'u' + hash + '@accounts.ecb.invalid';
};
if (apply && !approvedFile) {
  throw Error('Refusing to write: --approved=/secure/approved-users.json is required.');
}
let approved = new Set();
if (approvedFile) {
  const names = JSON.parse(readFileSync(approvedFile, 'utf8'));
  if (!Array.isArray(names) || !names.length) throw Error('Approved roster must contain a nonempty JSON array.');
  approved = new Set(names.map(normalize));
}

initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore(), auth = getAuth();
const users = await db.collection('ecb_users').get();
const stats = { docs: users.size, distinctUsers: 0, missingUserName: 0, missingLegacyPassword: 0,
  tooShort: 0, notApproved: 0, collisions: 0, alreadyExists: 0, created: 0, errors: 0 };
const seen = new Set();
for (const doc of users.docs) {
  const data = doc.data() || {};
  const username = data.username || data.userName || data.login || data.user || data.benutzername;
  if (typeof username !== 'string' || !normalize(username)) { stats.missingUserName++; continue; }
  const key = normalize(username);
  if (seen.has(key)) { stats.collisions++; continue; }
  seen.add(key); stats.distinctUsers++;

  // The prior client may keep passwords only in local HTML/browser storage, not in ecb_users.
  // In that case the script intentionally refuses to invent or change the old password.
  const password = data.password || data.pass || data.pwd || data.passwort;
  if (typeof password !== 'string' || /^\$2[aby]\$|^\$argon2/i.test(password)) {
    stats.missingLegacyPassword++; continue;
  }
  if (password.length < 6) { stats.tooShort++; continue; }
  if (!apply) continue;
  if (!approved.has(key)) { stats.notApproved++; continue; }
  try {
    const email = accountAlias(key);
    try {
      // Never adopt a preexisting unverified account under a predictable alias.
      await auth.getUserByEmail(email);
      stats.alreadyExists++;
      continue;
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
    const created = await auth.createUser({
      email, password,
      displayName: String(data.fullName || data.name || username).slice(0, 120)
    });
    await auth.setCustomUserClaims(created.uid, { ecbStaff: true });
    stats.created++;
  } catch {
    stats.errors++;
  }
}
console.log(JSON.stringify({
  mode: apply ? 'APPLY' : 'DRY_RUN',
  projectId: PROJECT, summary: stats,
  warning: 'No old Firestore document is modified. Do not deploy restrictive rules while the old app is still active.'
}, null, 2));
if (stats.collisions || stats.errors || (apply && stats.notApproved)) process.exitCode = 2;

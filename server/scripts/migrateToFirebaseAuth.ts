/**
 * Migration script — Firebase Authentication (Google Sign-In)
 *
 * Run this ONCE after deploying the Firebase authentication refactor.
 *
 * It performs these SAFE, non-destructive steps:
 *
 *   1. Removes the retired `loginOtp` sub-document from every photographer
 *      record. The photographer OTP flow no longer exists, so the stored
 *      hashes are dead weight (and must not leak into API responses).
 *
 *   2. Clears the `passwordHash` of PHOTOGRAPHER records only. Photographers
 *      authenticate with Google from now on, and keeping a password hash
 *      would be an unnecessary credential. The SUPERADMIN password hash is
 *      left completely untouched.
 *
 *   3. Reports how many photographer records still need to be linked to a
 *      Firebase UID. These are linked automatically — and only after the
 *      backend verifies a Google-signed Firebase ID token for the SAME email
 *      address — the first time each photographer signs in with Google.
 *
 * What it deliberately does NOT do:
 *   - It never sets a `firebaseUid` from an email address. Doing so would
 *     let anyone who can receive mail for that address take over the
 *     account. Linking happens only through a verified Google sign-in.
 *   - It never touches events, Google Drive metadata, audit logs, invitations
 *     or the superadmin account.
 *
 * Usage:
 *   npx tsx server/scripts/migrateToFirebaseAuth.ts            # dry run
 *   npx tsx server/scripts/migrateToFirebaseAuth.ts --apply    # apply
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { Photographer } from '../models/Photographer.js';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  await connectDB();

  console.log(APPLY ? 'APPLYING migration...' : 'DRY RUN (no changes will be written)...');
  console.log('');

  const all = await Photographer.find({}).select(
    '_id email name role status firebaseUid passwordHash loginOtp'
  );

  const superadmins = all.filter((p) => p.role === 'SUPERADMIN');
  const photographers = all.filter((p) => p.role === 'PHOTOGRAPHER');

  // The loginOtp field is no longer part of the Mongoose schema, so it must be
  // detected through the raw driver.
  const rawCollection = mongoose.connection.db!.collection('photographers');
  const legacyOtpEmails: string[] = await rawCollection
    .find({ loginOtp: { $exists: true } }, { projection: { email: 1 } })
    .toArray()
    .then((docs: any[]) => docs.map((d) => d.email));

  const withOtp = legacyOtpEmails.map((email) => ({ email }));
  const withPassword = photographers.filter((p) => Boolean(p.passwordHash));
  const alreadyLinked = photographers.filter((p) => Boolean(p.firebaseUid));
  const needsLinking = photographers.filter((p) => !p.firebaseUid);

  console.log('─'.repeat(70));
  console.log(`Photographer records           : ${photographers.length}`);
  console.log(`Superadmin records (untouched) : ${superadmins.length}`);
  console.log(`Already linked to Firebase     : ${alreadyLinked.length}`);
  console.log(`Awaiting first Google sign-in  : ${needsLinking.length}`);
  console.log(`Carrying a legacy loginOtp     : ${withOtp.length}`);
  console.log(`Carrying a legacy passwordHash : ${withPassword.length}`);
  console.log('─'.repeat(70));

  if (!APPLY) {
    console.log('');
    console.log('Dry run complete. Re-run with --apply to write the changes.');
    await disconnectDB();
    return;
  }

  // 1. Drop the retired loginOtp sub-document.
  let otpResult: any = { modifiedCount: 0 };
  if (withOtp.length > 0) {
    otpResult = await rawCollection.updateMany(
      { loginOtp: { $exists: true } },
      { $unset: { loginOtp: 1 } }
    );
  }

  // 2. Drop photographer password hashes (superadmin untouched).
  let passResult: any = { modifiedCount: 0 };
  if (withPassword.length > 0) {
    passResult = await Photographer.updateMany(
      { _id: { $in: withPassword.map((p) => p._id) } },
      { $unset: { passwordHash: 1 } }
    );
  }

  console.log('');
  console.log(`loginOtp removed from      : ${otpResult.modifiedCount ?? 0} record(s)`);
  console.log(`passwordHash removed from  : ${passResult.modifiedCount ?? 0} record(s)`);
  console.log('');
  console.log(
    `${needsLinking.length} photographer account(s) will be linked to their Google identity\n` +
      'automatically on their next Google sign-in. No action is required.'
  );

  // 3. Ensure the sparse unique index on firebaseUid exists.
  try {
    await Photographer.syncIndexes();
    console.log('Indexes synchronised.');
  } catch (err: any) {
    console.warn('Index synchronisation skipped:', err?.message);
  }

  await disconnectDB();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});

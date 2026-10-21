import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../config/db.js';
import { Photographer } from '../models/Photographer.js';
import { env } from '../config/env.js';
import { logAdminAction } from '../utils/auditLogger.js';

async function main() {
  console.log('====================================================');
  console.log('🔒 Penta Prizm Super Admin Credential Manager / Reset');
  console.log('====================================================');

  try {
    await connectDB();

    const targetEmail = env.SUPERADMIN_EMAIL.toLowerCase().trim();
    const newPassword = env.SUPERADMIN_DEFAULT_PASSWORD;

    if (!newPassword || newPassword.length < 8) {
      console.error('❌ Error: SUPERADMIN_DEFAULT_PASSWORD environment variable must be at least 8 characters.');
      process.exit(1);
    }

    console.log(`Target Designated Admin: ${targetEmail}`);
    console.log(`Password Configured: Yes (${newPassword.length} characters)`);

    // Find if account exists with targetEmail
    let admin = await Photographer.findOne({ email: targetEmail });

    if (!admin) {
      // Check if a legacy superadmin exists to migrate
      const legacyAdmin = await Photographer.findOne({ role: 'SUPERADMIN' });
      if (legacyAdmin) {
        console.log(`Found legacy superadmin (${legacyAdmin.email}). Migrating to ${targetEmail}...`);
        admin = legacyAdmin;
        admin.email = targetEmail;
        admin.name = 'Penta Prizm Administrator';
      } else {
        console.log(`No existing superadmin found. Creating new designated account...`);
        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(newPassword, salt);
        admin = await Photographer.create({
          name: 'Penta Prizm Administrator',
          email: targetEmail,
          passwordHash,
          role: 'SUPERADMIN',
          status: 'ACTIVE',
          googleDrive: { connected: false },
        });

        await logAdminAction({
          adminId: admin._id,
          adminEmail: admin.email,
          action: 'SUPERADMIN_BOOTSTRAP',
          targetType: 'SYSTEM',
          targetId: admin._id.toString(),
          metadata: { note: 'Created via resetSuperadminPassword script' },
        });

        console.log(`✅ Designated Super Admin account created: ${targetEmail}`);
        await disconnectDB();
        process.exit(0);
      }
    }

    // Hash new password
    const salt = await bcrypt.genSalt(12);
    admin.passwordHash = await bcrypt.hash(newPassword, salt);
    admin.role = 'SUPERADMIN';
    admin.status = 'ACTIVE';
    await admin.save();

    // Demote any other accounts claiming SUPERADMIN
    const others = await Photographer.find({ role: 'SUPERADMIN', email: { $ne: targetEmail } });
    for (const other of others) {
      console.log(`Demoting duplicate superadmin: ${other.email}`);
      other.role = 'PHOTOGRAPHER';
      await other.save();
    }

    await logAdminAction({
      adminId: admin._id,
      adminEmail: admin.email,
      action: 'SUPERADMIN_PASSWORD_RESET',
      targetType: 'SYSTEM',
      targetId: admin._id.toString(),
      metadata: { note: 'Password explicitly updated via resetSuperadminPassword script' },
    });

    console.log(`✅ Super Admin credentials successfully updated for ${targetEmail}.`);
    console.log('You can now log in at /superadmin using this email and the configured password.');

    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error executing credential reset:', error);
    process.exit(1);
  }
}

main();

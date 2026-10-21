import bcrypt from 'bcryptjs';
import { Photographer } from '../models/Photographer.js';
import { env } from '../config/env.js';
import { logAdminAction } from './auditLogger.js';

export async function bootstrapSuperAdmin(): Promise<void> {
  try {
    const targetEmail = env.SUPERADMIN_EMAIL.toLowerCase().trim();
    const isPasswordConfigured = Boolean(env.SUPERADMIN_DEFAULT_PASSWORD);
    const passwordLength = env.SUPERADMIN_DEFAULT_PASSWORD ? env.SUPERADMIN_DEFAULT_PASSWORD.length : 0;

    console.log(`[SuperAdmin Provisioning] Designated email configured: ${targetEmail}`);
    console.log(`[SuperAdmin Provisioning] Password configured: ${isPasswordConfigured} (${passwordLength} characters)`);
    console.log(`[SuperAdmin Provisioning] Explicit password reset flag: ${env.SUPERADMIN_RESET_PASSWORD}`);

    // 1. Check for any accounts with the target superadmin email
    const designatedUser = await Photographer.findOne({ email: targetEmail });

    // 2. Check for any other existing superadmin accounts
    const existingSuperAdmins = await Photographer.find({ role: 'SUPERADMIN' });
    const otherSuperAdmins = existingSuperAdmins.filter(
      (admin) => admin.email.toLowerCase().trim() !== targetEmail
    );

    // Case 1: Designated user already exists
    if (designatedUser) {
      console.log(`[SuperAdmin Provisioning] Found designated user in database: ${targetEmail} (role: ${designatedUser.role}, status: ${designatedUser.status})`);
      let modified = false;

      // Ensure role is strictly SUPERADMIN and active
      if (designatedUser.role !== 'SUPERADMIN') {
        console.log(`[SuperAdmin Provisioning] Promoting account role from ${designatedUser.role} to SUPERADMIN`);
        designatedUser.role = 'SUPERADMIN';
        modified = true;
      }
      if (designatedUser.status !== 'ACTIVE') {
        console.log(`[SuperAdmin Provisioning] Activating account (previous status: ${designatedUser.status})`);
        designatedUser.status = 'ACTIVE';
        modified = true;
      }

      // Explicit password reset if requested via environment variable trigger
      if (env.SUPERADMIN_RESET_PASSWORD) {
        console.log(`[SuperAdmin Provisioning] Synchronizing superadmin password from environment variable...`);
        const salt = await bcrypt.genSalt(12);
        designatedUser.passwordHash = await bcrypt.hash(env.SUPERADMIN_DEFAULT_PASSWORD, salt);
        modified = true;

        await logAdminAction({
          adminId: designatedUser._id,
          adminEmail: targetEmail,
          action: 'SUPERADMIN_PASSWORD_RESET',
          targetType: 'SYSTEM',
          targetId: designatedUser._id.toString(),
          metadata: {
            note: 'Explicit superadmin password reset executed via server environment trigger',
          },
        });
        console.log(`[SuperAdmin Provisioning] Superadmin password synchronized successfully.`);
      }

      if (modified) {
        await designatedUser.save();
      }

      // Demote or remove any secondary/legacy superadmin accounts to ensure single fixed identity
      for (const otherAdmin of otherSuperAdmins) {
        console.log(`[SuperAdmin Provisioning] Demoting legacy/duplicate superadmin account: ${otherAdmin.email}`);
        otherAdmin.role = 'PHOTOGRAPHER';
        await otherAdmin.save();

        await logAdminAction({
          adminId: designatedUser._id,
          adminEmail: targetEmail,
          action: 'SUPERADMIN_DEMOTED',
          targetType: 'SYSTEM',
          targetId: otherAdmin._id.toString(),
          metadata: {
            legacyEmail: otherAdmin.email,
            note: 'Demoted legacy superadmin account to preserve single designated Superadmin identity',
          },
        });
      }

      console.log(`[SuperAdmin Provisioning] Designated Penta Prizm Superadmin active: ${targetEmail}`);
      return;
    }

    // Case 2: Designated user does not exist, but there is an existing legacy superadmin account (e.g. admin@pentaprizm.com)
    // Implement explicit, secure migration without locking out the existing admin or resetting password unexpectedly
    if (otherSuperAdmins.length > 0) {
      const primaryLegacyAdmin = otherSuperAdmins[0];
      const previousEmail = primaryLegacyAdmin.email;

      console.log(`[SuperAdmin Provisioning] Migrating existing Superadmin from ${previousEmail} to designated identity ${targetEmail}...`);

      primaryLegacyAdmin.email = targetEmail;
      primaryLegacyAdmin.name = 'Penta Prizm Administrator';
      primaryLegacyAdmin.status = 'ACTIVE';

      // If explicit reset requested, update password; otherwise preserve existing passwordHash
      if (env.SUPERADMIN_RESET_PASSWORD) {
        const salt = await bcrypt.genSalt(12);
        primaryLegacyAdmin.passwordHash = await bcrypt.hash(env.SUPERADMIN_DEFAULT_PASSWORD, salt);
      }

      await primaryLegacyAdmin.save();

      // If there were any other secondary superadmins, demote them to ensure singleton
      for (let i = 1; i < otherSuperAdmins.length; i++) {
        const extraAdmin = otherSuperAdmins[i];
        extraAdmin.role = 'PHOTOGRAPHER';
        await extraAdmin.save();
      }

      await logAdminAction({
        adminId: primaryLegacyAdmin._id,
        adminEmail: targetEmail,
        action: 'SUPERADMIN_MIGRATED',
        targetType: 'SYSTEM',
        targetId: primaryLegacyAdmin._id.toString(),
        metadata: {
          fromEmail: previousEmail,
          toEmail: targetEmail,
          note: 'Explicit migration of existing platform superadmin identity',
        },
      });

      console.log(`[SuperAdmin Provisioning] Successfully migrated Superadmin account to ${targetEmail}`);
      return;
    }

    // Case 3: Fresh initial provision (neither designated user nor any superadmin exists)
    console.log(`[SuperAdmin Provisioning] Initializing fixed designated Penta Prizm Superadmin (${targetEmail})...`);

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(env.SUPERADMIN_DEFAULT_PASSWORD, salt);

    const superAdmin = await Photographer.create({
      name: 'Penta Prizm Administrator',
      email: targetEmail,
      passwordHash,
      role: 'SUPERADMIN',
      status: 'ACTIVE',
      googleDrive: {
        connected: false,
      },
    });

    await logAdminAction({
      adminId: superAdmin._id,
      adminEmail: superAdmin.email,
      action: 'SUPERADMIN_BOOTSTRAP',
      targetType: 'SYSTEM',
      targetId: superAdmin._id.toString(),
      metadata: {
        email: superAdmin.email,
        note: 'Initial platform superadmin provisioned via server bootstrap',
      },
    });

    console.log(`[SuperAdmin Provisioning] Penta Prizm Superadmin provisioned: ${superAdmin.email}`);
  } catch (error) {
    console.error('[SuperAdmin Provisioning] Error in bootstrapSuperAdmin:', error);
  }
}

import bcrypt from 'bcryptjs';
import { Photographer } from '../models/Photographer.js';
import { env } from '../config/env.js';
import { logAdminAction } from './auditLogger.js';

export async function bootstrapSuperAdmin(): Promise<void> {
  try {
    const existingSuperAdmin = await Photographer.findOne({ role: 'SUPERADMIN' });
    if (existingSuperAdmin) {
      return;
    }

    console.log('⚡ No Superadmin detected. Bootstrapping initial Penta Prizm Superadmin...');

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(env.SUPERADMIN_DEFAULT_PASSWORD, salt);

    const superAdmin = await Photographer.create({
      name: 'Penta Prizm Administrator',
      email: env.SUPERADMIN_EMAIL.toLowerCase().trim(),
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

    console.log(`✅ Penta Prizm Superadmin provisioned: ${superAdmin.email}`);
  } catch (error) {
    console.error('Error bootstrapping superadmin:', error);
  }
}

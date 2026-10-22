import { api } from './api.js';
import { User, AccessControlResult } from '../types/index.js';

export interface AuthResponse {
  user: User;
  access?: AccessControlResult;
  token?: string;
  /** True when the photographer still needs to authorise Google Drive. */
  needsDriveSetup?: boolean;
  /** True when this sign-in created a brand-new studio account. */
  firstSignIn?: boolean;
}

export const authService = {
  /**
   * Exchanges a Firebase ID token (from Google Sign-In) for a backend
   * session. The backend verifies the token with the Firebase Admin SDK.
   */
  async signInWithGoogle(idToken: string): Promise<AuthResponse> {
    const res = await api.post('/auth/google', { idToken });
    return res.data.data;
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },

  async getMe(): Promise<AuthResponse> {
    const res = await api.get('/auth/me');
    return res.data.data;
  },

  async getOnboardingState(): Promise<{
    driveConnected: boolean;
    driveReconnectRequired: boolean;
    needsDriveSetup: boolean;
  }> {
    const res = await api.get('/auth/onboarding');
    return res.data.data;
  },
};

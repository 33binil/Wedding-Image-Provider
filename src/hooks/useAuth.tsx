import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, AccessControlResult } from '../types/index.js';
import { authService, AuthResponse } from '../services/auth.service.js';
import { signInWithGoogle as firebaseGoogleSignIn, signOutOfFirebase } from '../services/firebase.service.js';

interface AuthContextType {
  user: User | null;
  access: AccessControlResult | null;
  loading: boolean;
  isAuthenticated: boolean;
  /** True when the photographer has not yet authorised Google Drive. */
  needsDriveSetup: boolean;
  signInWithGoogle: () => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<AccessControlResult | null>(null);
  const [needsDriveSetup, setNeedsDriveSetup] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await authService.getMe();
      setUser(data.user);
      setAccess(data.access || null);
      setNeedsDriveSetup(Boolean(data.needsDriveSetup));
    } catch {
      setUser(null);
      setAccess(null);
      setNeedsDriveSetup(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  /**
   * Signs in with Google through Firebase Authentication.
   *
   * The Firebase ID token is sent to the backend, which verifies it with the
   * Firebase Admin SDK before issuing the application session cookie.
   */
  const signInWithGoogle = async (): Promise<AuthResponse> => {
    const { idToken } = await firebaseGoogleSignIn();
    const data = await authService.signInWithGoogle(idToken);

    if (data.token) {
      localStorage.setItem('wedding_auth_token', data.token);
    }

    setUser(data.user);
    setAccess(data.access || null);
    setNeedsDriveSetup(Boolean(data.needsDriveSetup));

    return data;
  };

  const logout = async (): Promise<void> => {
    try {
      await authService.logout();
    } finally {
      await signOutOfFirebase();
      localStorage.removeItem('wedding_auth_token');
      setUser(null);
      setAccess(null);
      setNeedsDriveSetup(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        access,
        loading,
        isAuthenticated: Boolean(user),
        needsDriveSetup,
        signInWithGoogle,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

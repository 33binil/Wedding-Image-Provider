import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, AccessControlResult } from '../types/index.js';
import {
  authService,
  LoginPayload,
  RegisterPayload,
  LoginInitialResponse,
  VerifyOtpPayload,
} from '../services/auth.service.js';

interface AuthContextType {
  user: User | null;
  access: AccessControlResult | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<LoginInitialResponse>;
  verifyLoginOtp: (payload: VerifyOtpPayload) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<{ user: User }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<AccessControlResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await authService.getMe();
      setUser(data.user);
      setAccess(data.access || null);
    } catch {
      setUser(null);
      setAccess(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (payload: LoginPayload): Promise<LoginInitialResponse> => {
    return await authService.login(payload);
  };

  const verifyLoginOtp = async (payload: VerifyOtpPayload): Promise<User> => {
    const data = await authService.verifyLoginOtp(payload);
    if (data.token) {
      localStorage.setItem('wedding_auth_token', data.token);
    }
    setUser(data.user);
    setAccess(data.access || null);
    return data.user;
  };

  const register = async (payload: RegisterPayload): Promise<{ user: User }> => {
    return await authService.register(payload);
  };

  const logout = async (): Promise<void> => {
    try {
      await authService.logout();
    } finally {
      localStorage.removeItem('wedding_auth_token');
      setUser(null);
      setAccess(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        access,
        loading,
        isAuthenticated: Boolean(user),
        login,
        verifyLoginOtp,
        register,
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

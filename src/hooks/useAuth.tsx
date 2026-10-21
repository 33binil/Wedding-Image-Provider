import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, AccessControlResult } from '../types/index.js';
import { authService, LoginPayload, RegisterPayload } from '../services/auth.service.js';

interface AuthContextType {
  user: User | null;
  access: AccessControlResult | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
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

  const login = async (payload: LoginPayload): Promise<User> => {
    const data = await authService.login(payload);
    setUser(data.user);
    setAccess(data.access || null);
    return data.user;
  };

  const register = async (payload: RegisterPayload): Promise<User> => {
    const data = await authService.register(payload);
    setUser(data.user);
    setAccess(data.access || null);
    return data.user;
  };

  const logout = async (): Promise<void> => {
    try {
      await authService.logout();
    } finally {
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

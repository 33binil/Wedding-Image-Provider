import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types/index.js';
import { superadminService } from '../services/superadmin.service.js';

interface SuperAdminContextType {
  admin: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (payload: { email: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshAdmin: () => Promise<void>;
}

const SuperAdminContext = createContext<SuperAdminContextType | undefined>(undefined);

export function SuperAdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshAdmin = useCallback(async () => {
    try {
      const adminData = await superadminService.getMe();
      if (adminData && adminData.role === 'SUPERADMIN') {
        setAdmin(adminData);
      } else {
        setAdmin(null);
      }
    } catch {
      // Missing or expired session on initial check is normal before login - do not surface error
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAdmin();
  }, [refreshAdmin]);

  const login = async (payload: { email: string; password: string }): Promise<User> => {
    const data = await superadminService.login(payload);
    if (data.token) {
      localStorage.setItem('penta_superadmin_token', data.token);
    }
    setAdmin(data.admin);
    return data.admin;
  };

  const logout = async (): Promise<void> => {
    try {
      await superadminService.logout();
    } finally {
      localStorage.removeItem('penta_superadmin_token');
      setAdmin(null);
    }
  };

  return (
    <SuperAdminContext.Provider
      value={{
        admin,
        loading,
        isAuthenticated: Boolean(admin),
        login,
        logout,
        refreshAdmin,
      }}
    >
      {children}
    </SuperAdminContext.Provider>
  );
}

export function useSuperAdminAuth(): SuperAdminContextType {
  const context = useContext(SuperAdminContext);
  if (!context) {
    throw new Error('useSuperAdminAuth must be used within a SuperAdminAuthProvider');
  }
  return context;
}

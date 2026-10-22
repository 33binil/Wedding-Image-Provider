import { api } from './api.js';
import { User, Invitation, SuperAdminStats, AdminAuditLogEntry, WeddingEvent } from '../types/index.js';

export interface CreateInvitationPayload {
  studioName: string;
  email: string;
  trialDays: number;
  notes?: string;
}

export interface PhotographerDetailsResponse {
  photographer: User & { weddingsCount: number; trialDaysRemaining: number; access?: any };
  recentWeddings: WeddingEvent[];
}

export const superadminService = {
  async login(payload: { email: string; password: string }): Promise<{ admin: User; token?: string }> {
    const res = await api.post('/superadmin/auth/login', payload);
    return res.data.data;
  },

  async logout(): Promise<void> {
    await api.post('/superadmin/auth/logout');
  },

  async getMe(): Promise<User> {
    const res = await api.get('/superadmin/auth/me');
    return res.data.data.admin;
  },

  async getStats(): Promise<SuperAdminStats> {
    const res = await api.get('/superadmin/dashboard-stats');
    return res.data.data;
  },

  async createInvitation(payload: CreateInvitationPayload): Promise<{
    invitation: Invitation;
    activationCode: string;
  }> {
    const res = await api.post('/superadmin/invitations', payload);
    return res.data.data;
  },

  async listInvitations(): Promise<Invitation[]> {
    const res = await api.get('/superadmin/invitations');
    return res.data.data.invitations;
  },

  async revokeInvitation(id: string): Promise<Invitation> {
    const res = await api.post(`/superadmin/invitations/${id}/revoke`);
    return res.data.data.invitation;
  },

  async listPhotographers(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<{
    photographers: User[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const res = await api.get('/superadmin/photographers', { params });
    return res.data.data;
  },

  async getPhotographerById(id: string): Promise<PhotographerDetailsResponse> {
    const res = await api.get(`/superadmin/photographers/${id}`);
    return res.data.data;
  },

  async updatePhotographerStatus(
    id: string,
    payload: { status: 'ACTIVE' | 'SUSPENDED'; reason?: string }
  ): Promise<User> {
    const res = await api.patch(`/superadmin/photographers/${id}/status`, payload);
    return res.data.data.photographer;
  },

  async updatePhotographerTrial(
    id: string,
    payload: { extensionDays?: number; newExpiryDate?: string; reason?: string }
  ): Promise<{ photographer: User; trialDaysRemaining: number }> {
    const res = await api.patch(`/superadmin/photographers/${id}/trial`, payload);
    return res.data.data;
  },

  async getAuditLogs(): Promise<AdminAuditLogEntry[]> {
    const res = await api.get('/superadmin/audit-logs');
    return res.data.data.logs;
  },
};

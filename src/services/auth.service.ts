import { api } from './api.js';
import { User, AccessControlResult } from '../types/index.js';

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  activationCode: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  access?: AccessControlResult;
}

export const authService = {
  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const res = await api.post('/auth/register', payload);
    return res.data.data;
  },

  async login(payload: LoginPayload): Promise<AuthResponse> {
    const res = await api.post('/auth/login', payload);
    return res.data.data;
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },

  async getMe(): Promise<AuthResponse> {
    const res = await api.get('/auth/me');
    return res.data.data;
  },
};

import { api } from './api.js';
import { WeddingEvent, EventStats, PublicEvent, DriveStatusResponse } from '../types/index.js';

export interface CreateEventPayload {
  title: string;
  brideName?: string;
  groomName?: string;
  eventDate: string;
  venue?: string;
  description?: string;
  coverImageUrl?: string;
}

export interface UpdateEventPayload {
  title?: string;
  brideName?: string;
  groomName?: string;
  eventDate?: string;
  venue?: string;
  description?: string;
  coverImageUrl?: string;
  status?: string;
}

export const eventService = {
  async listEvents(params?: { status?: string; search?: string }): Promise<{
    events: WeddingEvent[];
    stats: EventStats;
  }> {
    const res = await api.get('/events', { params });
    return res.data.data;
  },

  async getEventById(id: string): Promise<{
    event: WeddingEvent;
    publicUrl: string;
    qrCodeDataUrl: string;
  }> {
    const res = await api.get(`/events/${id}`);
    return res.data.data;
  },

  async createEvent(payload: CreateEventPayload): Promise<WeddingEvent> {
    const res = await api.post('/events', payload);
    return res.data.data.event;
  },

  async updateEvent(id: string, payload: UpdateEventPayload): Promise<WeddingEvent> {
    const res = await api.patch(`/events/${id}`, payload);
    return res.data.data.event;
  },

  async deleteEvent(id: string): Promise<void> {
    await api.delete(`/events/${id}`);
  },

  async getPublicEvent(token: string): Promise<PublicEvent> {
    const res = await api.get(`/public/events/${token}`);
    return res.data.data.event;
  },

  async getDriveStatus(): Promise<DriveStatusResponse> {
    const res = await api.get('/integrations/google-drive/status');
    return res.data.data;
  },

  async initiateDriveConnect(): Promise<{ authUrl?: string }> {
    const res = await api.get('/integrations/google-drive/connect', {
      headers: { Accept: 'application/json' },
    });
    return res.data.data || {};
  },

  async disconnectDrive(): Promise<void> {
    await api.delete('/integrations/google-drive/disconnect');
  },

  async verifyDriveConnection(): Promise<void> {
    await api.post('/integrations/google-drive/verify');
  },

  async retryDriveFolderCreation(eventId: string): Promise<WeddingEvent> {
    const res = await api.post(`/events/${eventId}/drive-folder/retry`);
    return res.data.data.event;
  },

  async getDriveFolderInfo(eventId: string): Promise<{
    driveFolderId?: string;
    driveFolderName?: string;
    driveFolderWebViewLink?: string;
    driveFolderStatus: string;
    driveFolderError?: string;
    driveFolderCreatedAt?: string;
    driveFolderAttempts?: number;
    driveConnectionStatus: string;
  }> {
    const res = await api.get(`/events/${eventId}/drive-folder`);
    return res.data.data;
  },
};

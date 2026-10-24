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

  /**
   * Starts face indexing for a wedding event's Google Drive photos.
   * Returns the initial indexing status.
   */
  async startIndexing(eventId: string): Promise<{
    eventId: string;
    status: string;
  }> {
    const res = await api.post(`/events/${eventId}/face-index`);
    return res.data.data;
  },

  /**
   * Gets the current face indexing status for a wedding event.
   */
  async getIndexingStatus(eventId: string): Promise<{
    eventId: string;
    status: 'IDLE' | 'INDEXING' | 'COMPLETED' | 'FAILED';
    progress: { current: number; total: number };
    error?: string;
    indexedCount: number;
    totalDiscovered?: number;
    noFaceImages?: number;
    failed?: number;
    facesFound?: number;
    startedAt?: string;
    completedAt?: string;
  }> {
    const res = await api.get(`/events/${eventId}/face-index/status`);
    return res.data.data;
  },

  /**
   * Resets (clears) the face index for a wedding event, allowing retry.
   */
  async resetIndexing(eventId: string): Promise<void> {
    await api.delete(`/events/${eventId}/face-index`);
  },

  /**
   * Submits a selfie image for face matching against a wedding event's
   * Google Drive folder. Returns matched photos with similarity scores.
   */
  async matchSelfieToEvent(
    eventId: string,
    selfieBase64: string
  ): Promise<{
    event: { _id: string; title: string; publicToken: string };
    matches: Array<{
      folderId: string;
      fileName: string;
      webViewLink?: string;
      thumbnailLink?: string;
      similarity: number;
    }>;
    totalScanned: number;
    processingTimeMs: number;
    error?: string;
  }> {
    const res = await api.post(`/public/events/${eventId}/face-match`, {
      selfieImageData: selfieBase64,
    });
    return res.data.data;
  },

  async getPublicIndexingStatus(token: string): Promise<{
    eventId: string;
    eventTitle: string;
    status: 'IDLE' | 'INDEXING' | 'COMPLETED' | 'FAILED';
    progress: { current: number; total: number };
    error?: string;
    indexedCount: number;
    driveFolderStatus?: string;
  }> {
    const res = await api.get(`/public/events/${token}/face-index/status`);
    return res.data.data;
  },
};

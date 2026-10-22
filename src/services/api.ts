import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const superAdminToken = localStorage.getItem('penta_superadmin_token');
    const photographerToken = localStorage.getItem('wedding_auth_token');

    // Attach dual-transport authentication headers depending on the route
    if (config.url && config.url.includes('/superadmin')) {
      if (superAdminToken) {
        config.headers.set('Authorization', `Bearer ${superAdminToken}`);
        config.headers.set('x-superadmin-token', superAdminToken);
      }
    } else if (photographerToken && !config.headers.get('Authorization')) {
      config.headers.set('Authorization', `Bearer ${photographerToken}`);
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

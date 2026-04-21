import axios from 'axios';
import { toast } from 'sonner';

// Single source of truth for the API base URL.
// Set VITE_API_URL in .env.production for deployment.
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

// Derives the server root (strips /api/v1) for asset URLs like uploaded images.
export const API_SERVER_URL = API_BASE_URL.replace(/\/api\/v\d+\/?$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Routes that should NOT have branchId injected
const BRANCH_EXEMPT_PATHS = [
  '/branches', '/users', '/auth',
];

function isBranchExempt(url: string): boolean {
  return BRANCH_EXEMPT_PATHS.some((p) => url.includes(p));
}

function getActiveBranchId(): string | null {
  try {
    const stored = localStorage.getItem('pbims-branch-storage');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.activeBranchId ?? null;
    }
  } catch { /* ignore */ }
  return null;
}

// Request interceptor: attach JWT token + auto-inject active branchId
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const branchId = getActiveBranchId();
    if (branchId && config.url && !isBranchExempt(config.url)) {
      // GET: inject as query param
      if (config.method === 'get') {
        config.params = { ...config.params, branchId };
      }
      // POST/PUT/PATCH: inject as query param so ValidationPipe whitelist doesn't strip it
      if (['post', 'put', 'patch'].includes(config.method ?? '')) {
        config.params = { ...config.params, branchId };
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle Global errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      if (error.response.status === 401) {
        // Clear stored credentials
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        localStorage.removeItem('pbims-auth-storage');
        // Dispatch a custom event — App.tsx listens and navigates without
        // triggering a full page reload (which caused the refresh loop)
        window.dispatchEvent(new CustomEvent('pbims:unauthorized'));
      } else if (error.response.status >= 400 && error.response.status !== 404) {
        // Global error toasts for 400 Bad Request, 500 Internal Server Error, etc.
        const message = error.response.data?.message || 'An unexpected error occurred';
        toast.error(Array.isArray(message) ? message[0] : message);
      }
    } else {
      toast.error('Network error. Please check your connection.');
    }
    return Promise.reject(error);
  }
);

export default api;

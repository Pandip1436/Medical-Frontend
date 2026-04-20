import axios from 'axios';
import { toast } from 'sonner';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1',
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
      // POST/PUT/PATCH: inject into body (only if body is a plain object without branchId)
      if (['post', 'put', 'patch'].includes(config.method ?? '') && config.data) {
        try {
          const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
          if (typeof body === 'object' && !Array.isArray(body) && !body.branchId) {
            body.branchId = branchId;
            config.data = typeof config.data === 'string' ? JSON.stringify(body) : body;
          }
        } catch { /* ignore malformed body */ }
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

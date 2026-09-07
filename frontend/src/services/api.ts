const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined | null>;
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function apiClient<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, headers = {}, ...restOptions } = options;

  let url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}/api/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `${url.includes('?') ? '&' : '?'}${queryString}`;
    }
  }

  const token = localStorage.getItem('cs-token') || localStorage.getItem('token');
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, {
      ...restOptions,
      headers: requestHeaders,
    });

    if (res.status === 401) {
      localStorage.removeItem('cs-token');
      localStorage.removeItem('token');
      localStorage.removeItem('cs-user');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      throw new ApiError('Session expired. Please log in again.', 401);
    }

    if (!res.ok) {
      let errorMsg = `Request failed with status ${res.status}`;
      let errorData;
      try {
        errorData = await res.json();
        if (errorData?.detail) {
          errorMsg = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
        } else if (errorData?.message) {
          errorMsg = errorData.message;
        }
      } catch {
        // Non-JSON response
      }
      throw new ApiError(errorMsg, res.status, errorData);
    }

    if (res.status === 204) {
      return {} as T;
    }

    return await res.json();
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(err?.message || 'Network connection error', 0);
  }
}

export const api = {
  get: <T>(endpoint: string, params?: Record<string, any>, options?: RequestOptions) =>
    apiClient<T>(endpoint, { method: 'GET', params, ...options }),
  post: <T>(endpoint: string, body?: any, options?: RequestOptions) =>
    apiClient<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined, ...options }),
  put: <T>(endpoint: string, body?: any, options?: RequestOptions) =>
    apiClient<T>(endpoint, { method: 'PUT', body: body ? JSON.stringify(body) : undefined, ...options }),
  patch: <T>(endpoint: string, body?: any, options?: RequestOptions) =>
    apiClient<T>(endpoint, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined, ...options }),
  delete: <T>(endpoint: string, options?: RequestOptions) =>
    apiClient<T>(endpoint, { method: 'DELETE', ...options }),
};

export const apiConfig = {
  baseUrl: `${API_BASE_URL}/api/v1`,
};

import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authService = {
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data.user;
  },

  updateProfile: async (userData) => {
    const response = await api.put('/auth/profile', userData);
    return response.data;
  }
};

export const propertyService = {
  getProperties: async () => {
    const response = await api.get('/properties');
    return response.data;
  },

  getProperty: async (id) => {
    const response = await api.get(`/properties/${id}`);
    return response.data;
  },

  createProperty: async (propertyData) => {
    const response = await api.post('/properties', propertyData);
    return response.data;
  },

  updateProperty: async (id, propertyData) => {
    const response = await api.put(`/properties/${id}`, propertyData);
    return response.data;
  },

  updatePlatformIntegrations: async (id, platforms) => {
    const response = await api.put(`/properties/${id}/platforms`, platforms);
    return response.data;
  }
};

export const bookingService = {
  getBookings: async (filters = {}) => {
    const response = await api.get('/bookings', { params: filters });
    return response.data;
  },

  getBooking: async (id) => {
    const response = await api.get(`/bookings/${id}`);
    return response.data;
  },

  createBooking: async (bookingData) => {
    const response = await api.post('/bookings', bookingData);
    return response.data;
  },

  checkIn: async (id, checkInData) => {
    const response = await api.put(`/bookings/${id}/checkin`, checkInData);
    return response.data;
  },

  checkOut: async (id, checkOutData) => {
    const response = await api.put(`/bookings/${id}/checkout`, checkOutData);
    return response.data;
  },

  updateStatus: async (id, status) => {
    const response = await api.put(`/bookings/${id}/status`, { status });
    return response.data;
  },

  getCalendar: async (propertyId, dateRange) => {
    const url = propertyId ? `/bookings/calendar/${propertyId}` : '/bookings/calendar';
    const response = await api.get(url, { params: dateRange });
    return response.data;
  }
};

export const knowledgeBaseService = {
  getArticles: async (filters = {}) => {
    const response = await api.get('/knowledge-base', { params: filters });
    return response.data;
  },

  getArticle: async (id) => {
    const response = await api.get(`/knowledge-base/${id}`);
    return response.data;
  },

  createArticle: async (articleData) => {
    const response = await api.post('/knowledge-base', articleData);
    return response.data;
  },

  updateArticle: async (id, articleData) => {
    const response = await api.put(`/knowledge-base/${id}`, articleData);
    return response.data;
  },

  deleteArticle: async (id) => {
    const response = await api.delete(`/knowledge-base/${id}`);
    return response.data;
  }
};

export const financialService = {
  getRecords: async (filters = {}) => {
    const response = await api.get('/financial/records', { params: filters });
    return response.data;
  },

  getSummary: async (filters = {}) => {
    const response = await api.get('/financial/summary', { params: filters });
    return response.data;
  },

  createRecord: async (recordData) => {
    const response = await api.post('/financial/records', recordData);
    return response.data;
  }
};

export const icalService = {
  syncProperty: async (propertyId) => {
    const response = await api.post(`/ical/sync/${propertyId}`);
    return response.data;
  },

  syncAll: async () => {
    const response = await api.post('/ical/sync-all');
    return response.data;
  },

  getStatus: async () => {
    const response = await api.get('/ical/status');
    return response.data;
  }
};

export const dashboardService = {
  getDashboard: async () => {
    const response = await api.get('/dashboard');
    return response.data;
  },

  getStats: async (period = '30') => {
    const response = await api.get('/dashboard/stats', { params: { period } });
    return response.data;
  }
};

export default api;

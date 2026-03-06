import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Auth interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("replyzen_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("replyzen_token");
      localStorage.removeItem("replyzen_user");
      if (window.location.pathname !== "/" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const authAPI = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  getMe: () => api.get("/auth/me"),
};

// Emails
export const emailAPI = {
  connectGmail: (email) => api.post("/emails/connect-gmail", { email }),
  getAccounts: () => api.get("/emails/accounts"),
  syncEmails: () => api.post("/emails/sync"),
  getThreads: (params) => api.get("/emails/threads", { params }),
  getSilentThreads: (params) => api.get("/emails/threads/silent", { params }),
};

// Follow-ups
export const followupAPI = {
  generate: (threadId, tone) => api.post("/followups/generate", { thread_id: threadId, tone }),
  list: (params) => api.get("/followups", { params }),
  update: (id, draft) => api.put(`/followups/${id}`, { draft }),
  send: (id) => api.post(`/followups/${id}/send`),
  dismiss: (id) => api.post(`/followups/${id}/dismiss`),
};

// Billing
export const billingAPI = {
  getPlans: () => api.get("/billing/plans"),
  createCheckout: (data) => api.post("/billing/checkout", data),
  getSubscription: () => api.get("/billing/subscription"),
  cancelSubscription: () => api.post("/billing/cancel"),
};

// Analytics
export const analyticsAPI = {
  getOverview: () => api.get("/analytics/overview"),
  getFollowupsOverTime: (days) => api.get("/analytics/followups-over-time", { params: { days } }),
  getTopContacts: () => api.get("/analytics/top-contacts"),
};

// Settings
export const settingsAPI = {
  get: () => api.get("/settings"),
  update: (data) => api.put("/settings", data),
  updateProfile: (data) => api.put("/settings/profile", data),
  updateSilenceRules: (data) => api.put("/settings/silence-rules", data),
  disconnectEmail: (id) => api.delete(`/settings/email-account/${id}`),
};

export default api;

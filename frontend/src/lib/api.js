```javascript
import axios from "axios";

/*
|--------------------------------------------------------------------------
| Backend Configuration
|--------------------------------------------------------------------------
| Priority order:
| 1. REACT_APP_BACKEND_URL (React env)
| 2. NEXT_PUBLIC_API_URL (Vercel / Next env)
| 3. Hardcoded Railway fallback
|--------------------------------------------------------------------------
*/

const ENV_BACKEND =
  process.env.REACT_APP_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL;

const BACKEND_URL =
  ENV_BACKEND && ENV_BACKEND !== "undefined"
    ? ENV_BACKEND
    : "https://replyzen-ai01-production.up.railway.app";

const API_BASE = BACKEND_URL + "/api";

console.log("Replyzen API Base URL:", API_BASE);

/*
|--------------------------------------------------------------------------
| Axios Instance
|--------------------------------------------------------------------------
*/

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json"
  },
  withCredentials: true
});

/*
|--------------------------------------------------------------------------
| Request Interceptor
| Attach JWT token automatically
|--------------------------------------------------------------------------
*/

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("replyzen_token");

    if (token) {
      config.headers.Authorization = "Bearer " + token;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/*
|--------------------------------------------------------------------------
| Response Interceptor
| Handle auth errors globally
|--------------------------------------------------------------------------
*/

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("replyzen_token");
      localStorage.removeItem("replyzen_user");

      if (
        window.location.pathname !== "/" &&
        window.location.pathname !== "/login"
      ) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

/*
|--------------------------------------------------------------------------
| Auth API
|--------------------------------------------------------------------------
*/

export const authAPI = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  getMe: () => api.get("/auth/me"),

  getGoogleAuthUrl: (redirectUri) =>
    api.get("/auth/google/url", {
      params: { redirect_uri: redirectUri }
    }),

  googleCallback: (code, redirectUri) =>
    api.post("/auth/google/callback", {
      code: code,
      redirect_uri: redirectUri
    })
};

/*
|--------------------------------------------------------------------------
| Email APIs
|--------------------------------------------------------------------------
*/

export const emailAPI = {
  connectGmail: (email) =>
    api.post("/emails/connect-gmail", { email: email }),

  getGmailAuthUrl: () =>
    api.get("/emails/gmail/auth-url"),

  gmailCallback: (code, state) =>
    api.post(
      "/emails/gmail/callback",
      { code: code, state: state },
      { params: { code: code, state: state } }
    ),

  getAccounts: () =>
    api.get("/emails/accounts"),

  syncEmails: () =>
    api.post("/emails/sync"),

  getThreads: (params) =>
    api.get("/emails/threads", { params: params }),

  getSilentThreads: (params) =>
    api.get("/emails/threads/silent", { params: params })
};

/*
|--------------------------------------------------------------------------
| Follow-up APIs
|--------------------------------------------------------------------------
*/

export const followupAPI = {
  generate: (threadId, tone) =>
    api.post("/followups/generate", {
      thread_id: threadId,
      tone: tone
    }),

  list: (params) =>
    api.get("/followups", { params: params }),

  update: (id, draft) =>
    api.put("/followups/" + id, { draft: draft }),

  send: (id) =>
    api.post("/followups/" + id + "/send"),

  dismiss: (id) =>
    api.post("/followups/" + id + "/dismiss")
};

/*
|--------------------------------------------------------------------------
| Billing APIs
|--------------------------------------------------------------------------
*/

export const billingAPI = {
  getPlans: (currency) =>
    api.get("/billing/plans", {
      params: currency ? { currency: currency } : {}
    }),

  getPlanLimits: () =>
    api.get("/billing/plan-limits"),

  createCheckout: (data) =>
    api.post("/billing/checkout", data),

  getSubscription: () =>
    api.get("/billing/subscription"),

  cancelSubscription: () =>
    api.post("/billing/cancel"),

  detectLocation: () =>
    api.get("/billing/detect-location")
};

/*
|--------------------------------------------------------------------------
| Analytics APIs
|--------------------------------------------------------------------------
*/

export const analyticsAPI = {
  getOverview: () =>
    api.get("/analytics/overview"),

  getFollowupsOverTime: (days) =>
    api.get("/analytics/followups-over-time", {
      params: { days: days }
    }),

  getTopContacts: () =>
    api.get("/analytics/top-contacts")
};

/*
|--------------------------------------------------------------------------
| Settings APIs
|--------------------------------------------------------------------------
*/

export const settingsAPI = {
  get: () =>
    api.get("/settings"),

  update: (data) =>
    api.put("/settings", data),

  updateProfile: (data) =>
    api.put("/settings/profile", data),

  updateSilenceRules: (data) =>
    api.put("/settings/silence-rules", data),

  disconnectEmail: (id) =>
    api.delete("/settings/email-account/" + id)
};

export default api;
```

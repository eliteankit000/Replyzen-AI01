
import axios from "axios";

/*
|--------------------------------------------------------------------------
| Backend Configuration
|--------------------------------------------------------------------------
*/

let BACKEND_URL = "https://replyzen-ai01-production.up.railway.app";

if (process.env.REACT_APP_BACKEND_URL) {
  BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
}

if (process.env.NEXT_PUBLIC_API_URL) {
  BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;
}

const API_BASE = BACKEND_URL + "/api";

console.log("Replyzen API Base:", API_BASE);

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
|--------------------------------------------------------------------------
*/

api.interceptors.request.use(
  function (config) {
    const token = localStorage.getItem("replyzen_token");

    if (token) {
      config.headers.Authorization = "Bearer " + token;
    }

    return config;
  },
  function (error) {
    return Promise.reject(error);
  }
);

/*
|--------------------------------------------------------------------------
| Response Interceptor
|--------------------------------------------------------------------------
*/

api.interceptors.response.use(
  function (response) {
    return response;
  },
  function (error) {
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
  register: function (data) {
    return api.post("/auth/register", data);
  },

  login: function (data) {
    return api.post("/auth/login", data);
  },

  getMe: function () {
    return api.get("/auth/me");
  },

  getGoogleAuthUrl: function (redirectUri) {
    return api.get("/auth/google/url", {
      params: { redirect_uri: redirectUri }
    });
  },

  googleCallback: function (code, redirectUri) {
    return api.post("/auth/google/callback", {
      code: code,
      redirect_uri: redirectUri
    });
  }
};

/*
|--------------------------------------------------------------------------
| Email APIs
|--------------------------------------------------------------------------
*/

export const emailAPI = {
  connectGmail: function (email) {
    return api.post("/emails/connect-gmail", { email: email });
  },

  getGmailAuthUrl: function () {
    return api.get("/emails/gmail/auth-url");
  },

  gmailCallback: function (code, state) {
    return api.post(
      "/emails/gmail/callback",
      { code: code, state: state },
      { params: { code: code, state: state } }
    );
  },

  getAccounts: function () {
    return api.get("/emails/accounts");
  },

  syncEmails: function () {
    return api.post("/emails/sync");
  },

  getThreads: function (params) {
    return api.get("/emails/threads", { params: params });
  },

  getSilentThreads: function (params) {
    return api.get("/emails/threads/silent", { params: params });
  },

  dismissThread: function (threadId) {
    return api.post("/emails/threads/" + threadId + "/dismiss");
  },

  undismissThread: function (threadId) {
    return api.post("/emails/threads/" + threadId + "/undismiss");
  },

  getThreadReplyStatus: function (threadId) {
    return api.get("/emails/threads/" + threadId + "/reply-status");
  }
};

/*
|--------------------------------------------------------------------------
| Followups
|--------------------------------------------------------------------------
*/

export const followupAPI = {
  generate: function (threadId, tone, forceRegenerate) {
    return api.post("/followups/generate", {
      thread_id: threadId,
      tone: tone || "professional",
      force_regenerate: forceRegenerate || false
    });
  },

  list: function (params) {
    return api.get("/followups", { params: params });
  },

  update: function (id, draft) {
    return api.put("/followups/" + id, { draft: draft });
  },

  send: function (id) {
    return api.post("/followups/" + id + "/send");
  },

  dismiss: function (id) {
    return api.post("/followups/" + id + "/dismiss");
  },

  regenerate: function (id, tone) {
    return api.post("/followups/" + id + "/regenerate", null, {
      params: { tone: tone || "professional" }
    });
  }
};

/*
|--------------------------------------------------------------------------
| Billing
|--------------------------------------------------------------------------
*/

export const billingAPI = {
  getPlans: function (currency) {
    return api.get("/billing/plans", {
      params: currency ? { currency: currency } : {}
    });
  },

  getPlanLimits: function () {
    return api.get("/billing/plan-limits");
  },

  createCheckout: function (data) {
    return api.post("/billing/checkout", data);
  },

  getSubscription: function () {
    return api.get("/billing/subscription");
  },

  cancelSubscription: function () {
    return api.post("/billing/cancel");
  },

  detectLocation: function () {
    return api.get("/billing/detect-location");
  }
};

/*
|--------------------------------------------------------------------------
| Analytics
|--------------------------------------------------------------------------
*/

export const analyticsAPI = {
  getOverview: function () {
    return api.get("/analytics/overview");
  },

  getFollowupsOverTime: function (days) {
    return api.get("/analytics/followups-over-time", {
      params: { days: days }
    });
  },

  getTopContacts: function () {
    return api.get("/analytics/top-contacts");
  }
};

/*
|--------------------------------------------------------------------------
| Settings
|--------------------------------------------------------------------------
*/

export const settingsAPI = {
  get: function () {
    return api.get("/settings");
  },

  update: function (data) {
    return api.put("/settings", data);
  },

  updateProfile: function (data) {
    return api.put("/settings/profile", data);
  },

  updateSilenceRules: function (data) {
    return api.put("/settings/silence-rules", data);
  },

  disconnectEmail: function (id) {
    return api.delete("/settings/email-account/" + id);
  }
};

export default api;

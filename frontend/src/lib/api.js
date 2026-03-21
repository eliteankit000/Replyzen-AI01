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
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

/*
|--------------------------------------------------------------------------
| Request Interceptor
|--------------------------------------------------------------------------
*/

api.interceptors.request.use(
  function (config) {
    const token = localStorage.getItem("replyzen_token");
    if (token) config.headers.Authorization = "Bearer " + token;
    return config;
  },
  function (error) { return Promise.reject(error); }
);

/*
|--------------------------------------------------------------------------
| Response Interceptor
|--------------------------------------------------------------------------
*/

api.interceptors.response.use(
  function (response) { return response; },
  function (error) {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("replyzen_token");
      localStorage.removeItem("replyzen_user");
      if (window.location.pathname !== "/" && window.location.pathname !== "/login") {
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
  register:        (data)               => api.post("/auth/register", data),
  login:           (data)               => api.post("/auth/login", data),
  getMe:           ()                   => api.get("/auth/me"),
  getGoogleAuthUrl:(redirectUri)        => api.get("/auth/google/url", { params: { redirect_uri: redirectUri } }),
  googleCallback:  (code, redirectUri)  => api.post("/auth/google/callback", { code, redirect_uri: redirectUri }),
};

/*
|--------------------------------------------------------------------------
| Email APIs
|--------------------------------------------------------------------------
*/

export const emailAPI = {
  connectGmail:       (email)    => api.post("/emails/connect-gmail", { email }),
  getGmailAuthUrl:    ()         => api.get("/emails/gmail/auth-url"),
  gmailCallback:      (code, state) => api.post("/emails/gmail/callback", { code, state }, { params: { code, state } }),
  getAccounts:        ()         => api.get("/emails/accounts"),
  syncEmails:         ()         => api.post("/emails/sync"),
  getThreads:         (params)   => api.get("/emails/threads", { params }),
  getSilentThreads:   (params)   => api.get("/emails/threads/silent", { params }),
  dismissThread:      (threadId) => api.post(`/emails/threads/${threadId}/dismiss`),
  undismissThread:    (threadId) => api.post(`/emails/threads/${threadId}/undismiss`),
  getThreadReplyStatus: (threadId) => api.get(`/emails/threads/${threadId}/reply-status`),
};

/*
|--------------------------------------------------------------------------
| Followups
|--------------------------------------------------------------------------
*/

export const followupAPI = {
  generate:   (threadId, tone, forceRegenerate) =>
    api.post("/followups/generate", {
      thread_id: threadId,
      tone: tone || "professional",
      force_regenerate: forceRegenerate || false,
    }),
  list:       (params) => api.get("/followups", { params }),
  update:     (id, draft) => api.put(`/followups/${id}`, { draft }),
  send:       (id) => api.post(`/followups/${id}/send`),
  dismiss:    (id) => api.post(`/followups/${id}/dismiss`),
  regenerate: (id, tone) => api.post(`/followups/${id}/regenerate`, null, { params: { tone: tone || "professional" } }),
};

/*
|--------------------------------------------------------------------------
| Billing
|--------------------------------------------------------------------------
*/

export const billingAPI = {
  getPlans:           (currency) => api.get("/billing/plans", { params: currency ? { currency } : {} }),
  getPlanLimits:      ()         => api.get("/billing/plan-limits"),
  createCheckout:     (data)     => api.post("/billing/checkout", data),
  getSubscription:    ()         => api.get("/billing/subscription"),
  cancelSubscription: ()         => api.post("/billing/cancel"),
  detectLocation:     ()         => api.get("/billing/detect-location"),
};

/*
|--------------------------------------------------------------------------
| Analytics
|--------------------------------------------------------------------------
*/

export const analyticsAPI = {
  getOverview:          ()     => api.get("/analytics/overview"),
  getFollowupsOverTime: (days) => api.get("/analytics/followups-over-time", { params: { days } }),
  getTopContacts:       ()     => api.get("/analytics/top-contacts"),
};

/*
|--------------------------------------------------------------------------
| Settings
|--------------------------------------------------------------------------
*/

export const settingsAPI = {
  // Existing
  get:               ()     => api.get("/settings"),
  update:            (data) => api.put("/settings", data),
  updateProfile:     (data) => api.put("/settings/profile", data),
  updateSilenceRules:(data) => api.put("/settings/silence-rules", data),
  disconnectEmail:   (id)   => api.delete(`/settings/email-account/${id}`),

  // NEW: Follow-up scope
  updateFollowUpScope: (data) => api.put("/settings/followup-scope", data),

  // NEW: Block / unblock sender
  blockSender:        (senderEmail) => api.post("/settings/block-sender",   { sender_email: senderEmail }),
  unblockSender:      (senderEmail) => api.post("/settings/unblock-sender", { sender_email: senderEmail }),
  getBlockedSenders:  ()            => api.get("/settings/blocked-senders"),
};

export default api;

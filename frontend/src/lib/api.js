import axios from "axios";

/*
|--------------------------------------------------------------------------
| Backend Configuration
|--------------------------------------------------------------------------
*/

let BACKEND_URL;

if (process.env.REACT_APP_BACKEND_URL) {
  BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
} else if (process.env.REACT_APP_REPLIT_DEV_DOMAIN) {
  BACKEND_URL = `https://${process.env.REACT_APP_REPLIT_DEV_DOMAIN}:8000`;
} else if (process.env.NEXT_PUBLIC_API_URL) {
  BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;
} else {
  BACKEND_URL = "https://replyzen-ai01-production.up.railway.app";
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
  get:               ()     => api.get("/settings"),
  update:            (data) => api.put("/settings", data),
  updateProfile:     (data) => api.put("/settings/profile", data),
  updateSilenceRules:(data) => api.put("/settings/silence-rules", data),
  disconnectEmail:   (id)   => api.delete(`/settings/email-account/${id}`),
  updateFollowUpScope: (data) => api.put("/settings/followup-scope", data),
  blockSender:        (senderEmail) => api.post("/settings/block-sender",   { sender_email: senderEmail }),
  unblockSender:      (senderEmail) => api.post("/settings/unblock-sender", { sender_email: senderEmail }),
  getBlockedSenders:  ()            => api.get("/settings/blocked-senders"),
};

/*
|--------------------------------------------------------------------------
| Inbox Preview (Enhanced with AI Intelligence)
|--------------------------------------------------------------------------
*/

export const inboxAPI = {
  // Get messages with AI analysis
  getMessages: (limit = 20, status = null, category = null, priority = null) => 
    api.get("/inbox/messages", { params: { limit, status, category, priority } }),
  
  // Get daily summary (top 5 priority emails)
  getDailySummary: () => 
    api.get("/inbox/daily-summary"),
  
  // Generate single reply
  generateReply: (data) => 
    api.post("/inbox/generate-reply", data),
  
  // Generate 3 reply options (Professional, Friendly, Concise)
  generateReplies: (data) => 
    api.post("/inbox/generate-replies", data),
  
  // Get Gmail compose URL (opens Gmail in new tab)
  getGmailComposeUrl: (data) => 
    api.post("/inbox/gmail-compose-url", data),
  
  // Get inbox statistics
  getStats: () => 
    api.get("/inbox/stats"),
};

/*
|--------------------------------------------------------------------------
| Email Composer
|--------------------------------------------------------------------------
*/

export const composerAPI = {
  // Generate email from topic/goal
  generate: (data) => 
    api.post("/composer/generate", data),
  
  // Generate subject line suggestions
  getSubjectSuggestions: (data) => 
    api.post("/composer/subjects", data),
  
  // Check email quality score
  checkQuality: (body) => 
    api.post("/composer/quality", { body }),
  
  // Generate email from uploaded file (PDF/Image)
  generateFromFile: (formData) => 
    api.post("/composer/from-file", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  
  // Check available file processors
  getProcessors: () => 
    api.get("/composer/processors"),
  
  // Template management
  listTemplates: () => 
    api.get("/composer/templates"),
  
  getTemplate: (id) => 
    api.get(`/composer/templates/${id}`),
  
  saveTemplate: (data) => 
    api.post("/composer/templates", data),
  
  updateTemplate: (id, data) => 
    api.put(`/composer/templates/${id}`, data),
  
  deleteTemplate: (id) => 
    api.delete(`/composer/templates/${id}`),
};

/*
|--------------------------------------------------------------------------
| Notifications
|--------------------------------------------------------------------------
*/

export const notificationsAPI = {
  // Get all notifications
  getAll: (limit = 50, unreadOnly = false) =>
    api.get("/notifications", { params: { limit, unread_only: unreadOnly } }),
  
  // Get unread count
  getUnreadCount: () =>
    api.get("/notifications/unread"),
  
  // Mark as read
  markAsRead: (notificationId = null, markAll = false) =>
    api.post("/notifications/read", { notification_id: notificationId, mark_all: markAll }),
  
  // Delete notification
  delete: (id) =>
    api.delete(`/notifications/${id}`),
};

/*
|--------------------------------------------------------------------------
| AI Settings
|--------------------------------------------------------------------------
*/

export const aiSettingsAPI = {
  // Get AI settings
  get: () =>
    api.get("/ai-settings"),
  
  // Update AI settings
  update: (data) =>
    api.put("/ai-settings", data),
  
  // Get activity log
  getActivity: (limit = 50, type = null) =>
    api.get("/ai-settings/activity", { params: { limit, activity_type: type } }),
  
  // Get AI stats
  getStats: (days = 7) =>
    api.get("/ai-settings/stats", { params: { days } }),
};

export default api;

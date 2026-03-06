export const PLAN_CONFIG = {
  free: {
    followups_per_month: 30,
    max_email_accounts: 1,
    auto_send: false,
    analytics: false,
    ai_tones: ["professional"],
  },
  pro: {
    followups_per_month: 2500,
    max_email_accounts: 3,
    auto_send: true,
    analytics: true,
    ai_tones: ["professional", "friendly", "casual"],
  },
  business: {
    followups_per_month: -1,
    max_email_accounts: 10,
    auto_send: true,
    analytics: false,
    ai_tones: ["professional", "friendly", "casual"],
  },
};

export function getPlanConfig(plan) {
  return PLAN_CONFIG[plan] || PLAN_CONFIG.free;
}

export function isToneAllowed(plan, tone) {
  const cfg = getPlanConfig(plan);
  return cfg.ai_tones.includes(tone);
}

export function isAutoSendAllowed(plan) {
  return getPlanConfig(plan).auto_send;
}

export function isAnalyticsAllowed(plan) {
  return getPlanConfig(plan).analytics;
}

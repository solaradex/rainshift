export const FREE_TRIAL_DAYS = 7;

export const BILLING_PLANS = {
  starter: { name: "Starter", monthlyPrice: 99 },
  growth: { name: "Growth", monthlyPrice: 199 },
  pro: { name: "Pro", monthlyPrice: 399 },
} as const;

export type BillingPlan = keyof typeof BILLING_PLANS;

export const FREE_TRIAL_DAYS = 7;

export const BILLING_PLANS = {
  starter: {
    name: "Starter",
    monthlyPrice: 99,
    crews: "1–3 crews",
    properties: "Up to 500 properties",
  },
  growth: {
    name: "Growth",
    monthlyPrice: 199,
    crews: "4–10 crews",
    properties: "Up to 2,000 properties",
  },
  pro: {
    name: "Pro",
    monthlyPrice: 399,
    crews: "11–25 crews",
    properties: "Up to 5,000 properties",
  },
} as const;

export type BillingPlan = keyof typeof BILLING_PLANS;

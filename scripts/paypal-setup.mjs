const baseUrl =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set NEXT_PUBLIC_PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.local first.");
  process.exit(1);
}

async function request(path, options = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(data)}`);
  }

  return data;
}

async function accessToken() {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const data = await request("/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  return data.access_token;
}

const token = await accessToken();

async function paypal(path, options = {}) {
  return request(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
}

const plans = [
  {
    key: "starter",
    productId: "RAINSHIFT-STARTER",
    name: "RainShift Starter",
    amount: "99.00",
    description: "RainShift weather rescheduling for 1–3 crews and up to 500 properties.",
  },
  {
    key: "growth",
    productId: "RAINSHIFT-GROWTH",
    name: "RainShift Growth",
    amount: "199.00",
    description: "RainShift weather rescheduling for 4–10 crews and up to 2,000 properties.",
  },
  {
    key: "pro",
    productId: "RAINSHIFT-PRO",
    name: "RainShift Pro",
    amount: "399.00",
    description: "RainShift weather rescheduling for 11–25 crews and up to 5,000 properties.",
  },
];

const output = {};

for (const plan of plans) {
  let product;
  try {
    product = await paypal(`/v1/catalogs/products/${plan.productId}`, { method: "GET" });
  } catch {
    product = await paypal("/v1/catalogs/products", {
      method: "POST",
      headers: {
        "PayPal-Request-Id": `rainshift-product-${plan.key}`,
      },
      body: JSON.stringify({
        id: plan.productId,
        name: plan.name,
        description: plan.description,
        type: "SERVICE",
      }),
    });
  }

  const existingPlans = await paypal(
    `/v1/billing/plans?page_size=20&product_id=${encodeURIComponent(product.id)}`,
    { method: "GET" }
  );

  let subscriptionPlan = existingPlans.plans?.find(
    (item) => item.name === plan.name && item.status === "ACTIVE"
  );

  if (!subscriptionPlan) {
    subscriptionPlan = await paypal("/v1/billing/plans", {
      method: "POST",
      headers: {
        "PayPal-Request-Id": `rainshift-plan-${plan.key}`,
      },
      body: JSON.stringify({
        product_id: product.id,
        name: plan.name,
        description: plan.description,
        billing_cycles: [
          {
            frequency: { interval_unit: "WEEK", interval_count: 1 },
            tenure_type: "TRIAL",
            sequence: 1,
            total_cycles: 1,
            pricing_scheme: {
              fixed_price: { value: "0", currency_code: "USD" },
            },
          },
          {
            frequency: { interval_unit: "MONTH", interval_count: 1 },
            tenure_type: "REGULAR",
            sequence: 2,
            total_cycles: 0,
            pricing_scheme: {
              fixed_price: { value: plan.amount, currency_code: "USD" },
            },
          },
        ],
        payment_preferences: {
          auto_bill_outstanding: true,
          payment_failure_threshold: 1,
        },
        application_context: {
          user_action: "SUBSCRIBE_NOW",
        },
      }),
    });

    if (subscriptionPlan.status !== "ACTIVE") {
      await paypal(`/v1/billing/plans/${subscriptionPlan.id}/activate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    }
  }

  output[plan.key] = subscriptionPlan.id;
  console.log(`${plan.key}: ${subscriptionPlan.id}`);
}

console.log("\nAdd these to .env.local:");
for (const [key, value] of Object.entries(output)) {
  console.log(`PAYPAL_PLAN_${key.toUpperCase()}=${value}`);
}
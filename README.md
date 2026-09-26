# RainShift

RainShift is an AI-powered weather rescheduling layer for lawn and landscape companies.

## Current milestone

RainShift now has authenticated multi-tenant workspaces plus Stripe-powered 7-day trial onboarding.

Flow:

1. A new owner creates an account with Supabase Auth.
2. RainShift creates a private company workspace, crews, customers, demo weather event, and appointments.
3. The owner chooses Starter, Growth, or Pro.
4. Stripe Checkout collects a payment method and starts a 7-day free trial.
5. Stripe webhooks keep the RainShift billing account synchronized.
6. After checkout, the owner reaches the live weather rescheduling dashboard.
7. The operator can review and approve schedule changes, which are written to Supabase.

## Billing plans

- Starter — $99/month — 1–3 crews, up to 500 properties
- Growth — $199/month — 4–10 crews, up to 2,000 properties
- Pro — $399/month — 11–25 crews, up to 5,000 properties

The signup flow is a full-access 7-day free trial. The card is collected during Stripe Checkout and the selected plan renews at its listed monthly price after the trial unless canceled.

## Stripe setup

Create three recurring monthly Prices in Stripe Test mode:

- Starter — $99/month
- Growth — $199/month
- Pro — $399/month

Then add these values to the local .env file:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_GROWTH=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Do not commit .env or send secret keys through chat.

For local webhook testing, Stripe recommends using the Stripe CLI to forward webhook events to the local endpoint:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

The app handles checkout completion, subscription creation/updates/deletion, and failed subscription payments.

## Database

The current MVP uses the connected Supabase project directly through its publishable API.

You do **not** need a local PostgreSQL server, a database password, or `npx prisma db push` to run the current MVP.

From the RainShift directory:

```bash
git pull origin main
npm install
npm run dev
```

Prisma remains in the repository as the schema layer for future migration work.

## Scheduling rules

The deterministic engine uses three outcome classes:

- **KEEP** when weather risk stays below the review threshold.
- **MOVE** for routine work when rain risk is high enough to justify an automatic move.
- **REVIEW** for weather-sensitive specialty work when conditions need an operator decision.

Replacement dates are selected from Thursday through Saturday while keeping each crew's moved workload under a 7-hour planning cap.

## Stack

- Next.js
- TypeScript
- Supabase Auth + Postgres
- Stripe Billing + Checkout
- OpenAI API
- Weather API
- Google Maps
- Twilio

# RainShift

RainShift is an AI-powered weather rescheduling layer for lawn and landscape companies.

## Current milestone

RainShift now persists its operational data in PostgreSQL through Prisma.

Flow:

1. Weather events are stored in PostgreSQL.
2. Appointments, customers, and crews are stored in PostgreSQL.
3. `/api/reschedule` reads the live company records and generates a scheduling proposal.
4. The operator can change decisions in the dashboard.
5. `/api/reschedule/approve` validates the proposal and writes approved MOVE and KEEP decisions in a PostgreSQL transaction.
6. Rescheduled appointments receive a real `scheduledDate`, `RESCHEDULED` status, reason, and approval timestamp.

## Data model

Prisma schema is in `prisma/schema.prisma` and currently models:

- Companies
- Crews
- Customers
- Appointments
- Weather events
- Billing accounts

## Database setup

Prisma 7 keeps the connection URL in `prisma7.config.ts`, while the application runtime reads `DATABASE_URL`.

Copy `.env.example` to `.env` and add your PostgreSQL connection string:

```bash
cp .env.example .env
```

Then run:

```bash
npm install
npm run db:setup
npm run dev
```

The seed creates a demo company, three crews, five customers, five appointments, one weather event, and a trial billing account.

For a deployed environment, set `DATABASE_URL` in the hosting provider's environment variables and deploy the application. Verify the connection with:

```
GET /api/health/db
```

A successful response contains `"database": "connected"`.

## Current demo company

The API uses `RAINSHIFT_COMPANY_ID` when present and falls back to `demo-company`. This is intentional for the pre-auth MVP. Authenticated company scoping replaces this fallback when Auth.js is added.

## Scheduling rules

The deterministic engine uses three outcome classes:

- **KEEP** when weather risk stays below the review threshold.
- **MOVE** for routine work when rain risk is high enough to justify an automatic move.
- **REVIEW** for weather-sensitive specialty work when conditions need an operator decision.

Replacement dates are real ISO timestamps and are selected from Thursday through Saturday while keeping each crew's moved workload under a 7-hour planning cap.

## Launch billing

RainShift will launch with a **7-day full-access free trial**. The customer selects a plan and provides a payment method during signup. Unless they cancel before the trial ends, the selected subscription converts to paid billing.

## Stack

- Next.js
- TypeScript
- PostgreSQL + Prisma
- Auth.js
- OpenAI API
- Weather API
- Google Maps
- Twilio
- Stripe

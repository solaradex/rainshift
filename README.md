# RainShift

RainShift is an AI-powered weather rescheduling layer for lawn and landscape companies.

## Current milestone

RainShift now has a deterministic scheduling core and a thin API around it.

Flow:

1. Demo weather event enters the engine.
2. Appointments are classified as KEEP, MOVE, or REVIEW.
3. MOVE appointments receive a replacement day using crew capacity.
4. The dashboard loads the proposal through `/api/reschedule`.
5. The operator can change decisions and submit approval through `/api/reschedule/approve`.

The approval endpoint is intentionally simulated until Postgres is connected.

## Data model

Prisma schema is in `prisma/schema.prisma` and currently models:

- Companies
- Crews
- Customers
- Appointments
- Weather events

## Stack

- Next.js
- TypeScript
- Postgres + Prisma
- Auth.js
- OpenAI API
- Weather API
- Google Maps
- Twilio
- Stripe

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

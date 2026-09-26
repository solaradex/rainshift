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


## Scheduling rules

The first deterministic engine uses three outcome classes:

- **KEEP** when weather risk stays below the review threshold.
- **MOVE** for routine work when rain risk is high enough to justify an automatic move.
- **REVIEW** for weather-sensitive specialty work when conditions need an operator decision.

Replacement days are assigned from Thursday through Saturday while keeping each crew's moved workload under a 7-hour planning cap.

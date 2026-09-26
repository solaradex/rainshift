# RainShift

RainShift is an AI-powered weather rescheduling layer for lawn and landscape companies.

## MVP

The first milestone is intentionally narrow:

- Detect a weather event
- Identify affected appointments
- Recommend KEEP / MOVE / REVIEW
- Show a proposed replacement schedule
- Let the operator approve the proposal

The current dashboard uses seeded demo data. Real weather, database persistence, scheduling-platform adapters, SMS, billing, and AI explanations will be added in later milestones.

## Stack

- Next.js
- TypeScript
- Postgres + Prisma (next)
- Auth.js (next)
- OpenAI API (next)
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

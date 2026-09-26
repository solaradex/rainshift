import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed RainShift");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const weatherDate = new Date("2026-09-28T00:00:00.000Z");

async function main() {
  await prisma.appointment.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.weatherEvent.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.customer.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.crew.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.billingAccount.deleteMany({ where: { companyId: "demo-company" } });
  await prisma.company.deleteMany({ where: { id: "demo-company" } });

  await prisma.company.create({
    data: {
      id: "demo-company",
      name: "RainShift Demo Landscapes",
      timezone: "America/New_York",
      billingAccount: {
        create: {
          plan: "starter",
          status: "TRIALING",
          trialStartedAt: new Date("2026-09-26T00:00:00.000Z"),
          trialEndsAt: new Date("2026-10-03T00:00:00.000Z"),
        },
      },
      crews: {
        create: [
          { id: "crew-a", name: "Crew A", dailyCapacity: 480 },
          { id: "crew-b", name: "Crew B", dailyCapacity: 480 },
          { id: "crew-c", name: "Crew C", dailyCapacity: 480 },
        ],
      },
      customers: {
        create: [
          {
            id: "customer-101",
            name: "Mason Family",
            phone: "+15555550101",
            address: "128 River Oak Dr",
            preferredDays: ["Thu", "Fri"],
          },
          {
            id: "customer-102",
            name: "Harper Residence",
            phone: "+15555550102",
            address: "214 Pine Ridge Ln",
            preferredDays: ["Thu"],
          },
          {
            id: "customer-103",
            name: "Oak & Co.",
            phone: "+15555550103",
            address: "44 Oak St",
            preferredDays: ["Fri", "Sat"],
          },
          {
            id: "customer-104",
            name: "Bennett Home",
            phone: "+15555550104",
            address: "901 Magnolia Ave",
            preferredDays: ["Fri"],
          },
          {
            id: "customer-105",
            name: "Northside Rentals",
            phone: "+15555550105",
            address: "63 Westside Blvd",
            preferredDays: ["Thu", "Sat"],
          },
        ],
      },
      weatherEvents: {
        create: {
          id: "weather-2026-09-28",
          eventDate: weatherDate,
          rainProbability: 82,
          expectedInches: 1.4,
          severity: "HIGH",
        },
      },
      appointments: {
        create: [
          {
            id: "A-101",
            customerId: "customer-101",
            crewId: "crew-a",
            service: "Weekly Mow",
            scheduledDate: weatherDate,
            durationMinutes: 45,
          },
          {
            id: "A-102",
            customerId: "customer-102",
            crewId: "crew-a",
            service: "Mow + Edge",
            scheduledDate: weatherDate,
            durationMinutes: 60,
          },
          {
            id: "A-103",
            customerId: "customer-103",
            crewId: "crew-b",
            service: "Landscape Bed",
            scheduledDate: weatherDate,
            durationMinutes: 90,
          },
          {
            id: "A-104",
            customerId: "customer-104",
            crewId: "crew-b",
            service: "Weekly Mow",
            scheduledDate: weatherDate,
            durationMinutes: 45,
          },
          {
            id: "A-105",
            customerId: "customer-105",
            crewId: "crew-c",
            service: "Cleanup",
            scheduledDate: weatherDate,
            durationMinutes: 120,
          },
        ],
      },
    },
  });

  console.log("RainShift demo database seeded.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

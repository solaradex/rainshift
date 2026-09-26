import type { DemoAppointment, WeatherEvent } from "./scheduling/types";

export const demoWeather: WeatherEvent = {
  location: "Jacksonville",
  eventDate: "2026-09-28T00:00:00.000Z",
  rainProbability: 82,
  expectedInches: 1.4,
};

export const demoAppointments: DemoAppointment[] = [
  {
    id: "A-101",
    customer: "Mason Family",
    address: "128 River Oak Dr",
    crew: "Crew A",
    service: "Weekly Mow",
    duration: 45,
    distance: 2.1,
    preferredDay: "Wed",
  },
  {
    id: "A-102",
    customer: "Harper Residence",
    address: "214 Pine Ridge Ln",
    crew: "Crew A",
    service: "Mow + Edge",
    duration: 60,
    distance: 3.4,
    preferredDay: "Thu",
  },
  {
    id: "A-103",
    customer: "Oak & Co.",
    address: "44 Oak St",
    crew: "Crew B",
    service: "Landscape Bed",
    duration: 90,
    distance: 5.2,
    preferredDay: "Wed",
  },
  {
    id: "A-104",
    customer: "Bennett Home",
    address: "901 Magnolia Ave",
    crew: "Crew B",
    service: "Weekly Mow",
    duration: 45,
    distance: 1.8,
    preferredDay: "Wed",
  },
  {
    id: "A-105",
    customer: "Northside Rentals",
    address: "63 Westside Blvd",
    crew: "Crew C",
    service: "Cleanup",
    duration: 120,
    distance: 6.1,
    preferredDay: "Wed",
  },
];

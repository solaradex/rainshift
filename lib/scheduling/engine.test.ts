import { buildRescheduleProposal } from "./engine";

const demoAppointments = [
  { id: "1", customer: "Mow Client", address: "1 Main St", crew: "A", service: "Weekly Mow", duration: 45, distance: 1, preferredDay: "Wed" },
  { id: "2", customer: "Landscape Client", address: "2 Main St", crew: "B", service: "Landscape Bed", duration: 90, distance: 2, preferredDay: "Wed" },
  { id: "3", customer: "Cleanup Client", address: "3 Main St", crew: "C", service: "Cleanup", duration: 120, distance: 3, preferredDay: "Wed" },
];

const mediumRisk = buildRescheduleProposal(demoAppointments, {
  location: "Jacksonville",
  eventDate: "2026-09-28",
  rainProbability: 82,
  expectedInches: 1.4,
});

if (mediumRisk.counts.move !== 1 || mediumRisk.counts.review !== 2) {
  throw new Error("Medium-risk proposal should move routine work and review specialty work");
}

const clearWeather = buildRescheduleProposal(demoAppointments, {
  location: "Jacksonville",
  eventDate: "2026-09-29",
  rainProbability: 20,
  expectedInches: 0.1,
});

if (clearWeather.counts.keep !== 3) {
  throw new Error("Clear weather should keep all appointments");
}

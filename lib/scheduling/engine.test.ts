import test from "node:test";
import assert from "node:assert/strict";
import { buildRescheduleProposal } from "./engine";

const eventDate = "2026-09-28T00:00:00.000Z";

function appointment(
  id: string,
  duration: number,
  service = "Lawn Mowing",
  preferredDay = "Tue",
  scheduledDate = eventDate,
  latitude?: number,
  longitude?: number
) {
  return {
    id,
    customer: id,
    address: "123 Test St",
    crew: "Crew A",
    service,
    duration,
    distance: 0,
    latitude,
    longitude,
    preferredDay,
    scheduledDate,
  };
}

const highRain = {
  location: "Jacksonville",
  eventDate,
  rainProbability: 90,
  expectedInches: 2,
};

test("uses existing future workload and prefers capacity-aware replacement days", () => {
  const affected = [
    appointment("long", 120),
    appointment("short", 60),
  ];

  const future = [
    appointment(
      "tuesday-existing",
      360,
      "Lawn Mowing",
      "Tue",
      "2026-09-29T12:00:00.000Z"
    ),
  ];

  const proposal = buildRescheduleProposal(affected, highRain, future);
  const longMove = proposal.appointments.find((item) => item.id === "long");
  const shortMove = proposal.appointments.find((item) => item.id === "short");

  assert.equal(longMove?.status, "MOVE");
  assert.equal(longMove?.newDate?.slice(0, 10), "2026-09-30");
  assert.equal(shortMove?.status, "MOVE");
  assert.equal(shortMove?.newDate?.slice(0, 10), "2026-09-29");
  assert.deepEqual(proposal.counts, { move: 2, keep: 0, review: 0 });
});

test("returns REVIEW when no replacement day has enough capacity", () => {
  const affected = [
    appointment("move-1", 180),
    appointment("move-2", 180),
  ];

  const future = [
    appointment("tue-load", 300, "Lawn Mowing", "Tue", "2026-09-29T12:00:00.000Z"),
    appointment("wed-load", 300, "Lawn Mowing", "Wed", "2026-09-30T12:00:00.000Z"),
    appointment("thu-load", 300, "Lawn Mowing", "Thu", "2026-10-01T12:00:00.000Z"),
  ];

  const proposal = buildRescheduleProposal(affected, highRain, future);

  assert.equal(proposal.appointments.every((item) => item.status === "REVIEW"), true);
  assert.deepEqual(proposal.counts, { move: 0, keep: 0, review: 2 });
  assert.match(
    proposal.appointments[0]?.reason ?? "",
    /No replacement day has enough crew capacity/
  );
});

test("keeps surface-sensitive work for human review at medium rain risk", () => {
  const mediumRain = {
    location: "Jacksonville",
    eventDate,
    rainProbability: 75,
    expectedInches: 0.8,
  };

  const proposal = buildRescheduleProposal(
    [
      appointment("bed", 90, "Landscape Bed"),
      appointment("mow", 60, "Lawn Mowing"),
    ],
    mediumRain
  );

  const bed = proposal.appointments.find((item) => item.id === "bed");
  const mow = proposal.appointments.find((item) => item.id === "mow");

  assert.equal(bed?.status, "REVIEW");
  assert.equal(mow?.status, "MOVE");
  assert.equal(proposal.counts.move, 1);
  assert.equal(proposal.counts.review, 1);
});


test("prefers the lower incremental route cost when capacity is equal", () => {
  const affected = [
    {
      ...appointment("route-job", 60, "Lawn Mowing", "Fri"),
      latitude: 30.4500,
      longitude: -81.6500,
    },
  ];

  const future = [
    {
      ...appointment("near-tue", 120, "Lawn Mowing", "Tue", "2026-09-29T12:00:00.000Z"),
      latitude: 30.4520,
      longitude: -81.6520,
    },
    {
      ...appointment("far-wed", 120, "Lawn Mowing", "Wed", "2026-09-30T12:00:00.000Z"),
      latitude: 30.6000,
      longitude: -81.8000,
    },
    {
      ...appointment("far-thu", 120, "Lawn Mowing", "Thu", "2026-10-01T12:00:00.000Z"),
      latitude: 30.7000,
      longitude: -81.9000,
    },
  ];

  const proposal = buildRescheduleProposal(affected, highRain, future);
  const moved = proposal.appointments.find((item) => item.id === "route-job");

  assert.equal(moved?.status, "MOVE");
  assert.equal(moved?.newDate?.slice(0, 10), "2026-09-29");
});

test("keeps legacy replacement behavior when coordinates are unavailable", () => {
  const proposal = buildRescheduleProposal(
    [appointment("legacy", 60, "Lawn Mowing", "Wed")],
    highRain
  );

  const moved = proposal.appointments.find((item) => item.id === "legacy");
  assert.equal(moved?.status, "MOVE");
  assert.equal(moved?.newDate?.slice(0, 10), "2026-09-30");
});


test("returns REVIEW when service time plus estimated drive time exceeds crew capacity", () => {
  const affected = [
    {
      ...appointment("drive-heavy", 60, "Lawn Mowing", "Tue"),
      latitude: 30.4500,
      longitude: -81.6500,
    },
  ];

  const future = [
    {
      ...appointment("route-1", 360, "Lawn Mowing", "Tue", "2026-09-29T12:00:00.000Z"),
      latitude: 30.5000,
      longitude: -81.7000,
    },
    {
      ...appointment("route-2", 360, "Lawn Mowing", "Tue", "2026-09-30T13:00:00.000Z"),
      latitude: 30.6500,
      longitude: -81.8500,
    },
    {
      ...appointment("route-3", 360, "Lawn Mowing", "Tue", "2026-10-01T14:00:00.000Z"),
      latitude: 30.8500,
      longitude: -82.0500,
    },
  ];

  const proposal = buildRescheduleProposal(affected, highRain, future);
  const moved = proposal.appointments.find((item) => item.id === "drive-heavy");

  assert.equal(moved?.status, "REVIEW");
  assert.match(moved?.reason ?? "", /No replacement day has enough crew capacity/);
});

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { countLiveShipmentsByStatus } = require("../../web/dashboard-status.mjs");
const statuses = ["Booked", "In-Transit", "Under-Clearance", "Delivered"];
const dateForCreatedShipment = (row) => String(row.createdAt || row.created_at || "").slice(0, 10);
const labelStatus = (value) => {
  const key = String(value || "").trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  return statuses.find((status) => status.toLowerCase().replace(/[-_]+/g, " ") === key) || "";
};
const today = "2026-10-29";
function count(shipments, branches) {
  return countLiveShipmentsByStatus({
    shipments,
    branches,
    statuses,
    today,
    createdDateForShipment: dateForCreatedShipment,
    labelStatus
  });
}

test("Live counts today's shipments by their current status as users update them", () => {
  const shipments = Array.from({ length: 5 }, (_, index) => ({
    jobNo: `KWI-${index + 1}`,
    branch: "Kuwait HO",
    status: "Booked",
    createdAt: `${today}T08:00:00.000Z`
  }));
  assert.deepEqual(count(shipments, ["Kuwait HO"]), {
    Booked: 5,
    "In-Transit": 0,
    "Under-Clearance": 0,
    Delivered: 0
  });

  shipments[0].status = "In-Transit";
  shipments[1].status = "In-Transit";
  assert.deepEqual(count(shipments, ["Kuwait HO"]), {
    Booked: 3,
    "In-Transit": 2,
    "Under-Clearance": 0,
    Delivered: 0
  });

  shipments[0].status = "Delivered";
  assert.deepEqual(count(shipments, ["Kuwait HO"]), {
    Booked: 3,
    "In-Transit": 1,
    "Under-Clearance": 0,
    Delivered: 1
  });
});

test("Live counts are branch-filtered even when job numbers overlap", () => {
  const shipments = [
    { jobNo: "AFS-1001", branch: "Kuwait HO", status: "Booked", createdAt: `${today}T08:00:00Z` },
    { jobNo: "AFS-1001", branch: "Dubai", status: "Delivered", createdAt: `${today}T08:05:00Z` }
  ];
  assert.deepEqual(count(shipments, ["Dubai"]), {
    Booked: 0,
    "In-Transit": 0,
    "Under-Clearance": 0,
    Delivered: 1
  });
  assert.deepEqual(count(shipments, ["Kuwait HO"]), {
    Booked: 1,
    "In-Transit": 0,
    "Under-Clearance": 0,
    Delivered: 0
  });
});

test("Live recognizes common branch labels and Under Clearance status spelling", () => {
  const shipments = [
    { jobNo: "KWI-1001", branch: "Kuwait Branch", status: "Under Clearance", createdAt: `${today}T08:00:00Z` },
    { jobNo: "DBX-1001", branch: "Dubai Branch", status: "Delivered", createdAt: `${today}T08:00:00Z` }
  ];
  assert.deepEqual(count(shipments, ["Kuwait HO"]), {
    Booked: 0,
    "In-Transit": 0,
    "Under-Clearance": 1,
    Delivered: 0
  });
  assert.deepEqual(count(shipments, ["Dubai"]), {
    Booked: 0,
    "In-Transit": 0,
    "Under-Clearance": 0,
    Delivered: 1
  });
});

test("shipments created on another day are not included in today's Live totals", () => {
  const shipments = [
    { jobNo: "KWI-1001", branch: "Kuwait HO", status: "Booked", createdAt: "2026-10-28T23:59:00Z" },
    { jobNo: "KWI-1002", branch: "Kuwait HO", status: "Delivered", createdAt: `${today}T00:01:00Z` }
  ];
  assert.deepEqual(count(shipments, ["Kuwait HO"]), {
    Booked: 0,
    "In-Transit": 0,
    "Under-Clearance": 0,
    Delivered: 1
  });
});

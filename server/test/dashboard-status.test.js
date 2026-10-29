"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { countLiveShipmentsByStatus } = require("../../web/dashboard-status.mjs");
const statuses = ["Booked", "In-Transit", "Under-Clearance", "Delivered"];
const today = "2026-10-29";
const dateForCreatedShipment = (row) => String(row.createdAt || row.created_at || "").slice(0, 10);
const dateForHistory = (value) => String(value || "").slice(0, 10);
const labelStatus = (value) => {
  const key = String(value || "").trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  return statuses.find((status) => status.toLowerCase().replace(/[-_]+/g, " ") === key) || "";
};
function count(shipments, branches, history = []) {
  return countLiveShipmentsByStatus({
    shipments,
    history,
    branches,
    statuses,
    today,
    createdDateForShipment: dateForCreatedShipment,
    dateForHistory,
    labelStatus
  });
}

test("five created-today shipments move between current-status counts as statuses change", () => {
  const shipments = Array.from({ length: 5 }, (_, index) => ({
    jobNo: `KWI-${index + 1}`,
    branch: "Kuwait HO",
    status: "Booked",
    createdAt: `${today}T08:00:00.000Z`
  }));
  const history = [];
  assert.deepEqual(count(shipments, ["Kuwait HO"], history), {
    Booked: 5,
    "In-Transit": 0,
    "Under-Clearance": 0,
    Delivered: 0
  });

  shipments[0].status = "In-Transit";
  shipments[1].status = "In-Transit";
  history.push(
    { id: 1, jobNo: "KWI-1", branch: "Kuwait HO", status: "In-Transit", updatedAt: `${today}T09:00:00Z` },
    { id: 2, jobNo: "KWI-2", branch: "Kuwait HO", status: "In-Transit", updatedAt: `${today}T09:01:00Z` }
  );
  assert.deepEqual(count(shipments, ["Kuwait HO"], history), {
    Booked: 3,
    "In-Transit": 2,
    "Under-Clearance": 0,
    Delivered: 0
  });

  shipments[0].status = "Delivered";
  history.push({ id: 3, jobNo: "KWI-1", branch: "Kuwait HO", status: "Delivered", updatedAt: `${today}T10:00:00Z` });
  assert.deepEqual(count(shipments, ["Kuwait HO"], history), {
    Booked: 3,
    "In-Transit": 1,
    "Under-Clearance": 0,
    Delivered: 1
  });
});

test("older shipments updated today count under their current status", () => {
  const shipments = Array.from({ length: 10 }, (_, index) => ({
    jobNo: `KWI-OLD-${index + 1}`,
    branch: "Kuwait HO",
    status: "In-Transit",
    createdAt: "2026-10-28T08:00:00.000Z"
  }));
  const history = shipments.map((row, index) => ({
    id: index + 1,
    jobNo: row.jobNo,
    branch: row.branch,
    status: "In-Transit",
    updatedAt: `${today}T09:00:00Z`
  }));
  assert.deepEqual(count(shipments, ["Kuwait HO"], history), {
    Booked: 0,
    "In-Transit": 10,
    "Under-Clearance": 0,
    Delivered: 0
  });
});

test("branch filters isolate overlapping job numbers and allow cross-branch AWB-independent counts", () => {
  const shipments = [
    { jobNo: "AFS-1001", branch: "Kuwait HO", status: "In-Transit", createdAt: "2026-10-28T08:00:00Z" },
    { jobNo: "AFS-1001", branch: "Dubai", status: "Delivered", createdAt: "2026-10-28T08:05:00Z" }
  ];
  const history = [
    { id: 1, jobNo: "AFS-1001", branch: "Kuwait HO", status: "In-Transit", updatedAt: `${today}T09:00:00Z` },
    { id: 2, jobNo: "AFS-1001", branch: "Dubai", status: "Delivered", updatedAt: `${today}T09:05:00Z` }
  ];
  assert.deepEqual(count(shipments, ["Dubai"], history), {
    Booked: 0,
    "In-Transit": 0,
    "Under-Clearance": 0,
    Delivered: 1
  });
  assert.deepEqual(count(shipments, ["Kuwait HO"], history), {
    Booked: 0,
    "In-Transit": 1,
    "Under-Clearance": 0,
    Delivered: 0
  });
});

test("common branch labels and Under Clearance spelling are normalized", () => {
  const shipments = [
    { jobNo: "KWI-1001", branch: "Kuwait Branch", status: "Under Clearance", createdAt: `${today}T08:00:00Z` },
    { jobNo: "DBX-1001", branch: "Dubai Branch", status: "Delivered", createdAt: "2026-10-28T08:00:00Z" }
  ];
  const history = [{ id: 3, jobNo: "DBX-1001", branch: "DBX", status: "Delivered", updatedAt: `${today}T09:00:00Z` }];
  assert.deepEqual(count(shipments, ["Kuwait HO"], history), {
    Booked: 0,
    "In-Transit": 0,
    "Under-Clearance": 1,
    Delivered: 0
  });
  assert.deepEqual(count(shipments, ["Dubai"], history), {
    Booked: 0,
    "In-Transit": 0,
    "Under-Clearance": 0,
    Delivered: 1
  });
});

test("legacy history without branch is not attributed when a job number exists in multiple branches", () => {
  const shipments = [
    { jobNo: "AFS-2001", branch: "Kuwait HO", status: "Delivered", createdAt: "2026-10-28T08:00:00Z" },
    { jobNo: "AFS-2001", branch: "Dubai", status: "Delivered", createdAt: "2026-10-28T09:00:00Z" }
  ];
  const history = [{ id: 4, jobNo: "AFS-2001", status: "Delivered", updatedAt: `${today}T09:00:00Z` }];
  assert.deepEqual(count(shipments, ["Kuwait HO", "Dubai"], history), {
    Booked: 0,
    "In-Transit": 0,
    "Under-Clearance": 0,
    Delivered: 0
  });
});

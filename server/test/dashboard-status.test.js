"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { countBranchStatusUpdates } = require("../../web/dashboard-status.mjs");

const statuses = ["Booked", "In-Transit", "Delivered"];
const dateForHistory = (value) => String(value || "").slice(0, 10);
const labelStatus = (value) => statuses.find((status) => status.toLowerCase() === String(value || "").toLowerCase()) || "";

test("today's Live updates are counted independently for same job number in Kuwait and Dubai", () => {
  const counts = countBranchStatusUpdates({
    shipments: [
      { jobNo: "AFS-1001", branch: "Kuwait HO" },
      { jobNo: "AFS-1001", branch: "Dubai" }
    ],
    history: [
      { id: 10, jobNo: "AFS-1001", branch: "Dubai", status: "Delivered", updatedAt: "2026-10-29" },
      { id: 9, jobNo: "AFS-1001", branch: "Kuwait HO", status: "In-Transit", updatedAt: "2026-10-29" }
    ],
    branches: ["Dubai"],
    statuses,
    today: "2026-10-29",
    dateForHistory,
    labelStatus
  });
  assert.deepEqual(counts, { Booked: 0, "In-Transit": 0, Delivered: 1 });
});

test("legacy history without branch is ignored when that job number exists in multiple branches", () => {
  const counts = countBranchStatusUpdates({
    shipments: [
      { jobNo: "AFS-1001", branch: "Kuwait HO" },
      { jobNo: "AFS-1001", branch: "Dubai" }
    ],
    history: [{ id: 3, jobNo: "AFS-1001", status: "Delivered", updatedAt: "2026-10-29" }],
    branches: ["Dubai", "Kuwait HO"],
    statuses,
    today: "2026-10-29",
    dateForHistory,
    labelStatus
  });
  assert.deepEqual(counts, { Booked: 0, "In-Transit": 0, Delivered: 0 });
});

test("legacy unambiguous history is retained, and later status wins per branch/job", () => {
  const counts = countBranchStatusUpdates({
    shipments: [{ jobNo: "AFS-2001", branch: "Branch 1" }],
    history: [
      { id: 2, jobNo: "AFS-2001", status: "Delivered", updatedAt: "2026-10-29" },
      { id: 5, jobNo: "AFS-2001", status: "In-Transit", updatedAt: "2026-10-29" }
    ],
    branches: ["Kuwait HO"],
    statuses,
    today: "2026-10-29",
    dateForHistory,
    labelStatus
  });
  assert.deepEqual(counts, { Booked: 0, "In-Transit": 1, Delivered: 0 });
});

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { countBranchStatusUpdates } = require("../../web/dashboard-status.mjs");

const statuses = ["Booked", "In-Transit", "Delivered"];
const dateForHistory = (value) => String(value || "").slice(0, 10);
const labelStatus = (value) => statuses.find((status) => status.toLowerCase() === String(value || "").toLowerCase()) || "";
test("common Kuwait and Dubai branch-name variants map to their Live filters", () => {
  const counts = countBranchStatusUpdates({
    shipments: [
      { jobNo: "KWI-1001", branch: "Kuwait Branch" },
      { jobNo: "DBX-1001", branch: "Dubai Branch" }
    ],
    history: [
      { id: 1, jobNo: "KWI-1001", branch: "Kuwait", status: "In-Transit", updatedAt: "2026-10-29" },
      { id: 2, jobNo: "DBX-1001", branch: "DBX", status: "Delivered", updatedAt: "2026-10-29" }
    ],
    branches: ["Kuwait HO", "Dubai"],
    statuses,
    today: "2026-10-29",
    dateForHistory,
    labelStatus
  });
  assert.deepEqual(counts, { Booked: 0, "In-Transit": 1, Delivered: 1 });
});
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

export function normalizeDashboardBranch(value) {
  const branch = String(value || "").trim().toLowerCase();
  if (["branch 1", "kuwait 1", "kuwait", "kuwait ho", "kuwait branch", "kuwait hq", "kuwait head office", "kwi"].includes(branch)) return "Kuwait HO";
  if (["branch 2", "dubai 2", "dubai", "dubai branch", "dbx"].includes(branch)) return "Dubai";
  return String(value || "").trim();
}

export function countLiveShipmentsByStatus({
  shipments = [],
  history = [],
  branches = [],
  statuses = [],
  today = "",
  branchForShipment = (row) => row.branch,
  createdDateForShipment = (row) => String(row.createdAt || row.created_at || "").slice(0, 10),
  dateForHistory = (value) => String(value || "").slice(0, 10),
  labelStatus = (value) => String(value || "").trim()
} = {}) {
  const selectedBranches = new Set(branches.map(normalizeDashboardBranch));
  const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
  const shipmentByBranchAndJob = new Map();
  const branchesByJob = new Map();

  for (const row of shipments) {
    const jobNo = String(row?.jobNo || row?.job_no || "").trim().toLowerCase();
    const branch = normalizeDashboardBranch(branchForShipment(row));
    if (!jobNo || !branch) continue;
    const key = `${branch}\u0000${jobNo}`;
    shipmentByBranchAndJob.set(key, row);
    if (!branchesByJob.has(jobNo)) branchesByJob.set(jobNo, new Set());
    branchesByJob.get(jobNo).add(branch);
  }

  const eligibleShipments = new Set();
  for (const [key, row] of shipmentByBranchAndJob) {
    const branch = key.slice(0, key.indexOf("\u0000"));
    if (selectedBranches.has(branch) && createdDateForShipment(row) === today) eligibleShipments.add(key);
  }

  for (const entry of history) {
    const jobNo = String(entry?.jobNo || entry?.job_no || "").trim().toLowerCase();
    if (!jobNo || dateForHistory(entry?.updatedAt || entry?.updated_at) !== today) continue;
    const recordedBranch = normalizeDashboardBranch(entry?.branch);
    const possibleBranches = branchesByJob.get(jobNo);
    const branch = recordedBranch || (possibleBranches?.size === 1 ? [...possibleBranches][0] : "");
    if (!branch || !selectedBranches.has(branch) || !possibleBranches?.has(branch)) continue;
    const key = `${branch}\u0000${jobNo}`;
    if (shipmentByBranchAndJob.has(key)) eligibleShipments.add(key);
  }

  for (const key of eligibleShipments) {
    const status = labelStatus(shipmentByBranchAndJob.get(key)?.status);
    if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
  }
  return counts;
}

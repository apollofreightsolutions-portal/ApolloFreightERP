export function normalizeDashboardBranch(value) {
  const branch = String(value || "").trim().toLowerCase();
  if (["branch 1", "kuwait 1", "kuwait", "kuwait ho", "kuwait branch", "kuwait hq", "kuwait head office", "kwi"].includes(branch)) return "Kuwait HO";
  if (["branch 2", "dubai 2", "dubai", "dubai branch", "dbx"].includes(branch)) return "Dubai";
  return String(value || "").trim();
}

export function countLiveShipmentsByStatus({
  shipments = [],
  branches = [],
  statuses = [],
  today = "",
  branchForShipment = (row) => row.branch,
  createdDateForShipment = (row) => String(row.createdAt || row.created_at || "").slice(0, 10),
  labelStatus = (value) => String(value || "").trim()
} = {}) {
  const selectedBranches = new Set(branches.map(normalizeDashboardBranch));
  const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
  const countedShipments = new Set();
  for (const row of shipments) {
    const jobNo = String(row?.jobNo || row?.job_no || "").trim().toLowerCase();
    const branch = normalizeDashboardBranch(branchForShipment(row));
    const createdDate = createdDateForShipment(row);
    const status = labelStatus(row?.status);
    if (!jobNo || !branch || !selectedBranches.has(branch) || createdDate !== today) continue;
    if (!Object.prototype.hasOwnProperty.call(counts, status)) continue;
    const key = `${branch}\u0000${jobNo}`;
    if (countedShipments.has(key)) continue;
    countedShipments.add(key);
    counts[status] += 1;
  }
  return counts;
}

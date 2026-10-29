export function normalizeDashboardBranch(value) {
  const branch = String(value || "").trim().toLowerCase();
  if (["branch 1", "kuwait 1", "kuwait", "kuwait ho", "kuwait branch", "kuwait hq", "kuwait head office", "kwi"].includes(branch)) return "Kuwait HO";
  if (["branch 2", "dubai 2", "dubai", "dubai branch", "dbx"].includes(branch)) return "Dubai";
  return String(value || "").trim();
}

export function countBranchStatusUpdates({
  shipments = [],
  history = [],
  branches = [],
  statuses = [],
  today = "",
  branchForShipment = (row) => row.branch,
  dateForHistory = (value) => String(value || "").slice(0, 10),
  labelStatus = (value) => String(value || "").trim(),
  isLater = (candidate, current) => Number(candidate?.id || 0) > Number(current?.id || 0)
} = {}) {
  const selectedBranches = new Set(branches.map(normalizeDashboardBranch));
  const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
  const branchesByJob = new Map();
  shipments.forEach((row) => {
    const jobNo = String(row?.jobNo || row?.job_no || "").trim().toLowerCase();
    const branch = normalizeDashboardBranch(branchForShipment(row));
    if (!jobNo || !branch) return;
    if (!branchesByJob.has(jobNo)) branchesByJob.set(jobNo, new Set());
    branchesByJob.get(jobNo).add(branch);
  });

  const latestByShipment = new Map();
  history.forEach((entry) => {
    const jobNo = String(entry?.jobNo || entry?.job_no || "").trim().toLowerCase();
    const entryDate = dateForHistory(entry?.updatedAt || entry?.updated_at);
    const status = labelStatus(entry?.status);
    if (!jobNo || entryDate !== today || !Object.prototype.hasOwnProperty.call(counts, status)) return;

    // Older history rows have no branch. Attribute those only when the job number maps to
    // exactly one branch; otherwise counting them would leak a Kuwait update into Dubai (or vice versa).
    const recordedBranch = normalizeDashboardBranch(entry?.branch);
    const possibleBranches = branchesByJob.get(jobNo);
    const branch = recordedBranch || (possibleBranches?.size === 1 ? [...possibleBranches][0] : "");
    if (!branch || !selectedBranches.has(branch) || !possibleBranches?.has(branch)) return;

    const key = `${branch}\u0000${jobNo}`;
    const current = latestByShipment.get(key);
    if (!current || isLater(entry, current)) latestByShipment.set(key, { ...entry, status });
  });
  latestByShipment.forEach((entry) => { counts[entry.status] += 1; });
  return counts;
}

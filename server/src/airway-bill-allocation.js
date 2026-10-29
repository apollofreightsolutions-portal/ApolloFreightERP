"use strict";

const BRANCH_KEY_SQL = `case
  when lower(btrim(coalesce(s.branch, ''))) in ('branch 1', 'kuwait 1', 'kuwait', 'kuwait ho') then 'kuwait ho'
  when lower(btrim(coalesce(s.branch, ''))) in ('branch 2', 'dubai 2', 'dubai') then 'dubai'
  else lower(btrim(coalesce(s.branch, '')))
end`;

function normalizeBranchKey(value) {
  const branch = String(value || "").trim().toLowerCase();
  if (["branch 1", "kuwait 1", "kuwait", "kuwait ho"].includes(branch)) return "kuwait ho";
  if (["branch 2", "dubai 2", "dubai"].includes(branch)) return "dubai";
  return branch;
}

function normalizeAirwayBillKey(value) {
  return String(value || "").trim().toLowerCase();
}

function bumpTrailingNumber(value) {
  const text = String(value || "");
  const matches = [...text.matchAll(/\d+/g)];
  if (!matches.length) return `${text}-1`;
  // Shipment formats can place month/service digits after the serial. Increment the longest run,
  // which is the configured AWB/job serial in formats such as AFS-00174/08/KWI/EXP.
  const target = matches.reduce((longest, current) => (current[0].length > longest[0].length ? current : longest), matches[0]);
  const start = target.index;
  const end = start + target[0].length;
  const next = String(Number(target[0]) + 1).padStart(target[0].length, "0");
  return text.slice(0, start) + next + text.slice(end);
}

function collisionError(airwayBillNo, branch) {
  const error = new Error(`Could not allocate a unique Airway Bill number after several retries. Please try again.`);
  error.status = 409;
  error.airwayBillNo = airwayBillNo;
  error.branch = branch;
  return error;
}

/**
 * Reserve a branch-scoped AWB value until the shipment insert finishes. This uses a session-level
 * PostgreSQL advisory lock on a dedicated connection, so two Cloud Run instances cannot both pass
 * the existence check for the same branch/AWB at once. Existing-AWB group creation is allowed only
 * when the request explicitly comes from the "New Shipment (from Airway Bill)" workflow and a
 * matching shipment already exists in that branch.
 */
async function reserveUniqueAirwayBill(client, {
  branch,
  airwayBillNo,
  jobNo,
  allowExistingGroup = false,
  maxAttempts = 12
} = {}) {
  const branchKey = normalizeBranchKey(branch);
  const originalAirwayBillNo = String(airwayBillNo || "").trim();
  const originalAirwayBillKey = normalizeAirwayBillKey(originalAirwayBillNo);
  const originalJobNo = String(jobNo || "").trim();
  const jobNoSharesAwbSequence = originalJobNo && normalizeAirwayBillKey(originalJobNo) === originalAirwayBillKey;
  if (!originalAirwayBillKey) {
    return {
      airwayBillNo: originalAirwayBillNo,
      jobNo: originalJobNo,
      changed: false,
      release: async () => {}
    };
  }

  const heldLockKeys = [];
  const heldLockSet = new Set();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    let firstError = null;
    for (const lockKey of heldLockKeys.slice().reverse()) {
      try {
        await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", [lockKey]);
      } catch (error) {
        firstError ||= error;
      }
    }
    if (firstError) throw firstError;
  };

  let candidate = originalAirwayBillNo;
  try {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidateKey = normalizeAirwayBillKey(candidate);
      const lockKey = `apollo:shipment-awb:${JSON.stringify([branchKey, candidateKey])}`;
      if (!heldLockSet.has(lockKey)) {
        await client.query("select pg_advisory_lock(hashtextextended($1, 0))", [lockKey]);
        heldLockKeys.push(lockKey);
        heldLockSet.add(lockKey);
      }
      // Airway-entry records also use this value as the globally unique job_no. Lock that
      // namespace after the branch-scoped AWB lock to avoid a cross-branch retry changing a
      // tied AWB after the branch collision check has already succeeded.
      if (jobNoSharesAwbSequence) {
        const jobLockKey = `apollo:shipment-job-no:${candidateKey}`;
        if (!heldLockSet.has(jobLockKey)) {
          await client.query("select pg_advisory_lock(hashtextextended($1, 0))", [jobLockKey]);
          heldLockKeys.push(jobLockKey);
          heldLockSet.add(jobLockKey);
        }
      }

      const existing = await client.query(
        `select
           exists (
             select 1 from shipments s
             where ${BRANCH_KEY_SQL} = $1
               and lower(trim(s.airway_bill_no)) = $2
           ) as awb_exists,
           exists (
             select 1 from shipments s
             where $3::boolean and s.job_no = $4
           ) as job_no_exists`,
        [branchKey, candidateKey, Boolean(jobNoSharesAwbSequence), candidate]
      );
      const awbExists = existing.rows[0]?.awb_exists === true;
      const jobNoExists = existing.rows[0]?.job_no_exists === true;

      if ((!awbExists && !jobNoExists) || (allowExistingGroup && awbExists && !jobNoExists)) {
        return {
          airwayBillNo: candidate,
          jobNo: jobNoSharesAwbSequence && candidateKey !== originalAirwayBillKey ? candidate : originalJobNo,
          changed: candidateKey !== originalAirwayBillKey,
          release
        };
      }

      const nextCandidate = bumpTrailingNumber(candidate);
      if (normalizeAirwayBillKey(nextCandidate) === candidateKey) break;
      candidate = nextCandidate;
    }
    throw collisionError(candidate, branchKey);
  } catch (error) {
    try { await release(); } catch {}
    throw error;
  }
}

module.exports = {
  normalizeBranchKey,
  normalizeAirwayBillKey,
  bumpTrailingNumber,
  reserveUniqueAirwayBill
};

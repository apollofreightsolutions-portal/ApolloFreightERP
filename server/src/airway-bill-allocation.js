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
  const error = new Error(`Airway Bill ${airwayBillNo} is already used in ${branch}. Enter a different AWB; no number was changed automatically.`);
  error.status = 409;
  error.airwayBillNo = airwayBillNo;
  error.branch = branch;
  return error;
}

/**
 * Reserve a branch-scoped AWB value until the shipment insert finishes. This uses a session-level
 * PostgreSQL advisory lock on a dedicated connection, so two Cloud Run instances cannot both pass
 * the existence check for the same branch/AWB at once. Existing numbers are never reused within a branch.
 */
async function reserveUniqueAirwayBill(client, {
  branch,
  airwayBillNo,
  jobNo
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

  try {
    const candidateKey = originalAirwayBillKey;
    const lockKey = `apollo:shipment-awb:${JSON.stringify([branchKey, candidateKey])}`;
    await client.query("select pg_advisory_lock(hashtextextended($1, 0))", [lockKey]);
    heldLockKeys.push(lockKey);
    // The AWB can be reused in another branch, but if it is tied to Job No the Job No namespace
    // is still globally unique. Reject that collision instead of changing the user's AWB.
    if (jobNoSharesAwbSequence) {
      const jobLockKey = `apollo:shipment-job-no:${candidateKey}`;
      await client.query("select pg_advisory_lock(hashtextextended($1, 0))", [jobLockKey]);
      heldLockKeys.push(jobLockKey);
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
      [branchKey, candidateKey, Boolean(jobNoSharesAwbSequence), originalJobNo]
    );
    const awbExists = existing.rows[0]?.awb_exists === true;
    const jobNoExists = existing.rows[0]?.job_no_exists === true;

    if (awbExists) throw collisionError(originalAirwayBillNo, branchKey);
    if (jobNoExists) {
      const error = new Error(`Job No ${originalJobNo} is already used. Enter a different Job No; the Airway Bill number was not changed.`);
      error.status = 409;
      error.jobNo = originalJobNo;
      error.airwayBillNo = originalAirwayBillNo;
      error.branch = branchKey;
      throw error;
    }

    return {
      airwayBillNo: originalAirwayBillNo,
      jobNo: originalJobNo,
      changed: false,
      release
    };
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

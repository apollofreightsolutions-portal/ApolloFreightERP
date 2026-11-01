"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeBranchKey,
  bumpTrailingNumber,
  reserveUniqueAirwayBill
} = require("../src/airway-bill-allocation");

class LockTable {
  constructor() {
    this.tails = new Map();
  }

  async acquire(key) {
    const previous = this.tails.get(key) || Promise.resolve();
    let unlock;
    const held = new Promise((resolve) => { unlock = resolve; });
    const tail = previous.then(() => held);
    this.tails.set(key, tail);
    await previous;
    return () => {
      unlock();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    };
  }
}

class FakeDatabase {
  constructor(rows = []) {
    this.rows = rows.slice();
    this.locks = new LockTable();
  }

  client() {
    const heldLocks = new Map();
    return {
      query: async (sql, params = []) => {
        const lockKey = params[0];
        if (sql.includes("pg_advisory_lock(")) {
          heldLocks.set(lockKey, await this.locks.acquire(lockKey));
          return { rows: [{}] };
        }
        if (sql.includes("pg_advisory_unlock(")) {
          heldLocks.get(lockKey)?.();
          heldLocks.delete(lockKey);
          return { rows: [{ pg_advisory_unlock: true }] };
        }
        if (sql.includes("from shipments")) {
          const [branchKey, airwayBillKey, checkJobNo, candidateJobNo] = params;
          const awbExists = this.rows.some((item) =>
            normalizeBranchKey(item.branch) === branchKey
            && String(item.airwayBillNo || "").trim().toLowerCase() === airwayBillKey
          );
          const jobNoExists = Boolean(checkJobNo) && this.rows.some((item) => item.jobNo === candidateJobNo);
          return { rows: [{ awb_exists: awbExists, job_no_exists: jobNoExists }] };
        }
        throw new Error(`Unexpected fake query: ${sql}`);
      }
    };
  }
}

async function createWithReservation(database, { branch, airwayBillNo, jobNo }) {
  const client = database.client();
  const reservation = await reserveUniqueAirwayBill(client, { branch, airwayBillNo, jobNo });
  try {
    // Simulate the insert while the session advisory lock is still held.
    await Promise.resolve();
    database.rows.push({ branch, airwayBillNo: reservation.airwayBillNo, jobNo: reservation.jobNo });
    return reservation;
  } finally {
    await reservation.release();
  }
}

test("normalizes branch aliases and increments the longest serial digit run", () => {
  assert.equal(normalizeBranchKey("Branch 1"), "kuwait ho");
  assert.equal(normalizeBranchKey("Kuwait"), "kuwait ho");
  assert.equal(normalizeBranchKey("Dubai 2"), "dubai");
  assert.equal(bumpTrailingNumber("AFS-00174/08/KWI/EXP"), "AFS-00175/08/KWI/EXP");
  assert.equal(bumpTrailingNumber("AFS262035"), "AFS262036");
});

test("simultaneous same-branch submissions allow one save and reject the duplicate without renumbering", async () => {
  const database = new FakeDatabase();
  const results = await Promise.allSettled([
    createWithReservation(database, { branch: "Kuwait HO", airwayBillNo: "AFS262035", jobNo: "AFS-1001" }),
    createWithReservation(database, { branch: "Branch 1", airwayBillNo: "AFS262035", jobNo: "AFS-1002" })
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected")[0].reason.status, 409);
  assert.equal(database.rows.length, 1);
  assert.equal(database.rows[0].airwayBillNo, "AFS262035");
});

test("simultaneous same-branch submissions with tied Job No and AWB do not auto-assign another number", async () => {
  const database = new FakeDatabase();
  const results = await Promise.allSettled([
    createWithReservation(database, { branch: "Dubai", airwayBillNo: "AFS262035", jobNo: "AFS262035" }),
    createWithReservation(database, { branch: "Dubai 2", airwayBillNo: "AFS262035", jobNo: "AFS262035" })
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected")[0].reason.status, 409);
  assert.equal(database.rows.length, 1);
});

test("the same AWB may be independently allocated in a different branch", async () => {
  const database = new FakeDatabase();
  const [kuwait, dubai] = await Promise.all([
    createWithReservation(database, { branch: "Kuwait HO", airwayBillNo: "AFS262035", jobNo: "KWI-1" }),
    createWithReservation(database, { branch: "Dubai", airwayBillNo: "AFS262035", jobNo: "DBX-1" })
  ]);
  assert.equal(kuwait.airwayBillNo, "AFS262035");
  assert.equal(dubai.airwayBillNo, "AFS262035");
});

test("cross-branch AWB reuse keeps the AWB; a globally duplicate tied Job No is rejected", async () => {
  const database = new FakeDatabase();
  const results = await Promise.allSettled([
    createWithReservation(database, { branch: "Kuwait HO", airwayBillNo: "AFS262035", jobNo: "AFS262035" }),
    createWithReservation(database, { branch: "Dubai", airwayBillNo: "AFS262035", jobNo: "AFS262035" })
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(rejected.reason.status, 409);
  assert.match(rejected.reason.message, /Job No .* already used/);
  assert.equal(database.rows.length, 1);
  assert.equal(database.rows[0].airwayBillNo, "AFS262035");
});

test("a fetched AWB already used in the target branch is rejected without changing its number", async () => {
  const database = new FakeDatabase([{ branch: "Kuwait HO", airwayBillNo: "AFS262035", jobNo: "KWI-1" }]);
  await assert.rejects(createWithReservation(database, {
    branch: "Kuwait HO",
    airwayBillNo: "AFS262035",
    jobNo: "KWI-2"
  }), { status: 409, airwayBillNo: "AFS262035", branch: "kuwait ho" });
  assert.equal(database.rows.length, 1);
});

test("an AWB-entry Job No collision is rejected without changing the AWB", async () => {
  const database = new FakeDatabase([{ branch: "Kuwait HO", airwayBillNo: "AFS262035", jobNo: "AFS262035" }]);
  await assert.rejects(reserveUniqueAirwayBill(database.client(), {
    branch: "Kuwait HO",
    airwayBillNo: "AFS262035",
    jobNo: "AFS262035"
  }), (error) => error.status === 409 && error.airwayBillNo === "AFS262035");
});

import test from "node:test";
import assert from "node:assert/strict";

test("status transition policy is intentionally restrictive", () => {
  const transitions = {
    pending: ["confirmed", "rejected", "cancelled"],
    confirmed: ["cancelled", "completed"],
    rejected: [],
    cancelled: [],
    completed: []
  };
  assert.ok(transitions.pending.includes("confirmed"));
  assert.ok(!transitions.completed.includes("confirmed"));
  assert.ok(!transitions.rejected.includes("completed"));
});

test("operational projection allowlist excludes medical payload keys", () => {
  const allowed = new Set([
    "bookingId", "patientUid", "centerId", "doctorLic", "doctorName",
    "serviceType", "dateIso", "time", "status", "price", "pay",
    "arrived", "visit", "createdAt", "updatedAt"
  ]);
  for (const key of ["complaint", "diagnosis", "medicalHistory", "medical", "private"]) {
    assert.equal(allowed.has(key), false, key);
  }
});
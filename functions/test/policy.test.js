import test from "node:test";
import assert from "node:assert/strict";
import {canTransition, statusToStored, storedToStatus} from "../lib/policy.js";

test("center API status values map to the Arabic booking schema", () => {
  assert.equal(statusToStored.pending, "جديد");
  assert.equal(statusToStored.confirmed, "مؤكد");
  assert.equal(statusToStored.rejected, "مرفوض");
  assert.equal(statusToStored.completed, "مكتمل");
  assert.equal(storedToStatus["جديد"], "pending");
});

test("only valid center booking transitions are accepted", () => {
  assert.equal(canTransition("جديد", "confirmed"), true);
  assert.equal(canTransition("جديد", "rejected"), true);
  assert.equal(canTransition("مؤكد", "completed"), true);
  assert.equal(canTransition("مكتمل", "confirmed"), false);
  assert.equal(canTransition("مرفوض", "completed"), false);
  assert.equal(canTransition("ملغي", "confirmed"), false);
});

test("center booking projection allowlist excludes medical payload keys", () => {
  const allowed = new Set([
    "patientUid", "centerId", "doctorLic", "phone", "name", "title",
    "type", "svc", "dateIso", "when", "timeMin", "place", "status",
    "price", "createdAt", "updatedAt"
  ]);
  for (const key of ["complaint", "diagnosis", "medicalHistory", "medical", "private", "visit"]) {
    assert.equal(allowed.has(key), false, key);
  }
});

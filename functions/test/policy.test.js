import test from "node:test";
import assert from "node:assert/strict";
import {canTransition, canSetPrice, canCenterCompleteBooking, centerBookingProjection, statusToStored, storedToStatus} from "../lib/policy.js";

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

test("center can set a price only while confirming a new booking", () => {
  assert.equal(canSetPrice("جديد", "confirmed"), true);
  assert.equal(canSetPrice("مؤكد", "confirmed"), false);
  assert.equal(canSetPrice("جديد", "rejected"), false);
});

test("center cannot complete doctor appointments", () => {
  assert.equal(canCenterCompleteBooking(0), false);
  assert.equal(canCenterCompleteBooking(1), true);
  assert.equal(canCenterCompleteBooking(2), true);
});

test("server booking projection includes operational fields only", () => {
  const row = centerBookingProjection("booking-1", {
    patientUid: "patient-uid",
    centerId: "center-1",
    doctorLic: "12345",
    name: "Patient",
    phone: "+249900000000",
    title: "كشف باطنية",
    type: 0,
    svc: 0,
    dateIso: "2026-11-23",
    when: "الاثنين · 6:00 م",
    timeMin: 1080,
    place: "الخرطوم",
    price: 25000,
    status: "جديد",
    complaint: "private complaint",
    diagnosis: "private diagnosis",
    medicalHistory: ["private"],
    visit: {state: 1},
    private: {notes: "secret"}
  });
  assert.equal(row.bookingId, "booking-1");
  assert.equal(row.patientName, "Patient");
  assert.equal(row.serviceType, "doctor");
  assert.equal(row.status, "pending");
  for (const key of ["complaint", "diagnosis", "medicalHistory", "visit", "private"]) {
    assert.equal(Object.hasOwn(row, key), false, key);
  }
});

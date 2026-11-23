import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {statusToStored, canTransition, canSetPrice, canCenterCompleteBooking, centerBookingProjection} from "./policy.js";

initializeApp();
const db = getFirestore();

type CenterRole = "center_manager" | "center_reception";
;

function requireIdentity(request: { auth?: { uid: string; token: Record<string, unknown> } }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "تسجيل الدخول مطلوب.");
  return request.auth;
}
async function requireCenterRole(auth: { uid: string; token: Record<string, unknown> }) {
  const role = auth.token.role;
  const centerId = auth.token.centerId;
  if ((role !== "center_manager" && role !== "center_reception") ||
      typeof centerId !== "string" || !centerId.trim()) {
    throw new HttpsError("permission-denied", "حساب المركز غير معتمد.");
  }
  const member = await db.doc(`centerMembers/${auth.uid}`).get();
  if (!member.exists || member.get("active") !== true ||
      member.get("centerId") !== centerId || member.get("role") !== role) {
    throw new HttpsError("permission-denied", "عضوية المركز غير نشطة أو غير متطابقة.");
  }
  return { role: role as CenterRole, centerId };
}
async function requireManager(auth: { uid: string; token: Record<string, unknown> }) {
  const membership = await requireCenterRole(auth);
  if (membership.role !== "center_manager") {
    throw new HttpsError("permission-denied", "هذه العملية متاحة لمدير المركز فقط.");
  }
  return membership;
}

/** Trusted operator only: grant claims after independently verifying the center and member. */
export const setCenterMemberRole = onCall(async (request) => {
  const auth = requireIdentity(request);
  if (auth.token.platformAdmin !== true) {
    throw new HttpsError("permission-denied", "Platform administrator only.");
  }
  const { uid, centerId, role } = request.data ?? {};
  if (typeof uid !== "string" || !uid.trim() ||
      typeof centerId !== "string" || !centerId.trim() ||
      (role !== "center_manager" && role !== "center_reception")) {
    throw new HttpsError("invalid-argument", "uid, centerId and a valid role are required.");
  }
  const center = await db.doc(`centers/${centerId}`).get();
  if (!center.exists || center.get("status") !== 1) {
    throw new HttpsError("failed-precondition", "Center is not approved.");
  }
  const user = await getAuth().getUser(uid);
  await getAuth().setCustomUserClaims(uid, {
    ...(user.customClaims ?? {}),
    role,
    centerId
  });
  await db.doc(`centerMembers/${uid}`).set({
    uid, centerId, role, active: true, updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { success: true };
});

/** Manager can manage only members belonging to their own center. */
export const setCenterMemberActive = onCall(async (request) => {
  const auth = requireIdentity(request);
  const manager = await requireManager(auth);
  const { uid, active } = request.data ?? {};
  if (typeof uid !== "string" || typeof active !== "boolean" || uid === auth.uid) {
    throw new HttpsError("invalid-argument", "A different member uid and boolean active are required.");
  }
  const memberRef = db.doc(`centerMembers/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(memberRef);
    if (!snap.exists || snap.get("centerId") !== manager.centerId) {
      throw new HttpsError("not-found", "Member not found in this center.");
    }
    tx.update(memberRef, { active, updatedAt: FieldValue.serverTimestamp() });
  });
  if (!active) {
    const member = await getAuth().getUser(uid);
    const claims = { ...(member.customClaims ?? {}) };
    if (claims.centerId === manager.centerId) {
      delete claims.role;
      delete claims.centerId;
      await getAuth().setCustomUserClaims(uid, claims);
    }
  }
  return { success: true };
});

/** Returns an allowlisted operational projection only; never returns private/medical subcollections. */
export const listCenterBookings = onCall(async (request) => {
  const auth = requireIdentity(request);
  const { centerId } = await requireCenterRole(auth);
  const snap = await db.collection("bookings")
    .where("centerId", "==", centerId)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();
  return { bookings: snap.docs.map((doc) => centerBookingProjection(doc.id, doc.data())) };
});

/** Role-scoped, transactional status update with a strict field allowlist. */
export const updateCenterBooking = onCall(async (request) => {
  const auth = requireIdentity(request);
  const membership = await requireCenterRole(auth);
  const { bookingId, status, price } = request.data ?? {};
  if (typeof bookingId !== "string" || !bookingId.trim() ||
      typeof status !== "string" || !Object.prototype.hasOwnProperty.call(statusToStored, status) ||
      (price !== undefined && (!Number.isSafeInteger(price) || price < 0 || price > 100000000))) {
    throw new HttpsError("invalid-argument", "bookingId, valid status and optional integer price are required.");
  }
  const ref = db.doc(`bookings/${bookingId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("centerId") !== membership.centerId) {
      throw new HttpsError("not-found", "Booking not found.");
    }
    const current = String(snap.get("status") ?? "");
    const target = statusToStored[status];
    if (!canTransition(current, status)) {
      throw new HttpsError("failed-precondition", "Invalid booking status transition.");
    }
    if (status === "completed" && !canCenterCompleteBooking(snap.get("type"))) {
      throw new HttpsError("failed-precondition", "Doctor appointments can only be completed by the assigned doctor after the in-person encounter.");
    }
    if (price !== undefined && !canSetPrice(current, status)) {
      throw new HttpsError("failed-precondition", "Price can only be set while confirming a new booking.");
    }
    if (status === "confirmed" && price === undefined && Number(snap.get("price") ?? 0) <= 0) {
      throw new HttpsError("failed-precondition", "Set the center-approved price before confirming the booking.");
    }
    const patch: Record<string, unknown> = { status: target, updatedAt: FieldValue.serverTimestamp() };
    if (price !== undefined) patch.price = price;
    tx.update(ref, patch);
  });
  return { success: true };
});

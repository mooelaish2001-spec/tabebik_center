import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();
const db = getFirestore();

type CenterRole = "center_manager" | "center_reception";
const allowedStatuses = new Set(["pending", "confirmed", "rejected", "cancelled", "completed"]);
const transitions: Record<string, Set<string>> = {
  pending: new Set(["confirmed", "rejected", "cancelled"]),
  confirmed: new Set(["cancelled", "completed"]),
  rejected: new Set(),
  cancelled: new Set(),
  completed: new Set()
};
const operationalKeys = [
  "bookingId", "patientUid", "centerId", "doctorLic", "doctorName",
  "serviceType", "dateIso", "time", "status", "price", "pay",
  "arrived", "createdAt", "updatedAt"
] as const;

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
function cleanOperationalBooking(id: string, data: FirebaseFirestore.DocumentData) {
  const result: Record<string, unknown> = { bookingId: id };
  for (const key of operationalKeys) {
    if (key !== "bookingId" && data[key] !== undefined) result[key] = data[key];
  }
  return result;
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
  return { bookings: snap.docs.map((doc) => cleanOperationalBooking(doc.id, doc.data())) };
});

/** Role-scoped, transactional status update with a strict field allowlist. */
export const updateCenterBooking = onCall(async (request) => {
  const auth = requireIdentity(request);
  const membership = await requireCenterRole(auth);
  const { bookingId, status } = request.data ?? {};
  if (typeof bookingId !== "string" || !bookingId.trim() ||
      typeof status !== "string" || !allowedStatuses.has(status)) {
    throw new HttpsError("invalid-argument", "bookingId and a valid status are required.");
  }
  const ref = db.doc(`bookings/${bookingId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("centerId") !== membership.centerId) {
      throw new HttpsError("not-found", "Booking not found.");
    }
    const current = snap.get("status");
    if (!transitions[current]?.has(status)) {
      throw new HttpsError("failed-precondition", "Invalid booking status transition.");
    }
    tx.update(ref, { status, updatedAt: FieldValue.serverTimestamp() });
  });
  return { success: true };
});

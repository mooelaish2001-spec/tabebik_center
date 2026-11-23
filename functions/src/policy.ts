export const statusToStored: Record<string, string> = {
  pending: "جديد",
  confirmed: "مؤكد",
  rejected: "مرفوض",
  cancelled: "ملغي",
  completed: "مكتمل"
};

export const storedToStatus: Record<string, string> = Object.fromEntries(
  Object.entries(statusToStored).map(([api, stored]) => [stored, api])
);

export const transitions: Record<string, Set<string>> = {
  "جديد": new Set(["مؤكد", "مرفوض", "ملغي"]),
  "مؤكد": new Set(["ملغي", "مكتمل"]),
  "مرفوض": new Set(),
  "ملغي": new Set(),
  "مكتمل": new Set()
};

export function canTransition(current: string, targetApiStatus: string): boolean {
  const target = statusToStored[targetApiStatus];
  return Boolean(target && transitions[current]?.has(target));
}

export function canSetPrice(current: string, targetApiStatus: string): boolean {
  return current === "جديد" && targetApiStatus === "confirmed";
}

export function canCenterCompleteBooking(type: unknown): boolean {
  return Number(type) !== 0;
}

const operationalBookingKeys = [
  "patientUid", "centerId", "doctorLic", "phone", "name", "title",
  "type", "svc", "dateIso", "when", "timeMin", "place", "status",
  "price", "createdAt", "updatedAt"
] as const;

export function centerBookingProjection(id: string, data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {bookingId: id};
  for (const key of operationalBookingKeys) {
    if (data[key] !== undefined) result[key] = data[key];
  }
  result.patientName = typeof data.name === "string" ? data.name : "";
  result.serviceType = Number(data.type) === 1
    ? "bed"
    : Number(data.type) === 2
      ? (Number(data.svc) === 2 ? "lab" : "home")
      : "doctor";
  result.status = storedToStatus[String(data.status ?? "")] ?? String(data.status ?? "");
  return result;
}

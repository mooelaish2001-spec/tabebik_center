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

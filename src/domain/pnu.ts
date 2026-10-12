export interface ParsedPnu {
  provinceCode: string;
  cityCountyCode: string;
  legalDongCode: string;
  landType: "land" | "forest";
  mainNumber: number;
  subNumber: number;
}

export function normalizePnu(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidPnu(value: string): boolean {
  const pnu = normalizePnu(value);
  if (!/^\d{19}$/.test(pnu)) return false;
  if (!/[12]/.test(pnu.charAt(10))) return false;
  const mainNumber = Number(pnu.slice(11, 15));
  const subNumber = Number(pnu.slice(15, 19));
  return mainNumber > 0 && subNumber >= 0;
}

export function parsePnu(value: string): ParsedPnu | null {
  const pnu = normalizePnu(value);
  if (!isValidPnu(pnu)) return null;
  return {
    provinceCode: pnu.slice(0, 2),
    cityCountyCode: pnu.slice(0, 5),
    legalDongCode: pnu.slice(0, 10),
    landType: pnu.charAt(10) === "2" ? "forest" : "land",
    mainNumber: Number(pnu.slice(11, 15)),
    subNumber: Number(pnu.slice(15, 19)),
  };
}

export function deduplicateParcels<T extends { pnu: string; id: string }>(parcels: T[]): T[] {
  const seen = new Set<string>();
  return parcels.filter((parcel) => {
    const key = normalizePnu(parcel.pnu) || parcel.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function jurisdictionCodeFromPnu(pnu: string): string {
  const normalized = normalizePnu(pnu);
  return normalized.length === 19 ? normalized.slice(0, 5) : "";
}

export function digitsOnly(value: string, maxLength?: number): string {
  const digits = value.replace(/\D/g, "");
  return maxLength === undefined ? digits : digits.slice(0, maxLength);
}

export function formatPnuInput(value: string): string {
  return digitsOnly(value, 19);
}

export function formatPhoneInput(value: string): string {
  const raw = digitsOnly(value);

  if (raw.startsWith("02")) {
    const digits = raw.slice(0, 10);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  if (/^050\d/.test(raw)) {
    const digits = raw.slice(0, 12);
    if (digits.length <= 4) return digits;
    if (digits.length <= 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  if (/^(15|16|18)/.test(raw)) {
    const digits = raw.slice(0, 8);
    return digits.length <= 4 ? digits : `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  const digits = raw.slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function formatRegistrationNumberInput(value: string): string {
  const digits = digitsOnly(value, 13);
  return digits.length <= 6 ? digits : `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

export function formatBusinessNumberInput(value: string): string {
  const digits = digitsOnly(value, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function formatNumericInput(value: string, maxFractionDigits = 3): string {
  const cleaned = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!cleaned) return "";

  const dotIndex = cleaned.indexOf(".");
  const hasDot = dotIndex >= 0;
  const integerDigits = (hasDot ? cleaned.slice(0, dotIndex) : cleaned).replace(/^0+(?=\d)/, "") || "0";
  const fractionDigits = hasDot
    ? cleaned.slice(dotIndex + 1).replace(/\./g, "").slice(0, maxFractionDigits)
    : "";
  const grouped = integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return hasDot ? `${grouped}.${fractionDigits}` : grouped;
}

export function formatNumberForInput(value: number | undefined, maxFractionDigits = 3): string {
  if (value === undefined || !Number.isFinite(value)) return "";
  return value.toLocaleString("ko-KR", {
    useGrouping: true,
    maximumFractionDigits: maxFractionDigits,
  });
}

export function parseFormattedNumber(value: string): number | undefined {
  const normalized = value.replace(/,/g, "");
  if (!normalized || normalized === ".") return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function formatDocumentFieldInput(fieldId: string, kind: string, value: string): string {
  if (kind === "number") return formatNumericInput(value);
  if (/phone/i.test(fieldId)) return formatPhoneInput(value);
  if (/registrationNumber/i.test(fieldId)) return formatRegistrationNumberInput(value);
  return value;
}

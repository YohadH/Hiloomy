export function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object" && "toNumber" in (value as Record<string, unknown>)) {
    return Number((value as { toNumber: () => number }).toNumber());
  }

  return Number(value);
}

export function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

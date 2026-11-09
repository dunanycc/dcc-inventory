const ZERO = BigInt(0);
const MICROS = BigInt(1_000_000);

export function decimalToMicros(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) throw new Error("INVALID_MOVEMENT_SUM");
  const magnitude =
    BigInt(match[2]) * MICROS + BigInt((match[3] ?? "").padEnd(6, "0"));
  return match[1] === "-" ? -magnitude : magnitude;
}

export function microsToDecimal(value: bigint) {
  const negative = value < ZERO;
  const absolute = negative ? -value : value;
  const whole = absolute / MICROS;
  const fraction = String(absolute % MICROS)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

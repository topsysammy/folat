/** ₦3,500 — whole naira, no decimals. */
export function naira(amount: number): string {
  const n = Math.round(amount);
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "-" : ""}₦${s}`;
}

/** 2348012345678 → 08012345678 (how Nigerians read numbers). */
export function localPhone(phone: string): string {
  return phone.startsWith("234") ? `0${phone.slice(3)}` : phone;
}

/** Brazilian phone typed by the user (with or without +55, DDD, punctuation) → E.164 "+55DDXXXXXXXXX", or null. */
export const toE164BR = (input: string): string | null => {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, ''); // "011 9..." trunk prefix
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  // DDD (2 digits, 11-99) + 8 (landline) or 9 (mobile, starting with 9) digits
  if (!/^[1-9][1-9]\d{8,9}$/.test(digits)) return null;
  if (digits.length === 11 && digits[2] !== '9') return null;
  return `+55${digits}`;
};

/** Like toE164BR, but only mobile numbers (11 digits, 9 after the DDD): SMS codes never reach a landline. */
export const toE164MobileBR = (input: string): string | null => {
  const phone = toE164BR(input);
  return phone && phone.length === 14 ? phone : null;
};

/** "+5511987654321" → "(11) 98765-4321", for display. */
export const formatPhoneBR = (value: string | null | undefined): string => {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
};

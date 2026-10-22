// Tiny input validators (no libraries). Each check returns the parsed value or
// a list of pt-BR messages keyed by field.

import { isIsoDate } from './dates.ts';

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export type Check<T> = (value: unknown, field: string) => Result<T>;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (message: string): Result<never> => ({ ok: false, errors: [message] });

export function string(opts: { min?: number; max?: number; trim?: boolean } = {}): Check<string> {
  const { min = 1, max = 500, trim = true } = opts;
  return (value, field) => {
    if (typeof value !== 'string') return fail(`${field}: texto obrigatório`);
    const text = trim ? value.trim() : value;
    if (text.length < min) return fail(`${field}: mínimo de ${min} caracteres`);
    if (text.length > max) return fail(`${field}: máximo de ${max} caracteres`);
    return ok(text);
  };
}

export function int(opts: { min?: number; max?: number } = {}): Check<number> {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = opts;
  return (value, field) => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) return fail(`${field}: número inteiro obrigatório`);
    if (value < min || value > max) return fail(`${field}: fora do intervalo permitido`);
    return ok(value);
  };
}

export function boolean(): Check<boolean> {
  return (value, field) => (typeof value === 'boolean' ? ok(value) : fail(`${field}: verdadeiro ou falso`));
}

export function oneOf<const T extends readonly string[]>(values: T): Check<T[number]> {
  return (value, field) =>
    typeof value === 'string' && (values as readonly string[]).includes(value)
      ? ok(value as T[number])
      : fail(`${field}: valor inválido`);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(): Check<string> {
  return (value, field) =>
    typeof value === 'string' && UUID.test(value) ? ok(value.toLowerCase()) : fail(`${field}: identificador inválido`);
}

export function isoDate(): Check<string> {
  return (value, field) =>
    typeof value === 'string' && isIsoDate(value) ? ok(value) : fail(`${field}: data no formato AAAA-MM-DD`);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function email(): Check<string> {
  return (value, field) =>
    typeof value === 'string' && value.length <= 254 && EMAIL.test(value.trim())
      ? ok(value.trim().toLowerCase())
      : fail(`${field}: e-mail inválido`);
}

export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

/** Brazilian phone: 10-11 digits (DDD + number), optional 55 prefix. Returns digits with 55. */
export function phoneBR(): Check<string> {
  return (value, field) => {
    if (typeof value !== 'string') return fail(`${field}: telefone obrigatório`);
    const digits = normalizePhoneBR(value);
    return digits ? ok(digits) : fail(`${field}: telefone com DDD inválido`);
  };
}

export function normalizePhoneBR(value: string): string | null {
  let digits = onlyDigits(value);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return null;
  if (digits[0] === '0') return null;
  return `55${digits}`;
}

export function postalCode(): Check<string> {
  return (value, field) => {
    const digits = typeof value === 'string' ? onlyDigits(value) : '';
    return digits.length === 8 ? ok(digits) : fail(`${field}: CEP com 8 dígitos`);
  };
}

function cpfValid(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

function cnpjValid(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const digit = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digit(12) === Number(d[12]) && digit(13) === Number(d[13]);
}

/** CPF (11) or CNPJ (14) with check digits; returns digits only. */
export function cpfCnpj(): Check<string> {
  return (value, field) => {
    const digits = typeof value === 'string' ? onlyDigits(value) : '';
    if (digits.length === 11 && cpfValid(digits)) return ok(digits);
    if (digits.length === 14 && cnpjValid(digits)) return ok(digits);
    return fail(`${field}: CPF ou CNPJ inválido`);
  };
}

export function optional<T>(check: Check<T>): Check<T | undefined> {
  return (value, field) => (value === undefined || value === null || value === '' ? ok(undefined) : check(value, field));
}

type Shape = Record<string, Check<unknown>>;
type Infer<S extends Shape> = { [K in keyof S]: S[K] extends Check<infer T> ? T : never };

export function object<S extends Shape>(shape: S): Check<Infer<S>> {
  return (value, field) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(`${field}: objeto JSON obrigatório`);
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const [key, check] of Object.entries(shape)) {
      const result = check(input[key], field === 'body' ? key : `${field}.${key}`);
      if (result.ok) {
        if (result.value !== undefined) out[key] = result.value;
      } else {
        errors.push(...result.errors);
      }
    }
    return errors.length ? { ok: false, errors } : ok(out as Infer<S>);
  };
}

export function parse<T>(check: Check<T>, value: unknown): Result<T> {
  return check(value, 'body');
}

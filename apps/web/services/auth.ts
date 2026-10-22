import { AppError, toAppError } from '../lib/errors';
import { toE164BR, toE164MobileBR } from '../lib/phone';
import { features } from '../config/features';
import { db } from './client';

/** Where the one-time code goes: an e-mail address or a Brazilian mobile number. */
export type OtpTarget = { kind: 'email'; email: string } | { kind: 'phone'; phone: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates and normalizes the target (trimmed lower-case e-mail, E.164 mobile number). */
export const normalizeTarget = (target: OtpTarget): OtpTarget => {
  if (target.kind === 'email') {
    const email = target.email.trim().toLowerCase();
    if (!EMAIL.test(email)) throw new AppError('invalid_email');
    return { kind: 'email', email };
  }
  const phone = toE164MobileBR(target.phone);
  if (!phone && toE164BR(target.phone)) {
    throw new AppError('invalid_phone', { message: 'Use um número de celular com DDD: o código vai por SMS e não chega a telefone fixo.' });
  }
  if (!phone) throw new AppError('invalid_phone');
  return { kind: 'phone', phone };
};

/** Sends a 6-digit code. Creates the account on first use (the profile is created by the database). */
export const sendOtp = async (target: OtpTarget): Promise<void> => {
  const t = normalizeTarget(target);
  const redirect = features.siteUrl ? `${features.siteUrl}/conta` : undefined;
  const { error } =
    t.kind === 'email'
      ? await db().auth.signInWithOtp({ email: t.email, options: { shouldCreateUser: true, emailRedirectTo: redirect } })
      : await db().auth.signInWithOtp({ phone: t.phone, options: { shouldCreateUser: true, channel: 'sms' } });
  if (error) throw toAppError(error);
};

/** Checks the code and opens the session; returns the user id. */
export const verifyOtp = async (target: OtpTarget, code: string): Promise<string | null> => {
  const t = normalizeTarget(target);
  const token = code.replace(/\D/g, '');
  if (token.length !== 6) throw new AppError('otp_invalid');
  const { data, error } =
    t.kind === 'email'
      ? await db().auth.verifyOtp({ email: t.email, token, type: 'email' })
      : await db().auth.verifyOtp({ phone: t.phone, token, type: 'sms' });
  if (error) throw toAppError(error);
  return data.user?.id ?? data.session?.user.id ?? null;
};

export const signOut = async (): Promise<void> => {
  const { error } = await db().auth.signOut();
  if (error) throw toAppError(error);
};

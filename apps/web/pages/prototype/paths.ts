/**
 * Routes that exist as prototype screens with fictitious data (the demo mode).
 * With a backend each one redirects to the real equivalent, is replaced by a real
 * page or says it is a future feature (see routes.tsx); nothing in the app may
 * link to them in that mode.
 */
export const PROTOTYPE_PATHS = [
  '/search',
  '/dashboard',
  '/verification',
  '/register-provider',
  '/health',
  '/doctor',
  '/profile',
  '/teleconsultation',
  '/medical-records',
] as const;

/** True for a prototype route or anything below it (/doctor/doc-1, /profile/me). */
export const isPrototypePath = (path: string): boolean => {
  const pathname = path.split(/[?#]/)[0];
  return PROTOTYPE_PATHS.some(prototype => pathname === prototype || pathname.startsWith(`${prototype}/`));
};

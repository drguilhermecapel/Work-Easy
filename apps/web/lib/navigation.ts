/** Only same-app paths are accepted as a return address (no "//host" or "https://"). */
export const safeNext = (value: string | null | undefined, fallback = '/conta'): string =>
  value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : fallback;

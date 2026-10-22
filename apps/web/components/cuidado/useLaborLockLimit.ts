import { DEFAULT_SETTINGS, loadPublicSettings } from '../../config/features';
import { useAsync } from '../../lib/useAsync';

/** Weekly limit of the labor lock, from platform_settings (the default while it loads). */
export const useLaborLockLimit = (): number => {
  const settings = useAsync(() => loadPublicSettings(), 'settings');
  return settings.data?.laborLockDaysPerWeek ?? DEFAULT_SETTINGS.laborLockDaysPerWeek;
};

import type { LucideIcon } from 'lucide-react';
import {
  Briefcase,
  Home,
  Stethoscope,
} from 'lucide-react';

// Generated with the catalog: only the icons the areas use, so the bundle
// does not pull the whole icon set.
export const AREA_ICONS: Record<string, LucideIcon> = {
  Briefcase,
  Home,
  Stethoscope,
};

export const FALLBACK_ICON: LucideIcon = Briefcase;

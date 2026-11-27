import { rideLive } from '../_runtime/ride-live.ts';
import { serve } from '../_runtime/supabase.ts';
import { rideWebhook } from '../_shared/ride-psp.ts';
import { liveContract } from '../_shared/ride-live-psp.ts';
serve(req => rideWebhook(req, rideLive, liveContract));

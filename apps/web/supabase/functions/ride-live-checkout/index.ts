import { rideLive } from '../_runtime/ride-live.ts';
import { serve } from '../_runtime/supabase.ts';
import { rideCheckout } from '../_shared/ride-psp.ts';
import { liveContract } from '../_shared/ride-live-psp.ts';
serve(req => rideCheckout(req, rideLive, liveContract));

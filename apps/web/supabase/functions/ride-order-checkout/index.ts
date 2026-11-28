import { serve } from '../_runtime/supabase.ts';
import { rideCheckout } from '../_shared/ride-psp.ts';
import { orderContract, orderDeps } from '../_runtime/ride-order.ts';
serve((req) => rideCheckout(req, orderDeps, orderContract));

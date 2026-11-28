import { serve } from '../_runtime/supabase.ts';
import { rideWebhook } from '../_shared/ride-psp.ts';
import { orderContract, orderDeps } from '../_runtime/ride-order.ts';
serve((req) => rideWebhook(req, orderDeps, orderContract));

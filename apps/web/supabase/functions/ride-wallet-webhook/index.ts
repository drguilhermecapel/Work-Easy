import { serve } from '../_runtime/supabase.ts';
import { walletDeps } from '../_runtime/ride-wallet.ts';
import { walletWebhook } from '../_shared/ride-order-adjustments.ts';
serve(req=>walletWebhook(req,walletDeps));

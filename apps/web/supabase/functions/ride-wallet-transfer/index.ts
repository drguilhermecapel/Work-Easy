import { serve } from '../_runtime/supabase.ts';
import { walletDeps } from '../_runtime/ride-wallet.ts';
import { walletTransfer } from '../_shared/ride-order-adjustments.ts';
serve((req) => walletTransfer(req, walletDeps));

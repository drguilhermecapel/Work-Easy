import { rideSandbox } from '../_runtime/ride-sandbox.ts';
import { serve } from '../_runtime/supabase.ts';
import { webhookHandler } from '../ride-sandbox-checkout/handler.ts';

serve(req => webhookHandler(req, rideSandbox));

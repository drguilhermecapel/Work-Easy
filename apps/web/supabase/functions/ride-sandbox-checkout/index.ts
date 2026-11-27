import { rideSandbox } from '../_runtime/ride-sandbox.ts';
import { serve } from '../_runtime/supabase.ts';
import { checkoutHandler } from './handler.ts';

serve(req => checkoutHandler(req, rideSandbox));

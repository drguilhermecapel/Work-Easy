import { rideCheckout, rideWebhook, sandboxContract, type RidePspDeps } from '../_shared/ride-psp.ts';
export type { Intent, Observation, RidePspDeps as SandboxDeps } from '../_shared/ride-psp.ts';

export const checkoutHandler = (req: Request, deps: RidePspDeps) => rideCheckout(req, deps, sandboxContract);
export const webhookHandler = (req: Request, deps: RidePspDeps) => rideWebhook(req, deps, sandboxContract);

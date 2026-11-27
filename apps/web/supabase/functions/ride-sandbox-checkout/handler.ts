import { rideCheckout, rideWebhook, sandboxContract, type SandboxDeps } from '../_shared/ride-psp.ts';
export type { Intent, Observation, SandboxDeps } from '../_shared/ride-psp.ts';

export const checkoutHandler = (req: Request, deps: SandboxDeps) => rideCheckout(req, deps, sandboxContract);
export const webhookHandler = (req: Request, deps: SandboxDeps) => rideWebhook(req, deps, sandboxContract);

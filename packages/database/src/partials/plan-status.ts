import { z } from "zod"

/**
 * Canonical `UserQuota.planStatus` — a small **app-facing state machine**, not a
 * mirror of Stripe's billing vocabulary. Cloud sign-up stamps the initial
 * `trial` row in OSS, then the private billing portal (`publishEntitlements`)
 * remains authoritative and reconciles/overwrites it. The access gate
 * (`userQuotaService.getAccessStateFromQuota`) and the builder's plan-status
 * banner read it here. The column is plain `text()` (the portal owns it
 * cross-repo), but every reader MUST key off these constants, never an inline
 * literal, so the two sides can never drift (a mismatch silently disables the
 * banner or the access gate).
 *
 * Four values; Stripe's ~8 subscription statuses collapse into them:
 *  - `active`   : entitled & good standing — paid `active`/`trialing`, the free
 *                 default plan, grandfathered users, confirmed manual subs.
 *  - `trial`    : self-managed new-user trial (no Stripe trial); window in `periodEnd`.
 *  - `past_due` : entitled but the Stripe charge failed / is in dunning. Allowed —
 *                 the banner nudges the user to update payment.
 *  - `expired`  : trial consumed / churned (Stripe `canceled`/`unpaid`/`paused` for
 *                 a trial-eligible user). Blocked → `/trial-expired`.
 *
 * Access: only `expired` and an expired `trial` block; `active`/`past_due` allow.
 * There is no `free` value — the writer folds the free/grandfathered case into
 * `active` (plan identity lives in `planName`). `incomplete*` Stripe statuses are
 * ignored upstream so an abandoned checkout never burns the self-managed trial.
 */
export const planStatuses = z.enum(["active", "trial", "expired", "past_due"])
export type PlanStatus = z.infer<typeof planStatuses>

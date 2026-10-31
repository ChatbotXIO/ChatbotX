import { TEMPLATE_UNINSTALL_LEASE_SECONDS } from "@chatbotx.io/database/partials"

/**
 * Timing shared by the sync claim and the sweep that re-dispatches syncs: both
 * must agree on when a claim is dead and when a row is given up on.
 */

/** A claim not renewed within this window belongs to a dead worker (matches installs). */
export const SYNC_LEASE_MS = 15 * 60 * 1000
/** A `pending` sync younger than this may still be on its way to the queue. */
export const SYNC_UNCLAIMED_GRACE_MS = 5 * 60 * 1000
/** The sweep stops retrying a sync this old (same bound as installs). */
export const SYNC_REDISPATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Every lease window in one place. A claim not renewed within its window
 * belongs to a dead worker and may be taken over.
 */
/** An install claim. */
export const INSTALL_LEASE_MS = 15 * 60 * 1000
/** A staged-object cleanup that did not release its lease is retried after this. */
export const STAGED_CLEANUP_LEASE_MS = 10 * 60 * 1000
/**
 * An uninstall claim, renewed by every batch. The uninstall lease is judged on
 * the database clock (`now()` both when `uninstallClaimedAt` is written and
 * when it is compared), unlike installs and syncs which compare an app-clock
 * `leaseExpiredBefore`; the two never mix on one column.
 */
export const UNINSTALL_LEASE_MS = TEMPLATE_UNINSTALL_LEASE_SECONDS * 1000
/** An uninstall nobody finished within this long is closed `failed` (as installs and syncs are). */
export const UNINSTALL_ABANDON_AFTER_MS = 24 * 60 * 60 * 1000

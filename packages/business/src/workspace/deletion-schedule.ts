import { PURGE_WORKSPACES_INTERVAL_MINUTES } from "@chatbotx.io/worker-config"

/** Grace period between scheduling a deletion and the workspace being purged. */
export const WORKSPACE_DELETION_GRACE_MS = 24 * 60 * 60 * 1000

const PURGE_INTERVAL_MS = PURGE_WORKSPACES_INTERVAL_MINUTES * 60 * 1000

/**
 * Round a timestamp up to the next `purgeWorkspaces` cron boundary so the value
 * we persist is the moment the cron will actually delete the workspace. The UI
 * renders `scheduledDeletionAt` verbatim, so an unaligned value would promise a
 * time the purge cannot honor (the deletion only runs on the next cron tick).
 *
 * Epoch-multiple alignment matches the cron's :00/:30 firing on UTC and
 * whole/half-hour-offset servers, which covers all realistic deployments.
 */
export function ceilToPurgeBoundary(date: Date): Date {
  return new Date(
    Math.ceil(date.getTime() / PURGE_INTERVAL_MS) * PURGE_INTERVAL_MS,
  )
}

/**
 * Timestamp to persist when a workspace deletion is scheduled: now + 24h grace,
 * rounded up so it lands exactly on the purge cron boundary. Grace stays ~24h
 * (24h–24h30m) so customers get a predictable one-day window; the banner renders
 * this value verbatim, so the countdown stays honest.
 */
export function nextScheduledDeletionAt(now: Date = new Date()): Date {
  return ceilToPurgeBoundary(
    new Date(now.getTime() + WORKSPACE_DELETION_GRACE_MS),
  )
}

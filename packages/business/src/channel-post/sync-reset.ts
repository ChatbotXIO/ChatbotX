import type { DatabaseClient } from "@chatbotx.io/database/client"
import { channelPostSyncRepository } from "@chatbotx.io/database/repositories"

/**
 * The inbox's authorisation changed (reconnect): a failed post-sync row, or one
 * parked as not connected, becomes due again with its error, attempts and lease
 * cleared. Pass the caller's transaction so it commits with the auth write.
 *
 * Kept apart from `sync.service.ts`, which pulls in the comment and message
 * services: the connection state service imports this file, and importing the
 * service from there would close import cycles.
 */
export const resetChannelPostSyncAfterAuthChange = async (
  input: { inboxId: string; workspaceId: string },
  tx?: DatabaseClient,
): Promise<boolean> =>
  await channelPostSyncRepository.resetAfterAuthChange(
    { ...input, now: new Date() },
    tx,
  )

/**
 * The inbox came back without new credentials (tenant resume): only a row
 * parked as not connected becomes due again; failed auth rows stay with the
 * scanner's integration-changed guard.
 */
export const releaseParkedChannelPostSync = async (
  input: { inboxId: string; workspaceId: string },
  tx?: DatabaseClient,
): Promise<boolean> =>
  await channelPostSyncRepository.releaseParkedForInbox(
    { ...input, now: new Date() },
    tx,
  )

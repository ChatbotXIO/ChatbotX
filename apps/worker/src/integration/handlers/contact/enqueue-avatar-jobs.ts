import type { ChannelContactImportLink } from "@chatbotx.io/business"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"

/**
 * Bulk-enqueue one best-effort `updateContactAvatar` job per resolved
 * contact. Extracted (Phase 4a of the Automatic Customer Scan plan,
 * `docs/plans/2026-09-09-automatic-contact-scan.md`) from
 * `coexist/messenger-sync.ts`'s inline avatar-enqueue block so both coexist
 * historical sync and the Automatic Customer Scan engine share it — neither
 * `bulkImportChannelContacts` result carries `profile_pic`, so a mirror job
 * per newly-linked contact is the only way to backfill it. Idempotent: the
 * jobId is keyed by `contactInboxId`, and `updateContactAvatar` itself skips
 * when the contact already has an avatar. Best-effort — an `addBulk` failure
 * is logged and swallowed so the caller's run is never failed over avatars.
 *
 * Deliberately kept in its own file rather than alongside `updateContactAvatar`
 * in `./update-avatar.ts`: that file also imports `../../../services/integrations`
 * (the full channel-integration registry) for the avatar *fetch* job handler,
 * which is unrelated to this bulk-*enqueue* helper and would otherwise be
 * pulled into every caller's module graph — including the coexist
 * `messenger-sync.ts`/`instagram-sync.ts` unit tests, which mock
 * `@chatbotx.io/business` down to a handful of exports and would break if a
 * real `services/integrations` import chain (and its real database/query
 * transitive imports) loaded alongside it.
 */
export const enqueueContactAvatarJobs = async (input: {
  workspaceId: string
  contactInboxIds: Map<string, Pick<ChannelContactImportLink, "contactInboxId">>
  /** Extra fields merged into the failure log for caller-side traceability
   *  (e.g. `runId`, `pageNumber`). */
  logContext?: Record<string, unknown>
}): Promise<void> => {
  const { workspaceId, contactInboxIds, logContext } = input
  if (contactInboxIds.size === 0) {
    return
  }

  const avatarJobs = Array.from(contactInboxIds, ([sourceId, link]) => ({
    name: IntegrationJobAction.updateContactAvatar,
    data: {
      type: IntegrationJobAction.updateContactAvatar,
      data: {
        workspaceId,
        contactInboxId: link.contactInboxId,
        sourceId,
      },
    },
    opts: {
      jobId: `update-avatar-${link.contactInboxId}`,
      attempts: 2,
      removeOnComplete: true,
      removeOnFail: { count: 100 },
    },
  }))

  try {
    await integrationQueue.addBulk(avatarJobs)
  } catch (error) {
    logger.error(
      { err: error, jobCount: avatarJobs.length, ...logContext },
      "[avatar] avatar addBulk failed — continuing",
    )
  }
}

import { templateInstallationRepository } from "@chatbotx.io/database/repositories"
import { flowVersionService } from "../flow-version"
import { logger } from "../logger"

/** A just-committed install or sync is left alone by the sweep for this long. */
export const PUBLISH_EFFECTS_SWEEP_GRACE_MS = 5 * 60 * 1000

/**
 * Runs the after-publish effects an install or sync owes for the flows it
 * published live (cache drop, Meta welcome-flow sync, stale quick-reply state),
 * then clears the ones that ran. The effects are recorded on the installation
 * in the same transaction as the completion, so a crash after commit does not
 * lose them: the sweep calls this again. An entry is cleared only after its
 * effects all succeeded; a failing one stays recorded and is retried on the
 * next sweep (every effect is idempotent), while the others are still cleared.
 * Never throws.
 */
export const flushPublishEffects = async (input: {
  installationId: string
  workspaceId: string
}): Promise<void> => {
  const pending =
    await templateInstallationRepository.findPendingPublishEffects(
      input.installationId,
    )
  if (pending.length === 0) {
    return
  }
  const settled = await Promise.allSettled(
    pending.map(({ flowId, versionId }) =>
      flowVersionService.afterPublishOrThrow({
        workspaceId: input.workspaceId,
        flowId,
        versionId,
      }),
    ),
  )
  const done = pending.filter(
    (_, index) => settled[index]?.status === "fulfilled",
  )
  for (const [index, result] of settled.entries()) {
    if (result.status === "rejected") {
      logger.warn(
        {
          err: result.reason,
          installationId: input.installationId,
          flowId: pending[index]?.flowId,
        },
        "Template: an after-publish effect failed; it stays owed for the next sweep",
      )
    }
  }
  if (done.length > 0) {
    await templateInstallationRepository.clearPendingPublishEffects({
      id: input.installationId,
      done,
    })
  }
  if (done.length < pending.length) {
    // Rotate it behind the others: a row that keeps failing must not starve them.
    await templateInstallationRepository.deferPendingPublishEffects(
      input.installationId,
    )
  }
}

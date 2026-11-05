import {
  type TemplateActor,
  templateInstallationRequestService,
} from "@chatbotx.io/business"
import {
  enqueueInstallTemplate,
  enqueueSyncTemplateInstallation,
} from "@chatbotx.io/worker-config"
import { logger } from "@/lib/log"

/**
 * The one install entry point shared by the server action and the public API:
 * record the request (duplicate-safe, see `templateInstallationRequestService`)
 * and queue the worker job.
 *
 * A failed enqueue is logged, not surfaced: the `pending` row is the durable
 * outbox, and the `redispatchTemplateJobs` sweep queues it again, so the
 * caller still gets an installation to follow instead of an error for work
 * that will happen anyway.
 */
export const requestTemplateInstall = async (input: {
  shareToken: string
  targetWorkspaceId: string
  installedBy: string | null
  actor: TemplateActor
  allowDuplicate?: boolean
  autoUpdate?: boolean
  acceptPublisherUninstall?: boolean
  inboxBindings?: Readonly<Record<string, string>>
  /** Stored on a reinstall's sync row so a replay returns the same sync. */
  idempotencyKey?: string
}): Promise<{ installationId: string; syncId?: string }> => {
  const { installation, syncId } =
    await templateInstallationRequestService.request(input)
  if (syncId) {
    // An installed copy is updated in place; the sync row is the outbox.
    await enqueueSync(syncId, installation.workspaceId)
    return { installationId: installation.id, syncId }
  }
  await enqueueInstall(installation.id, installation.workspaceId)
  return { installationId: installation.id }
}

/** Queues (or re-queues) a `pending` sync; safe to repeat, the job id is deterministic. */
export const enqueueSync = async (
  syncId: string,
  workspaceId: string,
): Promise<void> => {
  try {
    await enqueueSyncTemplateInstallation({ syncId, workspaceId })
  } catch (error) {
    logger.error(
      { err: error, syncId },
      "Queuing a template sync failed; the sweep will retry it",
    )
  }
}

/** Queues (or re-queues) a `pending` installation; safe to repeat, the job id is deterministic. */
export const enqueueInstall = async (
  installationId: string,
  workspaceId: string,
): Promise<void> => {
  try {
    await enqueueInstallTemplate({ installationId, workspaceId })
  } catch (error) {
    logger.error(
      { err: error, installationId },
      "Queuing a template install failed; the sweep will retry it",
    )
  }
}

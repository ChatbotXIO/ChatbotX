"use server"

import { templateService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { templateActionClient } from "./template-action-client"

/**
 * Re-enqueues the same `installTemplate` worker job against an *existing*
 * installation id — reuses the install pipeline as-is (`wasExisting`
 * tracking on each adapter makes a re-run idempotent-ish rather than
 * duplicating resources). Resets `status` to `pending` first so the row
 * can't be read mid-transition, then marks it failed if the enqueue itself
 * throws, mirroring `installTemplateAction`.
 */
export const reinstallTemplateAction = templateActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async ({ bindArgsParsedInputs: [workspaceId, installationId] }) => {
    await templateService.prepareReinstall({ workspaceId, installationId })

    try {
      await defaultQueue.add(
        DefaultJobAction.installTemplate,
        {
          type: DefaultJobAction.installTemplate,
          data: { installationId, workspaceId },
        },
        { jobId: `install-template-${installationId}-${Date.now()}` },
      )
    } catch (error) {
      await templateService.markInstallationFailed({
        installationId,
        errorMessage: "Unable to queue template reinstall",
      })
      throw error
    }
  })

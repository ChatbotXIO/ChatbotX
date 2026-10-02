"use server"

import {
  aiHandoverBulkRunService,
  aiHandoverSettingsService,
} from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  assertCanManageAiHandover,
  rethrowTranslated,
} from "../lib/assert-can-manage"
import { saveAiHandoverSettingsRequest } from "../schema/request"

/** The service reports a missing or inactive goto flow as `notFound`. */
const SAVE_ERROR_COPY_KEYS: Record<string, string> = {
  notFound: "aiHandover.errors.flowNotFound",
}

/**
 * Switching the automation off ends a running enable (its hand-overs would be
 * undone by the take-back anyway); a disable is meant to finish. The engine's
 * cached check already stops it at the next batch, so a failure here is logged,
 * never fatal to the save.
 */
async function stopEnableRun(page: {
  workspaceId: string
  inboxId: string
}): Promise<void> {
  try {
    await aiHandoverBulkRunService.cancelLiveForInbox({
      ...page,
      action: "enable",
    })
  } catch (err) {
    logger.error(
      { err, inboxId: page.inboxId },
      "AI hand-over settings saved off: could not stop the Page's enable run",
    )
  }
}

/**
 * Saves a Page's Meta Business AI settings. The request schema validates the
 * schedule and the return message; the service additionally checks the Page
 * (a Messenger Page of this workspace) and the goto flow (active, same
 * workspace). Bound as `.bind(null, workspaceId, inboxId)`.
 */
export const saveAiHandoverSettingsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(saveAiHandoverSettingsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, inboxId],
      parsedInput,
      ctx,
    }) => {
      await assertCanManageAiHandover(ctx)

      try {
        const saved = await aiHandoverSettingsService.save({
          ...parsedInput,
          workspaceId,
          inboxId,
        })
        if (!saved.enabled) {
          await stopEnableRun({ workspaceId, inboxId })
        }
        return {
          enabled: saved.enabled,
          scheduleEnabled: saved.scheduleEnabled,
          timeRanges: saved.timeRanges,
          gotoFlowId: saved.gotoFlowId,
          returnMessage: saved.returnMessage ?? "",
          pauseBotWaitingForStaff: saved.pauseBotWaitingForStaff,
        }
      } catch (error) {
        return await rethrowTranslated(error, SAVE_ERROR_COPY_KEYS)
      }
    },
  )

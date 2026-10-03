"use server"

import { aiHandoverBulkRunService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
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
        // Also stops the Page's running enable when the automation is saved off.
        const saved = await aiHandoverBulkRunService.saveSettings({
          ...parsedInput,
          workspaceId,
          inboxId,
        })
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

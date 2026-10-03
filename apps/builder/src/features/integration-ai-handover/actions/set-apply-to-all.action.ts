"use server"

import { aiHandoverBulkRunService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  assertCanManageAiHandover,
  rethrowTranslated,
} from "../lib/assert-can-manage"
import { BULK_ERROR_COPY_KEYS } from "../lib/bulk-error-copy"
import { setApplyToAllRequest } from "../schema/bulk"

/**
 * Moves a Page's "apply to all customers" switch. Asking for the state it is
 * already in does nothing. The service validates (the automation running for an
 * ON, a bounded text for an OFF) and its error codes are shown translated.
 * Bound as `.bind(null, workspaceId, inboxId)`.
 */
export const setApplyToAllAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(setApplyToAllRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, inboxId],
      parsedInput,
      ctx,
    }) => {
      await assertCanManageAiHandover(ctx)

      try {
        const { isChanged } = await aiHandoverBulkRunService.setApplyToAll({
          workspaceId,
          inboxId,
          userId: ctx.user.id,
          applyToAllCustomers: parsedInput.applyToAllCustomers,
          message: parsedInput.message,
        })
        return { isChanged }
      } catch (error) {
        return await rethrowTranslated(error, BULK_ERROR_COPY_KEYS)
      }
    },
  )

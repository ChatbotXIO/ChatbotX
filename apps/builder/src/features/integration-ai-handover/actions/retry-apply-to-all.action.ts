"use server"

import { aiHandoverBulkRunService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  assertCanManageAiHandover,
  rethrowTranslated,
} from "../lib/assert-can-manage"
import { BULK_ERROR_COPY_KEYS } from "../lib/bulk-error-copy"

/**
 * Starts a Page's latest "apply to all" state again after its run failed or was
 * stopped. Same rules as the switch. Bound as `.bind(null, workspaceId,
 * inboxId)`; no input.
 */
export const retryApplyToAllAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async ({ bindArgsParsedInputs: [workspaceId, inboxId], ctx }) => {
    await assertCanManageAiHandover(ctx)

    try {
      await aiHandoverBulkRunService.retry({
        workspaceId,
        inboxId,
        userId: ctx.user.id,
      })
    } catch (error) {
      return await rethrowTranslated(error, BULK_ERROR_COPY_KEYS)
    }
  })

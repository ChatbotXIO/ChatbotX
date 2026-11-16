"use server"

import { contactScanService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import { requireUnrestrictedContactsScope } from "../lib/require-unrestricted-contacts-scope"
import {
  type CancelContactScanRequest,
  type CancelContactScanResponse,
  cancelContactScanRequest,
} from "../schema/action"

/**
 * Allowed after the trial expires (invariant 14: cancel, like delete and
 * disconnect, must keep working). An assigned-only member is denied, as for
 * scheduling and reading the status.
 */
export const cancelContactScanAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(cancelContactScanRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CancelContactScanRequest
    }): Promise<CancelContactScanResponse> => {
      await requireUnrestrictedContactsScope(workspaceId)

      return await contactScanService.cancel({
        workspaceId,
        inboxId: parsedInput.inboxId,
      })
    },
  )

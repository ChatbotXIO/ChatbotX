"use server"

import { broadcastService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { createBroadcastRequest } from "../schema/action"

/**
 * `status` is intentionally the widened column type rather than
 * `BroadcastStatus`: `CreateBroadcastForm` binds either this action or
 * `createBroadcastAction` to one `useHookFormAction` call, and the latter
 * returns the raw broadcast row whose `status` is `string`. Both must agree for
 * the union of the two bound actions to type-check.
 */
type UpdateDraftBroadcastResult = { id: string; status: string }

export const updateDraftBroadcastAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(createBroadcastRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
    const canViewEmailAndPhone = userAndWorkspace
      ? canViewContactEmailAndPhone(
          userAndWorkspace.targetWorkspaceMember.permissions,
        )
      : false

    // The service owns the channel/subaction/ownership validation and the
    // `status = draft` conditional WHERE that makes a non-draft row unmatchable.
    const result: UpdateDraftBroadcastResult =
      await broadcastService.updateDraft({
        workspaceId,
        broadcastId: id,
        canViewEmailAndPhone,
        data: parsedInput,
      })

    // Mirrors `createBroadcastAction`: only an immediate send is a launch. A
    // future schedule is audited as a launch when the send actually happens,
    // and an edit that stays a draft never launches at all.
    if (result.status === "scheduled" && parsedInput.schedulesType === "now") {
      await auditService.record({
        workspaceId,
        action: "launch",
        detail: `launched a broadcast (#${result.id})`,
      })
    }

    return result
  })

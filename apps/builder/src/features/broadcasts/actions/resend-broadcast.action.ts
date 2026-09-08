"use server"

import { broadcastService } from "@chatbotx.io/business"
import { pruneEmailPhoneFilterConditions } from "@chatbotx.io/database/queries/contact-filter/permission"
import { broadcastRepository } from "@chatbotx.io/database/repositories"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { contactFilterCriteriaSchema } from "@/features/contact-filter/schema"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const resendBroadcastAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    return await resendBroadcast({ workspaceId, id })
  })

export const resendBroadcast = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(
    ctx.workspaceId,
  )

  const broadcast = await broadcastRepository.findContactFilter({
    id: ctx.id,
    workspaceId: ctx.workspaceId,
  })

  const persistedContactFilter = contactFilterCriteriaSchema.safeParse(
    broadcast?.contactFilter,
  )
  const contactFilter = pruneEmailPhoneFilterConditions(
    persistedContactFilter.success ? persistedContactFilter.data : undefined,
    userAndWorkspace
      ? canViewContactEmailAndPhone(
          userAndWorkspace.targetWorkspaceMember.permissions,
        )
      : false,
  )

  return await broadcastService.resend({
    workspaceId: ctx.workspaceId,
    id: ctx.id,
    contactFilter,
  })
}

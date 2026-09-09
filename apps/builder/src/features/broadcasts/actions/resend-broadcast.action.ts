"use server"

import { broadcastService } from "@chatbotx.io/business"
import { pruneEmailPhoneFilterConditions } from "@chatbotx.io/database/queries/contact-filter/permission"
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
  // Verify the broadcast exists (not soft-deleted, in-workspace) and is in
  // a resendable status, and read its persisted `contactFilter` in the same
  // call — `broadcastService.resend` re-asserts existence itself before its
  // own insert, so this pre-check is intentionally duplicated rather than
  // redundant, but it now also supplies the row so no second query is made
  // for `contactFilter`.
  const broadcast = await broadcastService.assertResendable({
    workspaceId: ctx.workspaceId,
    id: ctx.id,
  })

  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(
    ctx.workspaceId,
  )

  const persistedContactFilter = contactFilterCriteriaSchema.safeParse(
    broadcast.contactFilter,
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

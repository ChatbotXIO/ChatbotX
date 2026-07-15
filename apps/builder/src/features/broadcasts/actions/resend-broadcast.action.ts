"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, findOrFail } from "@chatbotx.io/database/client"
import { pruneEmailPhoneFilterConditions } from "@chatbotx.io/database/queries/contact-filter/permission"
import { broadcastModel } from "@chatbotx.io/database/schema"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { contactFilterCriteriaSchema } from "@/features/contact-filter/schemas"
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
  const broadcast = await findOrFail({
    table: broadcastModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
  })
  if (broadcast.status !== "sent") {
    throw new ChatbotXException("Broadcast is not sent")
  }
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

  const newBroadcast = await db.transaction(async (tx) => {
    const newBroadcast = await tx
      .insert(broadcastModel)
      .values({
        workspaceId: ctx.workspaceId,
        flowId: broadcast.flowId,
        integrationWhatsappId: broadcast.integrationWhatsappId,
        integrationMessengerId: broadcast.integrationMessengerId,
        channel: broadcast.channel,
        subaction: broadcast.subaction,
        templateId: broadcast.templateId,
        templateData: broadcast.templateData,
        status: "scheduled",
        schedulesType: "now",
        schedulesAt: new Date(),
        contactFilter,
        name: `${broadcast.name} (Resend)`,
        id: createId(),
      })
      .returning()
      .then((result) => result[0])

    return newBroadcast
  })

  return newBroadcast
}

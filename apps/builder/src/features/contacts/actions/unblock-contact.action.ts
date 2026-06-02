"use server"

import { contactService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { workspaceActionClient } from "@/lib/safe-action"

export const unblockContactAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await unblockContact({ workspaceId, id })
  })

export const unblockContact = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const contact = await contactService.unblock(ctx)

  await integrationQueue.add(IntegrationJobAction.unblockContact, {
    type: IntegrationJobAction.unblockContact,
    data: {
      contact,
    },
  })
}

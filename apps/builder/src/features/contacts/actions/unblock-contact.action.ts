"use server"

import { contactService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
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
  await contactService.unblock(ctx)
}

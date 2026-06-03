"use server"

import { contactService } from "@chatbotx.io/business"
import { emit } from "@chatbotx.io/event-bus"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const blockContactAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await blockContact({ workspaceId, id })
  })

export const blockContact = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const contact = await contactService.block(ctx)

  emit("analytics:dashboard", {
    eventType: "contact:blocked",
    workspaceId: ctx.workspaceId,
    contactId: contact.id,
    occurredAt: contact.blockedAt ?? new Date(),
    country: contact.country,
    metadata: {
      triggerContext: {
        triggerSource: "api",
        triggerHandler: "blockContactAction",
        triggerType: "contact_blocked",
        origin: "manual",
      },
    },
  })
}

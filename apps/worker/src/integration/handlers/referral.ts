import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  contactCustomFieldModel,
  reflinkModel,
} from "@chatbotx.io/database/schema"
import type { CustomFieldModel } from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { FlowEventType } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import type { IntegrationJobReferral } from "@chatbotx.io/worker-config"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { receiveMessage } from "./received-message"

export const handleReferral = async (props: IntegrationJobReferral["data"]) => {
  const { sourceConversationId, integrationType } = props

  const { ref } = await receiveMessage(props)

  console.log({ ref })

  if (!ref) {
    logger.warn("Referral ref is empty")
    return
  }

  const contactInbox = await db.query.contactInboxModel.findFirst({
    where: {
      sourceId: sourceConversationId,
      channel: integrationType,
    },
    with: {
      conversation: true,
    },
  })

  if (!contactInbox) {
    throw new Error("Contact inbox not found")
  }

  const conversation = contactInbox?.conversation

  const reflink = await findOrFail({
    table: reflinkModel,
    where: { name: ref, workspaceId: conversation.workspaceId },
    message: "Reflink not found",
  })

  await emit(FlowEventType["flow:ref"], {
    context: {
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      conversationId: conversation.id,
      channel: contactInbox.channel,
      contactInboxId: contactInbox.id,
    },
    action: {
      refId: reflink.id,
      refType: "entryPoint",
    },
    occurredAt: new Date(),
  })

  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation.id,
      flowId: reflink.flowId,
    },
  })

  // Trying to find reflink by custom field
  const refParts = ref.split("--").map((part) => part.trim())
  if (!refParts[0]) {
    logger.warn(`Invalid ref: ${ref}`)
    return
  }

  // Save data from custom field
  let customFieldId: string | null = null
  let customField: CustomFieldModel | null | undefined = null
  for (let i = 0; i < refParts.length; i++) {
    if (i === 0) {
      customFieldId = reflink.customFieldId ?? ""
    } else if (i % 2 === 0) {
      customFieldId = refParts[i]
    }

    if (i % 2 === 0) {
      if (customFieldId) {
        customField = await db.query.customFieldModel.findFirst({
          where: {
            workspaceId: conversation.workspaceId,
            id: customFieldId,
          },
        })
      } else {
        customField = null
      }
    }

    // Trying to find custom field by name, then update contact custom field
    if (i % 2 === 1 && refParts[i] && customField) {
      await db
        .insert(contactCustomFieldModel)
        .values({
          id: createId(),
          contactId: conversation.contactId,
          customFieldId: customField.id,
          value: refParts[i],
        })
        .onConflictDoUpdate({
          target: [
            contactCustomFieldModel.contactId,
            contactCustomFieldModel.customFieldId,
          ],
          set: {
            value: refParts[i],
          },
        })
    }
  }
}

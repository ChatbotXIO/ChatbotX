import { db, findOrFail } from "@aha.chat/database/client"
import {
  contactCustomFieldModel,
  conversationModel,
  flowModel,
  flowVersionModel,
  reflinkModel,
} from "@aha.chat/database/schema"
import type {
  ConversationModel,
  CustomFieldModel,
  FlowModel,
  FlowVersionModel,
  ReflinkModel,
} from "@aha.chat/database/types"
import {
  IntegrationJobAction,
  type IntegrationJobRunRef,
  integrationQueue,
} from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import { logger } from "../../lib/logger"

export async function runRef(data: IntegrationJobRunRef["data"]) {
  const { conversationId, ref } = data

  const conversation = await findOrFail<ConversationModel>(
    conversationModel,
    { id: conversationId },
    "Conversation not found",
  )

  if (ref.startsWith("draft-")) {
    logger.debug(`Draft ref: ${ref}`)
    const flowId = ref.replace("draft-", "").trim()
    if (!flowId) {
      logger.warn(`Invalid draft ref: ${ref}`)
      return
    }

    const flowVersion = await findOrFail<FlowVersionModel>(
      flowVersionModel,
      { flowId, isDraft: true },
      "Flow version not found",
    )

    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation.id,
        flowId: flowVersion.flowId,
        flowVersionId: flowVersion.id,
      },
    })
    return
  }

  if (ref.startsWith("flow-")) {
    logger.debug(`Start flow ref: ${ref}`)
    const flowId = ref.replace("flow-", "").trim()
    if (!flowId) {
      logger.warn(`Invalid flow ref: ${ref}`)
      return
    }

    const flow = await findOrFail<FlowModel>(
      flowModel,
      { id: flowId, chatbotId: conversation.chatbotId },
      "Flow not found",
    )

    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation.id,
        flowId: flow.id,
      },
    })
    return
  }

  // Trying to find reflink by custom field
  const refParts = ref.split("--").map((part) => part.trim())
  if (!refParts[0]) {
    logger.warn(`Invalid ref: ${ref}`)
    return
  }

  const reflink = await findOrFail<ReflinkModel>(
    reflinkModel,
    { name: refParts[0], chatbotId: conversation.chatbotId },
    "Reflink not found",
  )

  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation.id,
      flowId: reflink.flowId,
    },
  })

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
            chatbotId: conversation.chatbotId,
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

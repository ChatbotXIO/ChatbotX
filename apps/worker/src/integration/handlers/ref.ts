import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  contactCustomFieldModel,
  conversationModel,
  flowModel,
  flowVersionModel,
  reflinkModel,
} from "@chatbotx.io/database/schema"
import type { CustomFieldModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  type IntegrationJobRunRef,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

export async function runRef(data: IntegrationJobRunRef["data"]) {
  const { conversationId, ref } = data

  const conversation = await findOrFail({
    table: conversationModel,
    where: { id: conversationId },
    message: "Conversation not found",
  })

  if (ref.startsWith("draft-")) {
    logger.debug(`Draft ref: ${ref}`)
    const flowId = ref.replace("draft-", "").trim()
    if (!flowId) {
      logger.warn(`Invalid draft ref: ${ref}`)
      return
    }

    const flowVersion = await findOrFail({
      table: flowVersionModel,
      where: { flowId, isDraft: true },
      message: "Flow version not found",
    })

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

    const flow = await findOrFail({
      table: flowModel,
      where: { id: flowId, workspaceId: conversation.workspaceId },
      message: "Flow not found",
    })

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

  const reflink = await findOrFail({
    table: reflinkModel,
    where: { name: refParts[0], workspaceId: conversation.workspaceId },
    message: "Reflink not found",
  })

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

import { decodeRef, type RefConfig } from "@chatbotx.io/business"
import { findOrFail } from "@chatbotx.io/database/client"
import {
  flowModel,
  flowVersionModel,
  reflinkModel,
} from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { flowEventTypeSchema } from "@chatbotx.io/flow-config"
import {
  IntegrationJobAction,
  type IntegrationJobRunRef,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { detectConversationAndContactInbox } from "../../lib/db"
import { logger } from "../../lib/logger"
import { saveResultToCustomField } from "./generate-text"

export async function runRef(data: IntegrationJobRunRef["data"]) {
  const { conversationId, contactInboxId, ref } = data
  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId,
      contactInboxId,
    })

  const refData = decodeRef(ref)
  if (!refData) {
    return
  }

  if (refData.type === "draft") {
    logger.debug(`Draft ref: ${ref}`)
    const { flowId } = refData
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
        conversationId: conversation,
        contactInboxId: contactInbox,
        flowId: flowVersion.flowId,
        flowVersionId: flowVersion.id,
      },
    })
    return
  }

  if (refData.type === "flow") {
    logger.debug(`Start flow ref: ${ref}`)
    const { flowId, nodeId } = refData
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
        conversationId: conversation,
        contactInboxId: contactInbox,
        flowId: flow.id,
        nodeId,
      },
    })
    return
  }

  // Trigger reflink
  handleReflink({
    conversation,
    contactInbox,
    refData,
  })
}

async function handleReflink(props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  refData: Extract<RefConfig, { type: "reflink" }>
}) {
  const { conversation, contactInbox } = props
  const refData = props.refData

  const reflink = await findOrFail({
    table: reflinkModel,
    where: {
      name: refData.name,
      workspaceId: conversation.workspaceId,
    },
    message: "Reflink not found",
  })

  await emit(flowEventTypeSchema.enum["flow:ref"], {
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
      conversationId: conversation,
      contactInboxId: contactInbox,
      flowId: reflink.flowId,
    },
  })

  if (reflink.customFieldId) {
    await saveResultToCustomField({
      contactId: conversation.contactId,
      customFieldId: reflink.customFieldId,
      text: refData.name,
    })
  }

  // Support additional custom fields

  // // Trying to find reflink by custom field
  // const refParts = ref.split("--").map((part) => part.trim())
  // if (!refParts[0]) {
  //   logger.warn(`Invalid ref: ${ref}`)
  //   return
  // }

  // // Save data from custom field
  // let customFieldId: string | null = null
  // let customField: CustomFieldModel | null | undefined = null
  // for (let i = 0; i < refParts.length; i++) {
  //   if (i === 0) {
  //     customFieldId = reflink.customFieldId ?? ""
  //   } else if (i % 2 === 0) {
  //     customFieldId = refParts[i]
  //   }

  //   if (i % 2 === 0) {
  //     if (customFieldId) {
  //       customField = await db.query.customFieldModel.findFirst({
  //         where: {
  //           workspaceId: conversation.workspaceId,
  //           id: customFieldId,
  //         },
  //       })
  //     } else {
  //       customField = null
  //     }
  //   }

  //   // Trying to find custom field by name, then update contact custom field
  //   if (i % 2 === 1 && refParts[i] && customField) {
  //     await db
  //       .insert(contactCustomFieldModel)
  //       .values({
  //         id: createId(),
  //         contactId: conversation.contactId,
  //         customFieldId: customField.id,
  //         value: refParts[i],
  //       })
  //       .onConflictDoUpdate({
  //         target: [
  //           contactCustomFieldModel.contactId,
  //           contactCustomFieldModel.customFieldId,
  //         ],
  //         set: {
  //           value: refParts[i],
  //         },
  //       })
  //   }
  // }
}

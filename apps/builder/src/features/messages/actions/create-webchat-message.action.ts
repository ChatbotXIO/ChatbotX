"use server"

import { contactTrackingService } from "@chatbotx.io/analytics"
import { automatedResponseService } from "@chatbotx.io/automated-response"
import {
  db,
  eq,
  findOrFail,
  type Transaction,
} from "@chatbotx.io/database/client"
import type { ConversationAttributes } from "@chatbotx.io/database/partials"
import {
  attachmentModel,
  contactInboxModel,
  contactModel,
  conversationModel,
  integrationWebchatModel,
  messageModel,
  workspaceUsageModel,
} from "@chatbotx.io/database/schema"
import type {
  ContactModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { getPublicUrl } from "@chatbotx.io/database/utils"
import { type UploadedFile, uploadMultipleFiles } from "@chatbotx.io/filesystem"
import {
  broadcastToGuestParty,
  broadcastToWorkspaceParty,
  RealtimeEventType,
} from "@chatbotx.io/partysocket-config"
import { createId } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { randomString } from "remeda"
import type { AttachmentResource } from "@/features/attachments/schema/resource"
import { ChatbotXException } from "@/lib/errors/exception"
import { actionClient } from "@/lib/safe-action"
import {
  type CreateWebchatMessageRequest,
  createWebchatMessageRequest,
} from "../schema/mutation"
import type { MessageResource } from "../schema/resource"

export const createWebchatMessageAction = actionClient
  .inputSchema(createWebchatMessageRequest)
  .action(handleCreateWebchatMessage)

export async function handleCreateWebchatMessage({
  parsedInput,
}: {
  parsedInput: CreateWebchatMessageRequest
}) {
  const { conversation, isNewContact, contact, contactInbox } =
    await db.transaction(async (tx) => {
      return await getConversationFromInput(tx, parsedInput)
    })

  // Process flow if exists
  if ("flowId" in parsedInput) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation.id,
        flowId: parsedInput.flowId,
      },
    })
    return null
  }

  // Process ref if exists
  if ("initRef" in parsedInput && parsedInput.initRef) {
    await integrationQueue.add(IntegrationJobAction.runRef, {
      type: IntegrationJobAction.runRef,
      data: {
        conversationId: conversation.id,
        ref: parsedInput.initRef,
      },
    })
    return null
  }

  if ("postback" in parsedInput && parsedInput.postback) {
    await integrationQueue.add(IntegrationJobAction.runFlowPostback, {
      type: IntegrationJobAction.runFlowPostback,
      data: {
        conversationId: conversation.id,
        action: parsedInput.postback,
      },
    })
  }

  // Create conversation if it does not exist
  return await db.transaction(async (tx) => {
    // upload file if exists
    let uploadedFiles: UploadedFile[] = []
    if ("files" in parsedInput && parsedInput.files.length > 0) {
      uploadedFiles = await uploadMultipleFiles(
        parsedInput.files,
        `public/space/${parsedInput.workspaceId}/conversations/${conversation.id}`,
      )
    }

    if (
      "text" in parsedInput &&
      (parsedInput.text || uploadedFiles.length > 0)
    ) {
      const newMessage: MessageResource & {
        attachments?: AttachmentResource[]
      } = await tx
        .insert(messageModel)
        .values({
          text: parsedInput.text,
          messageType: "incoming",
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
          senderType: "contact",
          senderId: conversation.contactId,
          contentType: "text",
          contactInboxId: contactInbox.id,
        })
        .returning()
        .then((result) => result[0])

      if (uploadedFiles.length > 0) {
        const attachments = await tx
          .insert(attachmentModel)
          .values(
            uploadedFiles.map((file) => ({
              messageId: newMessage.id,
              workspaceId: newMessage.workspaceId,
              conversationId: newMessage.conversationId,
              ...file,
            })),
          )
          .returning()
          .then((result) =>
            result.map((attachment) => ({
              ...attachment,
              url: getPublicUrl(attachment.originPath),
            })),
          )

        newMessage.attachments = attachments as AttachmentResource[]
      }

      await tx
        .update(conversationModel)
        .set({
          contactLastReadAt: new Date(),
          lastActivityAt: new Date(),
          contactRepliedAt: new Date(),
        })
        .where(eq(conversationModel.id, conversation.id))

      // Broadcast realtime message
      const promises: Promise<unknown>[] = []
      promises.push(
        broadcastToWorkspaceParty(newMessage.workspaceId, {
          eventType: RealtimeEventType.messageCreated,
          data: {
            ...newMessage,
            clientId: parsedInput.clientId,
          },
        }),
      )

      if (uploadedFiles.length > 0 && contactInbox.sourceId) {
        promises.push(
          broadcastToGuestParty(contactInbox.sourceId, {
            eventType: RealtimeEventType.messageCreated,
            data: {
              ...newMessage,
              clientId: parsedInput.clientId,
            },
          }),
        )
      }

      const additionalAttributes =
        conversation.additionalAttributes as unknown as ConversationAttributes

      if (additionalAttributes?.challenge) {
        promises.push(
          integrationQueue.add(
            IntegrationJobAction.runChallenge,
            {
              type: IntegrationJobAction.runChallenge,
              data: {
                conversationId: conversation.id,
                challenge: additionalAttributes?.challenge,
              },
            },
            {
              deduplication: {
                id: `conversation-${conversation.id}-challenge`,
              },
            },
          ),
        )
      } else if (
        conversation.botEnabled &&
        newMessage.text &&
        !("postback" in parsedInput && parsedInput.postback)
      ) {
        promises.push(
          automatedResponseService.enqueue({
            conversationId: conversation.id,
            contactInboxId: contactInbox.id,
            messageId: newMessage.id,
          }),
        )
      }

      if (isNewContact && parsedInput.guestConversationId) {
        await contactTrackingService.trackEvent({
          workspaceId: parsedInput.workspaceId,
          contactId: contact.id,
          eventType: "contact_created",
          occurredAt: contact.createdAt,
          source: "webchat",
          sourceId: parsedInput.guestConversationId,
          channel: "webchat",
          country: undefined,
        })
      }

      if (promises.length > 0) {
        await Promise.all(promises)
      }

      return newMessage
    }

    return null
  })
}

async function getConversationFromInput(
  tx: Transaction,
  parsedInput: CreateWebchatMessageRequest,
) {
  const integrationWebchat = await findOrFail({
    table: integrationWebchatModel,
    where: {
      workspaceId: parsedInput.workspaceId,
      id: parsedInput.webchatId,
    },
    message: "Channel not found",
  })

  let isNewContact = false
  const sourceId = parsedInput.guestConversationId

  let conversation: ConversationModel | null | undefined = null
  let contact: ContactModel | null | undefined = null

  let contactInbox = await tx.query.contactInboxModel.findFirst({
    where: {
      inboxId: integrationWebchat.inboxId,
      sourceId,
    },
    orderBy: {
      lastMessageAt: "desc",
    },
  })
  if (contactInbox) {
    conversation = await tx.query.conversationModel.findFirst({
      where: {
        workspaceId: parsedInput.workspaceId,
        contactId: contactInbox.contactId,
      },
    })
    contact = await tx.query.contactModel.findFirst({
      where: {
        id: contactInbox.contactId,
      },
    })
  } else {
    const workspaceUsage = await findOrFail({
      table: workspaceUsageModel,
      where: {
        workspaceId: parsedInput.workspaceId,
      },
      message: "Workspace usage not found",
    })
    if (workspaceUsage.contactsCount >= workspaceUsage.maxContacts) {
      throw new ChatbotXException("Max contacts reached")
    }

    // Create new contact
    contact = await tx
      .insert(contactModel)
      .values({
        id: createId(),
        workspaceId: parsedInput.workspaceId,
        email: parsedInput.guestConversationId,
        gender: "unknown",
        firstName: "Guest",
        lastName: randomString(10),
      })
      .returning()
      .then((result) => result[0])
    if (!contact) {
      throw new ChatbotXException("Contact not found")
    }

    isNewContact = true

    // Create contact inbox
    contactInbox = await tx
      .insert(contactInboxModel)
      .values({
        id: createId(),
        inboxId: integrationWebchat.inboxId,
        contactId: contact.id,
        originalContactId: contact.id,
        source: "webchat",
        sourceId,
        channel: "webchat",
      })
      .returning()
      .then((result) => result[0])
    if (!contactInbox) {
      throw new ChatbotXException("Contact inbox not found")
    }

    // Create new conversation
    conversation = await tx
      .insert(conversationModel)
      .values({
        id: createId(),
        workspaceId: parsedInput.workspaceId,
        contactId: contact.id,
      })
      .returning()
      .then((result) => result[0])
  }

  if (!conversation) {
    throw new ChatbotXException("Conversation not found")
  }
  if (!contactInbox) {
    throw new ChatbotXException("Contact inbox not found")
  }
  if (!contact) {
    throw new ChatbotXException("Contact not found")
  }

  return {
    conversation,
    contact,
    contactInbox,
    isNewContact,
  }
}

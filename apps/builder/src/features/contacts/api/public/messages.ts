import {
  automatedResponseService,
  contactService,
  conversationService,
  messageService,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  listMessages,
  publicFindContactMessage,
} from "@/features/messages/queries"
import { createMessageRequest } from "@/features/messages/schema/mutation"
import { listMessagesResponse } from "@/features/messages/schema/query"
import { messageResourceWithRelations } from "@/features/messages/schema/resource"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

// Sending/reading messages, auto-replies, and flows for a contact are
// conversation/automation operations even though they hang off
// `/v1/contacts/{identifier}/...` — see the endpoint-to-scope table in
// docs/developer/workspace-api-tokens.md.
const inboxScopedTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")
const automationScopedTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const contactsMessagesPublicRouter = {
  sendMessage: inboxScopedTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/messages",
      summary: "Send message to contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      createMessageRequest.and(
        z.object({
          identifier: z.string().min(1),
        }),
      ),
    )
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      const conversation = await conversationService.findByContactWithInboxes({
        contactId,
        workspaceId: context.workspace.id,
      })
      if (!conversation) {
        throw notFoundException("Conversation not found")
      }

      const contactInbox = input.inboxId
        ? conversation.contactInboxes.find((ci) => ci.inboxId === input.inboxId)
        : conversation.contactInboxes[0]
      if (!contactInbox) {
        throw notFoundException("Conversation not found")
      }

      await messageService.createOutgoing({
        conversation,
        contactInbox,
        input,
      })
    }),

  listMessages: inboxScopedTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/messages",
      summary: "List messages for contact",
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        perPage: z.coerce.number().optional().default(20),
        cursor: z.string().optional(),
      }),
    )
    .output(listMessagesResponse)
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      const conversation = await conversationService.findByContactWithInboxes({
        contactId,
        workspaceId: context.workspace.id,
      })
      if (!conversation) {
        throw notFoundException("Conversation not found")
      }
      return await listMessages({
        workspaceId: context.workspace.id,
        conversationId: conversation.id,
        perPage: input.perPage,
        cursor: input.cursor,
      })
    }),

  getMessage: inboxScopedTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/messages/{messageId}",
      summary: "Get a message by ID for a contact",
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        messageId: zodBigintAsString(),
      }),
    )
    .output(messageResourceWithRelations)
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      const conversation = await conversationService.findByContactWithInboxes({
        contactId,
        workspaceId: context.workspace.id,
      })
      if (!conversation) {
        throw notFoundException("Conversation not found")
      }
      return publicFindContactMessage({
        messageId: input.messageId,
        conversationId: conversation.id,
        workspaceId: context.workspace.id,
      })
    }),

  triggerAutoReply: automationScopedTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/auto-replies",
      summary: "Trigger auto reply for contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        keyword: z.string().min(1),
        inboxId: zodBigintAsString().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      const autoReply = await automatedResponseService.findByInboundKeyword(
        context.workspace.id,
        input.keyword,
      )
      if (!autoReply) {
        throw notFoundException("No automated response found for this keyword")
      }

      const conversation = await conversationService.findByContactWithInboxes({
        contactId,
        workspaceId: context.workspace.id,
      })
      if (!conversation) {
        throw notFoundException("Conversation not found")
      }

      const contactInbox = input.inboxId
        ? conversation.contactInboxes.find((ci) => ci.inboxId === input.inboxId)
        : conversation.contactInboxes[0]
      if (!contactInbox) {
        throw notFoundException("Conversation not found")
      }

      const parsedInput = autoReply.flowId
        ? { flowId: autoReply.flowId, inboxId: input.inboxId }
        : { text: autoReply.text ?? "", inboxId: input.inboxId }

      await messageService.createOutgoing({
        conversation,
        contactInbox,
        input: parsedInput,
      })
    }),

  sendFlow: automationScopedTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/flows",
      summary: "Send flow to contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        flowId: zodBigintAsString(),
        inboxId: zodBigintAsString().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      const conversation = await conversationService.findByContactWithInboxes({
        contactId,
        workspaceId: context.workspace.id,
      })
      if (!conversation) {
        throw notFoundException("Conversation not found")
      }

      const contactInbox = input.inboxId
        ? conversation.contactInboxes.find((ci) => ci.inboxId === input.inboxId)
        : conversation.contactInboxes[0]
      if (!contactInbox) {
        throw notFoundException("Conversation not found")
      }

      await messageService.createOutgoing({
        conversation,
        contactInbox,
        input: { flowId: input.flowId, inboxId: input.inboxId },
      })
    }),
}

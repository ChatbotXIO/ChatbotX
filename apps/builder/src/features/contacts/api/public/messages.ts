import {
  automatedResponseService,
  contactService,
  conversationService,
  messageService,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { listMessages } from "@/features/messages/queries"
import { createMessageRequest } from "@/features/messages/schema/mutation"
import { listMessagesResponse } from "@/features/messages/schema/query"
import { messageResourceWithRelations } from "@/features/messages/schema/resource"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicContactIdentifier } from "@/lib/public-api/contact-identifier"
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
      description:
        "Delivers a text or media message to a contact's conversation, creating one when needed. Use `contacts.get` to confirm the recipient first, and `contacts.listMessages` to inspect the conversation afterward.",
      successStatus: 204,
      tags: ["Contacts"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(
      createMessageRequest.and(
        z.object({
          identifier: publicContactIdentifier,
        }),
      ),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      const { conversation, contactInbox } =
        await conversationService.resolveContactInboxForSend({
          contactId,
          workspaceId: context.workspace.id,
          inboxId: input.inboxId,
        })

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
      description:
        "Use this to inspect cursor-paginated messages from a contact's existing conversation. Call `contacts.get` to resolve the contact first, or use `contacts.sendMessage` to add an outbound message.",
      tags: ["Contacts"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
        perPage: z.coerce
          .number()
          .optional()
          .default(20)
          .describe("Number of messages per page."),
        cursor: z
          .string()
          .optional()
          .describe(
            "Opaque pagination cursor from a previous response. Omit for the first page.",
          ),
      }),
    )
    .output(listMessagesResponse)
    .errors(possibleErrorsOnFindingResource)
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
      summary: "Get message for contact",
      description:
        "Returns one message from a contact's conversation. Call `contacts.listMessages` to find its `messageId` first.",
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
        messageId: zodBigintAsString().describe("Message id (numeric string)."),
      }),
    )
    .output(messageResourceWithRelations)
    .errors(possibleErrorsOnFindingResource)
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
      return await messageService.findForContact({
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
      description:
        "Simulates the contact sending `keyword` and delivers whichever automated response is configured to match it, as if it had arrived inbound. Use `contacts.sendMessage` to send arbitrary text instead.",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
        keyword: z
          .string()
          .min(1)
          .describe(
            "Inbound keyword to match against configured auto-replies.",
          ),
        inboxId: zodBigintAsString()
          .optional()
          .describe(
            "Inbox id (numeric string) to send from. Get it from `inboxes.list`.",
          ),
      }),
    )
    .errors(possibleErrorsOnMutatingResource)
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

      const { conversation, contactInbox } =
        await conversationService.resolveContactInboxForSend({
          contactId,
          workspaceId: context.workspace.id,
          inboxId: input.inboxId,
        })

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
      description:
        "Starts a flow for a resolved contact and delivers its first message on an existing or new conversation. Call `flows.list` to find the flow first, or use `contacts.sendMessage` for one message.",
      successStatus: 204,
      tags: ["Contacts"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
        flowId: zodBigintAsString().describe(
          "Flow id (numeric string). Get it from `flows.list`.",
        ),
        inboxId: zodBigintAsString()
          .optional()
          .describe(
            "Inbox id (numeric string) to send from. Get it from `inboxes.list`.",
          ),
      }),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      const { conversation, contactInbox } =
        await conversationService.resolveContactInboxForSend({
          contactId,
          workspaceId: context.workspace.id,
          inboxId: input.inboxId,
        })

      await messageService.createOutgoing({
        conversation,
        contactInbox,
        input: { flowId: input.flowId, inboxId: input.inboxId },
      })
    }),
}

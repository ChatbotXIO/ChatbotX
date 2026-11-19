import {
  automatedResponseService,
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
  possibleErrorsOnSendingMessage,
} from "@/lib/orpc/orpc-error-helper"
import { publicContactIdentifier } from "@/lib/public-api/contact-identifier"
import {
  assertMemberMayStartFlow,
  contactIdFor,
  resolveSenderForCaller,
} from "@/lib/public-api/member-scope"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

// Sending/reading messages, auto-replies, and flows for a contact are
// conversation/automation operations even though they hang off
// `/v1/contacts/{identifier}/...` — see the endpoint-to-scope table in
// docs/developer/workspace-api-tokens.md.
const inboxScopedTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")
const automationScopedTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

const conversationIdInput = zodBigintAsString()
  .optional()
  .describe(
    "Conversation to read. Omit for the contact's primary conversation; an email (SMTP) contact has one conversation per thread, so pass the thread's conversation id (from `messages.create` / the Inbox link) to read the others. A conversation of another contact returns 404.",
  )

async function resolveReadConversationId(props: {
  contactId: string
  workspaceId: string
  conversationId?: string
}): Promise<string> {
  const { contactId, workspaceId, conversationId } = props
  const conversation = conversationId
    ? await conversationService.findByUncached({
        where: { id: conversationId, workspaceId, contactId },
      })
    : await conversationService.findByContactWithInboxes({
        contactId,
        workspaceId,
      })
  if (!conversation) {
    throw notFoundException("Conversation not found")
  }
  return conversation.id
}

export const contactsMessagesPublicRouter = {
  sendMessage: inboxScopedTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/messages",
      summary: "Send message to contact",
      description:
        "Delivers a text, media or catalog product message (`products`, on channels with product messages such as WhatsApp; ids from `products.listSendable`). For SMTP, this opens a new email thread; use `messages.create` with `conversationId` to reply in an existing thread. Delivery is asynchronous: if the channel finally rejects the message (after any retries), it is removed from the conversation — reading it by id then returns 404 — and the error is written to the workspace Error Log (`errorLogs.list`). Only messages a member sends from the Inbox are kept with their error.",
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
    .errors(possibleErrorsOnSendingMessage)
    .handler(async ({ context, input }) => {
      const contactId = await contactIdFor(context, input.identifier)
      const { conversation, contactInbox } =
        await conversationService.resolveContactInboxForSend({
          contactId,
          workspaceId: context.workspace.id,
          inboxId: input.inboxId,
        })
      await assertMemberMayStartFlow(
        context,
        "flowId" in input ? input.flowId : undefined,
      )
      const user = resolveSenderForCaller(context)
      await messageService.createOutgoing({
        conversation,
        contactInbox,
        input,
        ...(user && { user }),
        sendFrom: "api",
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
        conversationId: conversationIdInput,
        contactInboxId: zodBigintAsString()
          .optional()
          .describe(
            "Only messages of this contact inbox (one channel of the contact). Get it from `contactInboxes` in `contacts.get`; an id of another contact returns no messages.",
          ),
      }),
    )
    .output(listMessagesResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const contactId = await contactIdFor(context, input.identifier)
      const conversationId = await resolveReadConversationId({
        contactId,
        workspaceId: context.workspace.id,
        conversationId: input.conversationId,
      })
      return await listMessages({
        workspaceId: context.workspace.id,
        conversationId,
        contactInboxId: input.contactInboxId,
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
        conversationId: conversationIdInput,
      }),
    )
    .output(messageResourceWithRelations)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const contactId = await contactIdFor(context, input.identifier)
      const conversationId = await resolveReadConversationId({
        contactId,
        workspaceId: context.workspace.id,
        conversationId: input.conversationId,
      })
      return await messageService.findForContact({
        messageId: input.messageId,
        conversationId,
        workspaceId: context.workspace.id,
      })
    }),

  triggerAutoReply: automationScopedTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/auto-replies",
      summary: "Trigger auto reply for contact",
      description:
        "Finds the inbound automated response whose keywords include `keyword` exactly and sends its flow or text to the contact's conversation. No inbound message is recorded and no other automation runs; 404 when no response matches. Use `contacts.sendMessage` to send arbitrary text instead.",
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
      const contactId = await contactIdFor(context, input.identifier)
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
        sendFrom: "api",
      })
    }),

  sendFlow: automationScopedTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/flows",
      summary: "Send flow to contact",
      description:
        "Starts a flow for a resolved contact on the given `inboxId`, or the contact's most recently active inbox, and returns as soon as it is queued. SMTP starts in a new email thread. Returns 404 when the contact has no matching inbox or the flow is not in this workspace. Call `flows.list` to find the flow first, or use `contacts.sendMessage` for one message.",
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
      const contactId = await contactIdFor(context, input.identifier)
      const { conversation, contactInbox } =
        await conversationService.resolveContactInboxForSend({
          contactId,
          workspaceId: context.workspace.id,
          inboxId: input.inboxId,
        })

      await assertMemberMayStartFlow(context, input.flowId)
      const user = resolveSenderForCaller(context)

      await messageService.createOutgoing({
        conversation,
        contactInbox,
        input: { flowId: input.flowId, inboxId: input.inboxId },
        ...(user && { user }),
        sendFrom: "api",
      })
    }),
}

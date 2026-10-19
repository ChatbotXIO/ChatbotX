import {
  conversationService,
  messageService,
  resolveTemplateParams,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import {
  IMAGES_NOT_SUPPORTED_ON_CHANNEL_CODE,
  PRODUCT_MESSAGE_UNRESOLVABLE_CODE,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import {
  ENGLISH_CALL_PERMISSION_MESSAGES,
  requestWhatsappCallPermission,
} from "@/features/integration-whatsapp/calling/lib/request-call-permission"
import { changeMessageAttributes } from "@/features/messages/actions/change-message-attributes.action"
import { deleteMessage } from "@/features/messages/actions/delete-message.action"
import { editMessage } from "@/features/messages/actions/edit-message.action"
import { getWhatsappFlowResponseView } from "@/features/messages/lib/get-whatsapp-flow-response"
import { sendWhatsappTemplateToConversation } from "@/features/messages/lib/send-whatsapp-template"
import { listMessages } from "@/features/messages/queries"
import { whatsappFlowResponseSchema } from "@/features/messages/schema/flow-response"
import {
  changeMessageAttributesRequest,
  createMessageRequest,
  editMessageRequest,
} from "@/features/messages/schema/mutation"
import { listMessagesResponse } from "@/features/messages/schema/query"
import { messageResourceWithRelations } from "@/features/messages/schema/resource"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  imagesNotSupportedOnChannel,
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
  productMessageUnresolvable,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  changeMessageAttributesPublicResponse,
  conversationIdPathParam,
  editMessagePublicResponse,
  listConversationMessagesPublicRequest,
  messageIdPathParam,
  messageIdWithCreatedAtParam,
  requestCallPermissionPublicRequest,
  sendWhatsappTemplatePublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

// Compile-time guard: `editMessagePublicResponse` is a hand-maintained mirror
// of `editMessage`'s return shape (an inline object literal, not itself a
// schema). oRPC output schemas silently strip unknown keys, so a field added
// to `editMessage`'s return without a matching field here would vanish from
// the public response with no runtime error — this assignment fails to
// typecheck instead the moment the two diverge.
type _EditMessagePublicResponseInSync =
  Awaited<ReturnType<typeof editMessage>> extends z.infer<
    typeof editMessagePublicResponse
  >
    ? true
    : never
const _editMessagePublicResponseInSync: _EditMessagePublicResponseInSync = true

export const messagesPublicRouter = {
  requestWhatsappCallPermission: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{conversationId}/whatsapp-call-permission",
      summary: "Request WhatsApp call permission",
      description:
        "Sends Meta's call-permission request into a WhatsApp conversation so the customer can allow the business to call. The answer arrives as a reply on the conversation and is stored per contact. Meta allows one request per 24 hours and two per 7 days for each customer; the limit is checked against Meta first and refused with its reason. `inboxId` pins the WhatsApp number to send from.",
      successStatus: 202,
      tags: ["Messages"],
    })
    .input(requestCallPermissionPublicRequest)
    .output(z.object({ queued: z.literal(true) }))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const conversation = await conversationService.findByOrFail({
        where: { id: input.conversationId, workspaceId },
      })
      await requestWhatsappCallPermission({
        workspaceId,
        conversation,
        text: input.text,
        inboxId: input.inboxId,
        requireRequestedInbox: true,
        messages: ENGLISH_CALL_PERMISSION_MESSAGES,
      })
      return { queued: true as const }
    }),

  sendWhatsappTemplate: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{conversationId}/whatsapp-template",
      summary: "Send WhatsApp template to conversation",
      description:
        "Queues one approved WhatsApp template into the conversation, bypassing the 24-hour window, so you can reach a customer who has not written recently. Pick the template with `whatsappTemplates.list` (status APPROVED, on the number you send from) and fill its parameters with `templateParams` (keys from `whatsappTemplates.get` `parameters`; omit for a template with none). `inboxId` chooses which WhatsApp number of the contact to send from; omit it to use the most recent. Delivery is asynchronous: a template that is not approved or belongs to another number fails in the worker and is not sent. This messages a real customer and may be billed by Meta.",
      successStatus: 202,
      tags: ["Messages"],
    })
    .input(sendWhatsappTemplatePublicRequest)
    .output(z.object({ queued: z.literal(true) }))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { conversationId, templateParams, ...request } = input
      const templateData = templateParams
        ? await resolveTemplateParams({
            workspaceId: context.workspace.id,
            channel: "whatsapp",
            templateId: request.templateId,
            values: templateParams,
            field: "templateParams",
          })
        : request.templateData
      await sendWhatsappTemplateToConversation({
        workspaceId: context.workspace.id,
        conversationId,
        request: { ...request, templateData },
        sender: { initiatedBy: "api" },
      })
      return { queued: true as const }
    }),

  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/conversations/{conversationId}/messages",
      summary: "List messages on conversation",
      description:
        "Lists messages on the given conversation, newest-related pagination via `cursor`. Use `conversations.get` first if you only have a contact identifier.",
      tags: ["Messages"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(listConversationMessagesPublicRequest)
    .output(listMessagesResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      // `listForConversation` silently returns an empty page for an unknown
      // conversation id instead of throwing — validate existence explicitly
      // so this GET-by-id-shaped route can 404, per
      // public-spec-operations.test.ts's error-coverage sweep.
      await conversationService.findByOrFail({
        where: { id: input.conversationId, workspaceId },
      })
      return await listMessages({
        workspaceId,
        conversationId: input.conversationId,
        perPage: input.perPage,
        cursor: input.cursor,
      })
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/conversations/{conversationId}/messages/{messageId}",
      summary: "Get message on conversation",
      description:
        "Returns one message. Use `messages.list` to find its `messageId`/`createdAt` first.",
      tags: ["Messages"],
    })
    .input(messageIdWithCreatedAtParam)
    .output(messageResourceWithRelations)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const message = await messageService.findByIdWithUrls({
        workspaceId: context.workspace.id,
        id: input.messageId,
        createdAt: input.createdAt,
      })
      // `findByIdWithUrls` only scopes by id/createdAt/workspaceId — a
      // message from any conversation in the workspace would otherwise be
      // returned under an unrelated conversation's path.
      if (message.conversationId !== input.conversationId) {
        throw notFoundException("Message not found")
      }
      return message
    }),

  getFlowResponse: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/conversations/{conversationId}/messages/{messageId}/flow-response",
      summary: "Get WhatsApp Flow response",
      description:
        "Returns the answers of a WhatsApp Flow response message (`contentAttributes.type` = `whatsapp_flow_response`), each paired with the question as the Flow labels it, in the Flow's order. Take `messageId`/`createdAt` from `messages.list`. Labels come from the Flow JSON on Meta; when the Flow cannot be identified (e.g. it was sent by another app) `labelSource` is `fallback` and labels are humanized keys. 404 when the message is not a Flow response.",
      tags: ["Messages"],
    })
    .input(messageIdWithCreatedAtParam)
    .output(whatsappFlowResponseSchema)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await getWhatsappFlowResponseView({
          workspaceId: context.workspace.id,
          conversationId: input.conversationId,
          messageId: input.messageId,
          createdAt: input.createdAt,
        }),
    ),

  // `user` is omitted from `createOutgoing` — a workspace token has no user;
  // same as the already-public `contacts.sendMessage`
  // (contacts/api/public/messages.ts), which sends on the same underlying
  // service without one.
  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{conversationId}/messages",
      summary: "Send message on conversation",
      description:
        "Use this to reply in an existing conversation by conversationId. Sends an outgoing text, media or catalog product message (`products`, on channels with product messages such as WhatsApp; ids from `products.listSendable`) on an existing conversation. To message a contact without first resolving their conversation id, use `contacts.sendMessage` instead. Images are refused with `imagesNotSupportedOnChannel` (422, `data.reason`/`data.max`) where the channel can't carry them: Threads, Instagram and TikTok comment replies, or more than one image on a Messenger comment reply. To send a saved reply, pass its `text` and its `images[].mediaLibraryFileId` as `mediaFileIds` (from `savedReplies.list`).",
      successStatus: 201,
      tags: ["Messages"],
    })
    .input(createMessageRequest.and(conversationIdPathParam))
    .output(messageResourceWithRelations.nullable())
    .errors({
      ...possibleErrorsOnCreatingResource,
      [PRODUCT_MESSAGE_UNRESOLVABLE_CODE]: productMessageUnresolvable,
      [IMAGES_NOT_SUPPORTED_ON_CHANNEL_CODE]: imagesNotSupportedOnChannel,
    })
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id

      const conversation = await conversationService.findByOrFail({
        where: { id: input.conversationId, workspaceId },
      })

      const inboxId =
        "inboxId" in input && input.inboxId ? input.inboxId : undefined
      const contactInbox =
        await conversationService.resolveContactInboxForConversation({
          conversation,
          workspaceId,
          inboxId,
        })

      return messageService.createOutgoing({
        conversation,
        contactInbox,
        input,
      })
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/conversations/{conversationId}/messages/{messageId}",
      summary: "Edit comment message",
      description:
        "Edits the text of a comment-origin message (e.g. a Facebook/Instagram comment reply). Not usable for chat messages.",
      tags: ["Messages"],
    })
    .input(editMessageRequest.omit({ messageId: true }).and(messageIdPathParam))
    .output(editMessagePublicResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) =>
      editMessage({
        workspaceId: context.workspace.id,
        conversationId: input.conversationId,
        parsedInput: input,
      }),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/conversations/{conversationId}/messages/{messageId}",
      summary: "Delete comment message",
      description:
        "Permanently deletes a comment-origin message. Use `messages.list` to find its `messageId`/`createdAt` first.",
      successStatus: 204,
      tags: ["Messages"],
    })
    .input(messageIdWithCreatedAtParam)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await deleteMessage({
        workspaceId: context.workspace.id,
        conversationId: input.conversationId,
        parsedInput: { id: input.messageId, createdAt: input.createdAt },
      })
    }),

  changeAttributes: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{conversationId}/messages/{messageId}/attributes",
      summary: "Change message liked/hidden attributes",
      description:
        "Toggles whether a comment-origin message is liked and/or hidden. Use `messages.list` to find its `messageId` first.",
      tags: ["Messages"],
    })
    .input(
      changeMessageAttributesRequest
        .omit({ messageId: true })
        .and(messageIdPathParam),
    )
    .output(changeMessageAttributesPublicResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) =>
      changeMessageAttributes({
        workspaceId: context.workspace.id,
        conversationId: input.conversationId,
        parsedInput: input,
      }),
    ),
}

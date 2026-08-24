import { ChatbotXException } from "@chatbotx.io/business/errors"
import { incomingApiMessageSchema } from "@chatbotx.io/integration-api"
import { enqueueIntegrationJob } from "@chatbotx.io/worker-config"
import { z } from "zod"
import { logger } from "@/lib/log"
import { checkChannelApiRateLimit } from "@/lib/rate-limit/channel-api-rate-limit"
import { channelApiTokenAPI } from "@/orpc"

const TOO_MANY_REQUESTS_STATUS = 429

const assertNotRateLimited = async (inboxId: string): Promise<void> => {
  const { limited, retryAfter } = await checkChannelApiRateLimit({ inboxId })
  if (limited) {
    throw new ChatbotXException(
      `Too many requests. Retry after ${retryAfter}s.`,
      "tooManyRequests",
      TOO_MANY_REQUESTS_STATUS,
    )
  }
}

export const channelApiAPIs = {
  createChannelApiMessage: channelApiTokenAPI
    .route({
      method: "POST",
      path: "/v1/channels/api/messages",
      summary: "Send an inbound message from your application to ChatbotX",
      description:
        "`message.sourceId` is the idempotency key — sending the same value twice for the same contact does not create a duplicate message. Always send a stable id, never a random one per retry.",
      tags: ["API Channel"],
      successStatus: 202,
    })
    .input(incomingApiMessageSchema)
    .output(
      z.object({
        accepted: z.boolean(),
        messageSourceId: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      await assertNotRateLimited(context.inbox.id)

      await enqueueIntegrationJob({
        type: "incomingMessage",
        data: {
          integrationType: "api",
          integrationIdentifier: context.inbox.id,
          payload: input,
        },
      })

      return { accepted: true, messageSourceId: input.message.sourceId }
    }),

  channelApiTyping: channelApiTokenAPI
    .route({
      method: "POST",
      path: "/v1/channels/api/typing",
      summary: "Notify ChatbotX that the contact is typing",
      tags: ["API Channel"],
      successStatus: 204,
    })
    .input(
      z.object({
        contact: z.object({ sourceId: z.string().min(1) }),
        typing: z.boolean(),
      }),
    )
    .handler(async ({ context, input }) => {
      await assertNotRateLimited(context.inbox.id)

      // No downstream consumer for inbound "contact is typing" today (no
      // matching IntegrationJobAction/worker handler) — accepted and
      // acknowledged, not yet relayed anywhere. Revisit if/when the inbox UI
      // needs to reflect contact-side typing state.
      logger.debug(
        { inboxId: context.inbox.id, sourceId: input.contact.sourceId },
        "Received contact typing notification",
      )
    }),

  channelApiContactRead: channelApiTokenAPI
    .route({
      method: "POST",
      path: "/v1/channels/api/read",
      summary: "Notify ChatbotX that the contact read our messages",
      tags: ["API Channel"],
      successStatus: 204,
    })
    .input(
      z.object({
        contact: z.object({ sourceId: z.string().min(1) }),
      }),
    )
    .handler(async ({ context, input }) => {
      await assertNotRateLimited(context.inbox.id)

      await enqueueIntegrationJob({
        type: "contactMarkAsRead",
        data: {
          integrationType: "api",
          integrationIdentifier: context.inbox.id,
          sourceConversationId: input.contact.sourceId,
          payload: input,
        },
      })
    }),

  channelApiDeliveryStatus: channelApiTokenAPI
    .route({
      method: "POST",
      path: "/v1/channels/api/delivery-status",
      summary: "Report delivery status for an outbound message",
      description:
        "`messageId` correlates to the id ChatbotX received back in the outbound callback response, if one was supplied.",
      tags: ["API Channel"],
      successStatus: 204,
    })
    .input(
      z.object({
        messageId: z.string().min(1),
        status: z.enum(["delivered", "failed", "read"]),
        timestamp: z.string(),
        error: z.unknown().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      await assertNotRateLimited(context.inbox.id)

      await enqueueIntegrationJob({
        type: "messageStatus",
        data: {
          integrationType: "api",
          integrationIdentifier: context.inbox.id,
          payload: input,
        },
      })
    }),

  getChannelApiMe: channelApiTokenAPI
    .route({
      method: "GET",
      path: "/v1/channels/api/me",
      summary: "Verify your token and echo the connected inbox identity",
      tags: ["API Channel"],
    })
    .output(
      z.object({
        inboxId: z.string(),
        inboxName: z.string(),
        workspaceId: z.string(),
      }),
    )
    .handler(({ context }) => ({
      inboxId: context.inbox.id,
      inboxName: context.inbox.name,
      workspaceId: context.workspace.id,
    })),
}

export default channelApiAPIs

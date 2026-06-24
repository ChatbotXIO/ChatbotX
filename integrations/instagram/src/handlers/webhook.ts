import type { ContextQueue, HandleRequestProps } from "@chatbotx.io/sdk"
import z from "zod"
import { InstagramWebhookException } from "../exception"
import { logger } from "../lib/logger"
import { hmacSha256Hex, timingSafeStringEqual } from "../lib/webhook"
import {
  INSTAGRAM_MESSAGE_METADATA,
  type InstagramConfig,
  instagramCommentEventValueSchema,
  instagramWebhookEventSchema,
} from "../schemas"

const verifyWebhookSignature = async (
  payload: string,
  signature: string,
  clientSecret: string,
): Promise<boolean> => {
  try {
    const elements = signature.split("=")
    if (elements.length !== 2) {
      return false
    }

    const signatureHash = elements[1]
    const expectedHash = await hmacSha256Hex(clientSecret, payload)

    return timingSafeStringEqual(signatureHash, expectedHash)
  } catch {
    return false
  }
}

const handleWebhookEvent = async (
  req: Request,
  config: InstagramConfig,
  queue: ContextQueue,
): Promise<void> => {
  try {
    const body = await req.text()
    if (!body) {
      throw new InstagramWebhookException("Empty webhook payload")
    }

    const signature = req.headers.get("x-hub-signature-256") ?? ""
    if (!signature) {
      throw new InstagramWebhookException("Missing webhook signature")
    }

    const isValidSignature = await verifyWebhookSignature(
      body,
      signature,
      config.clientSecret,
    )

    if (!isValidSignature) {
      throw new InstagramWebhookException("Invalid webhook signature")
    }

    const webhookData = instagramWebhookEventSchema.parse(JSON.parse(body))
    if (webhookData.object !== "instagram") {
      throw new InstagramWebhookException(
        `Unsupported webhook object type: ${webhookData.object}`,
        webhookData,
      )
    }

    const entry = webhookData.entry[0]

    // Handle Instagram post comment events (changes.comments).
    // Instagram only sends webhooks for new comments — no edit/delete events.
    const commentChange = entry.changes?.find(
      (c: { field: string }) => c.field === "comments",
    )
    if (commentChange) {
      const parsed = instagramCommentEventValueSchema.safeParse(
        commentChange.value,
      )
      if (!parsed.success) {
        logger.warn(
          { error: parsed.error, value: commentChange.value },
          "comment event parse failed — skipping",
        )
        return
      }
      const value = parsed.data
      if (!value.media?.id) {
        logger.warn(
          { commentId: value.id },
          "comment webhook missing media.id — skipping",
        )
        return
      }
      await queue?.add("incomingComment", {
        type: "incomingComment",
        data: {
          integrationType: "instagram",
          integrationIdentifier: entry.id,
          commentData: {
            commentId: value.id,
            postId: value.media.id,
            parentId: value.parent_id,
            fromId: value.from.id,
            fromName: value.from.username ?? value.from.id,
            message: value.text,
            createdTime: entry.time,
          },
        },
      })
      return
    }

    // Handle DM messaging events
    const messaging = entry.messaging
    if (!messaging || messaging.length === 0) {
      return
    }

    if (messaging[0]?.read) {
      await queue?.add("contactMarkAsRead", {
        type: "contactMarkAsRead",
        data: {
          integrationType: "instagram",
          integrationIdentifier: entry.id,
          sourceConversationId: messaging[0].sender.id,
          payload: webhookData,
        },
      })
      return
    }

    // Skip if this message is not a message or postback
    if (!(messaging[0].message || messaging[0].postback)) {
      return
    }

    if (
      messaging[0].message?.is_echo === true &&
      messaging[0].message?.metadata === INSTAGRAM_MESSAGE_METADATA
    ) {
      // Skip if this message is from our own bot
      return
    }

    // Calculate integration identifier
    const integrationIdentifier = messaging[0].message?.is_echo
      ? messaging[0].sender.id
      : messaging[0].recipient.id

    await queue?.add("incomingMessage", {
      type: "incomingMessage",
      data: {
        integrationType: "instagram",
        integrationIdentifier,
        payload: webhookData,
      },
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error processing webhook"

    throw new InstagramWebhookException(
      `Failed to process webhook event: ${errorMessage}`,
      await req.text().catch(() => null),
    )
  }
}

const handleSubscriptionEvent = ({
  config,
  req,
}: HandleRequestProps<InstagramConfig>): string => {
  const validation = z.object({
    "hub.mode": z.literal("subscribe"),
    "hub.verify_token": z.literal(config.verifyToken),
    "hub.challenge": z.string().min(1),
  })

  const searchParams = new URL(req.url).searchParams
  const { data } = validation.safeParse(Object.fromEntries(searchParams))

  if (!data) {
    throw new InstagramWebhookException(
      "Invalid webhook verification parameters",
    )
  }

  return data["hub.challenge"]
}

export const webhookHandler = async ({
  config,
  req,
  queue,
}: HandleRequestProps<InstagramConfig>): Promise<string> => {
  try {
    if (req.method === "GET") {
      return handleSubscriptionEvent({ config, req })
    }

    if (req.method === "POST") {
      await handleWebhookEvent(req, config, queue as ContextQueue)

      return "ok"
    }

    throw new InstagramWebhookException(
      `Unsupported HTTP method: ${req.method}`,
    )
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown webhook error"

    throw new InstagramWebhookException(
      `Webhook processing failed: ${errorMessage}`,
    )
  }
}

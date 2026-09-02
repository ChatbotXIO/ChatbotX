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

    const parsedWebhook = instagramWebhookEventSchema.safeParse(
      JSON.parse(body),
    )
    if (!parsedWebhook.success) {
      logger.warn(
        {
          issues: parsedWebhook.error.issues.map(({ code, path }) => ({
            code,
            path,
          })),
        },
        "instagram facebook webhook payload unrecognized — skipping",
      )
      return
    }
    const webhookData = parsedWebhook.data
    if (webhookData.object !== "instagram") {
      throw new InstagramWebhookException(
        `Unsupported webhook object type: ${webhookData.object}`,
        webhookData,
      )
    }

    // Meta batches multiple entries — and multiple messaging events per
    // entry — into a single webhook POST (e.g. a contact sending several DMs
    // quickly). Every entry/event must be processed, not just the first.
    for (const entry of webhookData.entry) {
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
          continue
        }
        const value = parsed.data
        if (!value.media?.id) {
          logger.warn(
            { commentId: value.id },
            "comment webhook missing media.id — skipping",
          )
          continue
        }
        await queue?.add("incomingComment", {
          type: "incomingComment",
          data: {
            integrationType: "instagramFacebook",
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
        continue
      }

      // Handle DM messaging events
      const messaging = entry.messaging
      if (!messaging || messaging.length === 0) {
        continue
      }

      for (const messagingEvent of messaging) {
        // Reshape to a single-entry, single-messaging-event payload so
        // downstream consumers — which only ever read entry[0]/messaging[0] —
        // see exactly the one event this job is for.
        const singleEventPayload = {
          object: webhookData.object,
          entry: [
            { id: entry.id, time: entry.time, messaging: [messagingEvent] },
          ],
        }

        if (messagingEvent.read) {
          await queue?.add("contactMarkAsRead", {
            type: "contactMarkAsRead",
            data: {
              integrationType: "instagram",
              integrationIdentifier: entry.id,
              sourceConversationId: messagingEvent.sender.id,
              payload: singleEventPayload,
            },
          })
          continue
        }

        if (messagingEvent.reaction) {
          await queue?.add("messageReaction", {
            type: "messageReaction",
            data: {
              integrationType: "instagram",
              integrationIdentifier: entry.id,
              messageId: messagingEvent.reaction.mid,
              action: messagingEvent.reaction.action,
              emoji: messagingEvent.reaction.emoji,
              contactSourceId: messagingEvent.sender.id,
            },
          })
          continue
        }

        if (messagingEvent.message?.is_deleted) {
          await queue?.add("deleteIncomingMessage", {
            type: "deleteIncomingMessage",
            data: {
              integrationType: "instagram",
              integrationIdentifier: entry.id,
              messageId: messagingEvent.message.mid,
            },
          })
          continue
        }

        // Skip if this event is not a message, postback, or standalone referral
        if (
          !(
            messagingEvent.message ||
            messagingEvent.postback ||
            messagingEvent.referral
          )
        ) {
          continue
        }

        if (
          messagingEvent.message?.is_echo === true &&
          messagingEvent.message?.metadata === INSTAGRAM_MESSAGE_METADATA
        ) {
          // Skip if this message is from our own bot
          continue
        }

        // Calculate integration identifier
        const integrationIdentifier = messagingEvent.message?.is_echo
          ? messagingEvent.sender.id
          : messagingEvent.recipient.id

        await queue?.add("incomingMessage", {
          type: "incomingMessage",
          data: {
            integrationType: "instagram",
            integrationIdentifier,
            payload: singleEventPayload,
          },
        })
      }
    }
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

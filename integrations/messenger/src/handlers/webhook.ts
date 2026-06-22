import crypto from "node:crypto"
import type { ContextQueue, HandleRequestProps } from "@chatbotx.io/sdk"
import z from "zod"
import { MessengerWebhookException } from "../exception"
import {
  incomingWebhookEventSchema,
  MESSENGER_MESSAGE_METADATA,
  type MessengerConfig,
  messengerFeedCommentValueSchema,
} from "../schema"

const verifyWebhookSignature = (
  payload: string,
  signature: string,
  clientSecret: string,
): boolean => {
  try {
    const elements = signature.split("=")
    if (elements.length !== 2) {
      return false
    }

    const signatureHash = elements[1]

    const expectedHash = crypto
      .createHmac("sha256", clientSecret)
      .update(payload)
      .digest("hex")

    return signatureHash === expectedHash
  } catch {
    return false
  }
}

const handleWebhookEvent = async (
  req: Request,
  config: MessengerConfig,
  queue: ContextQueue,
): Promise<void> => {
  try {
    const body = await req.text()
    if (!body) {
      throw new MessengerWebhookException("Empty webhook payload")
    }

    const signature = req.headers.get("x-hub-signature-256") ?? ""
    if (!signature) {
      throw new MessengerWebhookException("Missing webhook signature")
    }

    const isValidSignature = verifyWebhookSignature(
      body,
      signature,
      config.clientSecret,
    )

    if (!isValidSignature) {
      throw new MessengerWebhookException("Invalid webhook signature")
    }

    const webhookData = incomingWebhookEventSchema.parse(JSON.parse(body))
    if (webhookData.object !== "page") {
      throw new MessengerWebhookException(
        `Unsupported webhook object type: ${webhookData.object}`,
        webhookData,
      )
    }

    const entry = webhookData.entry[0]

    const labelChange = entry.changes?.find(
      (c: { field: string }) => c.field === "inbox_labels",
    )
    if (labelChange) {
      await queue?.add("channelLabelChange", {
        type: "channelLabelChange",
        data: {
          integrationType: "messenger",
          integrationIdentifier: entry.id,
          payload: webhookData,
        },
      })
      return
    }

    const feedChange = entry.changes?.find(
      (c: { field: string }) => c.field === "feed",
    )
    if (feedChange) {
      const parsed = messengerFeedCommentValueSchema.safeParse(feedChange.value)
      if (parsed.success) {
        const value = parsed.data
        if (value.verb === "add" && value.from.id !== entry.id) {
          // New comment from an external user — route to inbox
          await queue?.add("incomingComment", {
            type: "incomingComment",
            data: {
              integrationType: "messenger",
              integrationIdentifier: entry.id,
              commentData: {
                commentId: value.comment_id,
                postId: value.post_id,
                parentId: value.parent_id,
                fromId: value.from.id,
                fromName: value.from.name,
                message: value.message,
                createdTime: value.created_time,
              },
            },
          })
        } else if (value.verb === "edited" && value.from.id !== entry.id) {
          // Commenter edited their comment — sync the new text to the DB
          await queue?.add("updateIncomingComment", {
            type: "updateIncomingComment",
            data: {
              integrationType: "messenger",
              integrationIdentifier: entry.id,
              commentId: value.comment_id,
              newText: value.message ?? "",
            },
          })
        } else if (value.verb === "remove") {
          // Commenter or page deleted the comment — soft-delete in the DB
          await queue?.add("deleteIncomingComment", {
            type: "deleteIncomingComment",
            data: {
              integrationType: "messenger",
              integrationIdentifier: entry.id,
              commentId: value.comment_id,
            },
          })
        }
      }
      return
    }

    if (!entry.messaging || entry.messaging.length === 0) {
      return
    }

    if (entry.messaging[0]?.read) {
      await queue?.add("contactMarkAsRead", {
        type: "contactMarkAsRead",
        data: {
          integrationType: "messenger",
          integrationIdentifier: entry.id,
          sourceConversationId: entry.messaging[0].sender.id,
          payload: webhookData,
        },
      })
      return
    }

    // Calculate integration identifier
    const integrationIdentifier = entry.messaging[0].message?.is_echo
      ? entry.messaging[0].sender.id
      : entry.messaging[0].recipient.id

    if (entry.messaging[0].postback) {
      await queue?.add("incomingMessage", {
        type: "incomingMessage",
        data: {
          integrationType: "messenger",
          integrationIdentifier,
          payload: webhookData,
          action: entry.messaging[0].postback.payload,
        },
      })
      return
    }

    if (
      entry.messaging[0].message?.is_echo === true &&
      entry.messaging[0].message?.metadata === MESSENGER_MESSAGE_METADATA
    ) {
      // Skip other echoes that passed schema validation
      return
    }

    await queue?.add("incomingMessage", {
      type: "incomingMessage",
      data: {
        integrationType: "messenger",
        integrationIdentifier,
        payload: webhookData,
      },
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error processing webhook"

    throw new MessengerWebhookException(
      `Failed to process webhook event: ${errorMessage}`,
      await req.text().catch(() => null),
    )
  }
}

const handleSubscriptionEvent = ({
  config,
  req,
}: HandleRequestProps<MessengerConfig>): string => {
  const validation = z.object({
    "hub.mode": z.literal("subscribe"),
    "hub.verify_token": z.literal(config.verifyToken),
    "hub.challenge": z.string().min(1),
  })

  const searchParams = new URL(req.url).searchParams
  const { data } = validation.safeParse(Object.fromEntries(searchParams))

  if (!data) {
    throw new MessengerWebhookException(
      "Invalid webhook verification parameters",
    )
  }

  return data["hub.challenge"]
}

export const webhookHandler = async ({
  config,
  req,
  queue,
}: HandleRequestProps<MessengerConfig>): Promise<string> => {
  try {
    if (req.method === "GET") {
      return handleSubscriptionEvent({ config, req })
    }

    if (req.method === "POST") {
      await handleWebhookEvent(req, config, queue as ContextQueue)

      return "ok"
    }

    throw new MessengerWebhookException(
      `Unsupported HTTP method: ${req.method}`,
    )
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown webhook error"

    throw new MessengerWebhookException(
      `Webhook processing failed: ${errorMessage}`,
    )
  }
}

import {
  type ContextQueue,
  type HandleRequestProps,
  SdkException,
} from "@chatbotx.io/sdk"
import { sha256Hex, timingSafeStringEqual } from "../lib/webhook"
import type { ZaloConfig } from "../schema/definition"
import {
  TAG_EVENT_NAMES,
  type ZaloWebhookEvent,
  zaloWebhookEventSchema,
} from "../schema/webhook"

const TAG_EVENT_NAME_SET = new Set<string>(TAG_EVENT_NAMES)

const _verifyWebhookSignature = async (
  payload: ZaloWebhookEvent,
  signature: string,
  config: ZaloConfig,
): Promise<boolean> => {
  try {
    const elements = signature.split("=")
    if (elements.length !== 2) {
      return false
    }

    const signatureHash = elements[1]

    const appId = payload.app_id
    const timeStamp = payload.timestamp
    const dataString = JSON.stringify(payload)
    const content = appId + dataString + timeStamp + config.verifyToken
    const expectedHash = await sha256Hex(content)

    return timingSafeStringEqual(signatureHash, expectedHash)
  } catch {
    return false
  }
}

const handleWebhookEvent = async (
  req: Request,
  config: ZaloConfig,
  queue: ContextQueue,
): Promise<void> => {
  try {
    const body = await req.json()
    if (!body) {
      throw new SdkException("Empty webhook payload")
    }

    const webhookData = zaloWebhookEventSchema.parse(body)

    // Tag events carry oa_id + tag (no sender/recipient). Route them before
    // the message-event handling below.
    if (TAG_EVENT_NAME_SET.has(webhookData.event_name) && webhookData.oa_id) {
      await queue.add("channelLabelChange", {
        type: "channelLabelChange",
        data: {
          integrationType: "zalo",
          integrationIdentifier: webhookData.oa_id,
          payload: webhookData,
        },
      })
      return
    }

    // const signature = req.headers.get("X-ZEvent-Signature") ?? ""
    // if (!signature) {
    //   throw new SdkException("Missing webhook signature")
    // }
    // const isValidSignature = await _verifyWebhookSignature(
    //   webhookData,
    //   signature,
    //   config,
    // )
    // if (!isValidSignature) {
    //   throw new SdkException("Invalid webhook signature")
    // }

    if (webhookData.app_id !== config.clientId) {
      throw new SdkException("Invalid app_id in webhook payload")
    }

    // Message events always carry sender/recipient.
    if (!(webhookData.sender && webhookData.recipient)) {
      throw new SdkException("Missing sender/recipient in message event")
    }

    if (webhookData.event_name === "user_seen_message") {
      await queue.add("contactMarkAsRead", {
        type: "contactMarkAsRead",
        data: {
          integrationType: "zalo",
          integrationIdentifier: webhookData.recipient.id,
          sourceConversationId: webhookData.sender.id,
          payload: webhookData,
        },
      })
    } else {
      const integrationIdentifier = webhookData.event_name.includes("user_send")
        ? webhookData.recipient.id
        : webhookData.sender.id

      await queue.add("incomingMessage", {
        type: "incomingMessage",
        data: {
          integrationType: "zalo",
          integrationIdentifier,
          payload: webhookData,
        },
      })
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error processing webhook"

    throw new SdkException(`Failed to process webhook event: ${errorMessage}`)
  }
}

export const webhookHandler = async ({
  config,
  req,
  queue,
}: HandleRequestProps<ZaloConfig>): Promise<string> => {
  try {
    if (req.method === "POST") {
      await handleWebhookEvent(req, config, queue as ContextQueue)

      return "ok"
    }

    throw new SdkException(`Unsupported HTTP method: ${req.method}`)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown webhook error"

    throw new SdkException(`Webhook processing failed: ${errorMessage}`)
  }
}

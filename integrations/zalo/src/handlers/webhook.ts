import {
  type ContextQueue,
  type HandleRequestProps,
  SdkException,
} from "@chatbotx.io/sdk"
import crypto from "crypto"
import type { ZaloConfig } from "../schema/definition"
import {
  type ZaloWebhookEvent,
  zaloWebhookEventSchema,
} from "../schema/webhook"

const _verifyWebhookSignature = (
  payload: ZaloWebhookEvent,
  signature: string,
  config: ZaloConfig,
): boolean => {
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
    const expectedHash = crypto
      .createHash("sha256")
      .update(content, "utf8")
      .digest("hex")

    return signatureHash === expectedHash
  } catch (_error) {
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

    // const signature = req.headers.get("X-ZEvent-Signature") ?? ""
    // if (!signature) {
    //   throw new SdkException("Missing webhook signature")
    // }
    // const isValidSignature = verifyWebhookSignature(
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

    if (webhookData.event_name === "user_seen_message") {
      await queue.add("readMessage", {
        type: "readMessage",
        data: {
          integrationType: "zalo",
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

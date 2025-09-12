import {
  type ContextQueue,
  type HandleRequestProps,
  SdkException,
} from "@aha.chat/sdk"
import type { MessengerConfig, MessengerWebhookEvent } from "../schemas"

const verifyWebhookSignature = async (
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> => {
  try {
    // Remove 'sha256=' prefix from signature
    const cleanSignature = signature.replace("sha256=", "")

    // Create HMAC using Web Crypto API
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const payloadData = encoder.encode(payload)

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      payloadData,
    )
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")

    // Timing-safe comparison
    return cleanSignature === expectedSignature
  } catch (_error) {
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
      throw new SdkException("Empty webhook payload")
    }

    const signature = req.headers.get("x-hub-signature-256") ?? ""
    if (!signature) {
      throw new SdkException("Missing webhook signature")
    }

    const isValidSignature = await verifyWebhookSignature(
      body,
      signature,
      config.clientSecret,
    )

    if (!isValidSignature) {
      throw new SdkException("Invalid webhook signature")
    }

    const webhookData = JSON.parse(body) as MessengerWebhookEvent
    if (webhookData.object !== "page") {
      throw new SdkException(
        `Unsupported webhook object type: ${webhookData.object}`,
      )
    }

    await queue?.add("RECEIVE_MESSAGE", {
      type: "RECEIVE_MESSAGE",
      data: {
        integrationName: "messenger",
        payload: webhookData,
      },
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error processing webhook"

    throw new SdkException(`Failed to process webhook event: ${errorMessage}`)
  }
}

const handleSubscriptionEvent = ({
  config,
  req,
}: HandleRequestProps<MessengerConfig>): string => {
  const url = new URL(req.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === config.webhookVerifyToken) {
    return challenge || ""
  }

  throw new SdkException("Invalid webhook verification parameters")
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
      const res = await handleWebhookEvent(req, config, queue as ContextQueue)
      return JSON.stringify(res)
    }

    throw new SdkException(`Unsupported HTTP method: ${req.method}`)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown webhook error"

    throw new SdkException(`Webhook processing failed: ${errorMessage}`)
  }
}

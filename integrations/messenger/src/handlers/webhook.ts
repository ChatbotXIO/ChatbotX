import {
  type ContextQueue,
  type HandleRequestProps,
  SdkException,
} from "@aha.chat/sdk"
import crypto from "crypto"
import z from "zod"
import {
  MESSENGER_MESSAGE_METADATA,
  type MessengerConfig,
  type MessengerWebhookEvent,
} from "../schemas"

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

    const isValidSignature = verifyWebhookSignature(
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

    // Skip if this messsage is from our own bot
    if (
      webhookData.entry[0].messaging[0].message?.metadata ===
      MESSENGER_MESSAGE_METADATA
    ) {
      return
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
  const validation = z.object({
    "hub.mode": z.literal("subscribe"),
    "hub.verify_token": z.literal(config.verifyToken),
    "hub.challenge": z.string().min(1),
  })

  const searchParams = new URL(req.url).searchParams
  const { data } = validation.safeParse(Object.fromEntries(searchParams))

  if (!data) {
    throw new SdkException("Invalid webhook verification parameters")
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

    throw new SdkException(`Unsupported HTTP method: ${req.method}`)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown webhook error"

    throw new SdkException(`Webhook processing failed: ${errorMessage}`)
  }
}

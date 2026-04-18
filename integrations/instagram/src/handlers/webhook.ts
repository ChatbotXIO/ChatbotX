import type { ContextQueue, HandleRequestProps } from "@chatbotx.io/sdk"
import crypto from "crypto"
import z from "zod"
import { InstagramWebhookException } from "../exception"
import {
  INSTAGRAM_MESSAGE_METADATA,
  type InstagramConfig,
  instagramWebhookEventSchema,
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

    const isValidSignature = verifyWebhookSignature(
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

    if (webhookData.entry[0].messaging[0]?.read) {
      await queue?.add("contactMarkAsRead", {
        type: "contactMarkAsRead",
        data: {
          integrationType: "instagram",
          integrationIdentifier: webhookData.entry[0].id,
          sourceConversationId: webhookData.entry[0].messaging[0].sender.id,
          payload: webhookData,
        },
      })
      return
    }

    // Skip if this message is not a message or postback
    if (
      !(
        webhookData.entry[0].messaging[0].message ||
        webhookData.entry[0].messaging[0].postback
      )
    ) {
      return
    }

    if (
      webhookData.entry[0].messaging[0].message?.is_echo === true &&
      webhookData.entry[0].messaging[0].message?.metadata ===
        INSTAGRAM_MESSAGE_METADATA
    ) {
      // Skip if this message is from our own bot
      return
    }

    // Calculate integration identifier
    const integrationIdentifier = webhookData.entry[0].messaging[0].message
      ?.is_echo
      ? webhookData.entry[0].messaging[0].sender.id
      : webhookData.entry[0].messaging[0].recipient.id

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

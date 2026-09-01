import type { ContextQueue, HandleRequestProps } from "@chatbotx.io/sdk"
import { z } from "zod"
import { ThreadsException } from "../exception"
import { logger } from "../lib/logger"
import { hmacSha256Hex, timingSafeStringEqual } from "../lib/webhook"
import type { ThreadsConfig } from "../schema"

const threadsReplyValueSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  text: z.string().optional(),
  replied_to: z.object({ id: z.string().min(1) }).optional(),
  root_post: z.object({
    id: z.string().min(1),
    owner_id: z.string().min(1),
    username: z.string().min(1),
  }),
  timestamp: z.string().optional(),
})

const threadsWebhookEntrySchema = z.object({
  field: z.string().min(1),
  value: threadsReplyValueSchema,
})

const threadsWebhookPayloadSchema = z.object({
  app_id: z.string().min(1),
  topic: z.string().min(1),
  target_id: z.string().min(1),
  time: z.number().int().nonnegative(),
  subscription_id: z.string().min(1),
  // Meta sends `values` as an array on the wire, while the official docs
  // document a single object. Accept both shapes and normalize to an array.
  values: z
    .union([z.array(threadsWebhookEntrySchema), threadsWebhookEntrySchema])
    .transform((values) => (Array.isArray(values) ? values : [values])),
})

const verifyWebhookSignature = async (
  payload: string,
  signature: string,
  clientSecret: string,
): Promise<boolean> => {
  const elements = signature.split("=")
  if (elements.length !== 2 || elements[0] !== "sha256") {
    return false
  }

  const expectedHash = await hmacSha256Hex(clientSecret, payload)
  return timingSafeStringEqual(elements[1], expectedHash)
}

const toEpochSeconds = (
  timestamp: string | undefined,
  fallback: number,
): number => {
  if (!timestamp) {
    return fallback
  }

  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) {
    return fallback
  }

  return Math.floor(parsed / 1000)
}

const describeType = (value: unknown): string => {
  if (Array.isArray(value)) {
    return "array"
  }
  if (value === null) {
    return "null"
  }
  return typeof value
}

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return
  }
  return value as Record<string, unknown>
}

const topLevelKeysOf = (value: unknown): string[] =>
  Object.keys(asRecord(value) ?? {})

const handleSubscriptionEvent = ({
  config,
  req,
}: HandleRequestProps<ThreadsConfig>): string => {
  const validation = z.object({
    "hub.mode": z.literal("subscribe"),
    "hub.verify_token": z.literal(config.verifyToken),
    "hub.challenge": z.string().min(1),
  })

  const searchParams = new URL(req.url).searchParams
  const parsed = validation.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) {
    throw new ThreadsException("Invalid webhook verification parameters")
  }

  return parsed.data["hub.challenge"]
}

const handleWebhookEvent = async (
  req: Request,
  config: ThreadsConfig,
  queue: ContextQueue,
): Promise<void> => {
  const body = await req.text()
  if (!body) {
    throw new ThreadsException("Empty webhook payload")
  }

  const signature = req.headers.get("x-hub-signature-256") ?? ""
  if (!signature) {
    throw new ThreadsException("Missing webhook signature")
  }

  const isValidSignature = await verifyWebhookSignature(
    body,
    signature,
    config.clientSecret,
  )
  if (!isValidSignature) {
    throw new ThreadsException("Invalid webhook signature")
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(body)
  } catch {
    // Diagnostic path only: the raw body is logged when the payload cannot be
    // understood, so the actual Meta wire format can be inspected. Recognized
    // payloads never reach here and never have their body logged.
    logger.warn(
      {
        reason: "invalid_json",
        rawBody: body,
      },
      "threads webhook payload unrecognized — skipping",
    )
    return
  }

  const parsedPayload = threadsWebhookPayloadSchema.safeParse(parsedJson)
  if (!parsedPayload.success) {
    // Diagnostic path only: the raw body is logged when the payload cannot be
    // understood, so the actual Meta wire format can be inspected. Recognized
    // payloads never reach here and never have their body logged.
    logger.warn(
      {
        reason: "schema_mismatch",
        issues: parsedPayload.error.issues.map(({ code, path }) => ({
          code,
          path,
        })),
        rawBody: body,
        payloadKeys: topLevelKeysOf(parsedJson),
        valuesType: describeType(asRecord(parsedJson)?.values),
      },
      "threads webhook payload unrecognized — skipping",
    )
    return
  }

  const payload = parsedPayload.data

  if (payload.app_id !== config.clientId) {
    throw new ThreadsException(
      "Webhook app_id does not match configured clientId",
    )
  }

  if (payload.topic !== "moderate") {
    return
  }

  const replies = payload.values.filter(
    ({ field, value }) =>
      field === "replies" &&
      value.username.toLowerCase() !== value.root_post.username.toLowerCase(),
  )

  await Promise.all(
    replies.map(({ value }) =>
      queue.add("incomingComment", {
        type: "incomingComment",
        data: {
          integrationType: "threads",
          integrationIdentifier: value.root_post.owner_id,
          commentData: {
            commentId: value.id,
            postId: value.root_post.id,
            parentId: value.replied_to?.id,
            fromId: value.username.toLowerCase(),
            fromName: value.username,
            message: value.text,
            createdTime: toEpochSeconds(value.timestamp, payload.time),
          },
        },
      }),
    ),
  )
}

export const webhookHandler = async (
  props: HandleRequestProps<ThreadsConfig>,
) => {
  if (props.req.method === "GET") {
    return handleSubscriptionEvent(props)
  }

  if (props.req.method === "POST") {
    await handleWebhookEvent(
      props.req,
      props.config,
      props.queue as ContextQueue,
    )
    return "ok"
  }

  throw new ThreadsException(`Unsupported HTTP method: ${props.req.method}`)
}

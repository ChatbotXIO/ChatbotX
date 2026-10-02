import type { ContextQueue, HandleRequestProps } from "@chatbotx.io/sdk"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import z from "zod"
import { MessengerWebhookException } from "../exception"
import {
  classifyMessagingRoutingItem,
  isAiHandbackNotice,
  parseStandbyDelivery,
  THREAD_CONTROL_EVENT_JOB_NAME,
  THREAD_CONTROL_JOB_ID_PREFIX,
  type ThreadControlJobPayload,
} from "../lib/conversation-routing"
import { logger } from "../lib/logger"
import { hmacSha256Hex, timingSafeStringEqual } from "../lib/webhook"
import {
  type IncomingWebhookEntry,
  incomingWebhookEntrySchema,
  incomingWebhookEventSchema,
  MESSENGER_MESSAGE_METADATA,
  type MessengerConfig,
  messengerFeedCommentValueSchema,
  messengerLeadgenValueSchema,
  messengerMessagingEventSchema,
} from "../schema"

/** One Conversation Routing item to enqueue as a `threadControlEvent` job. */
export type ConversationRoutingPayload = ThreadControlJobPayload & {
  pageId: string
  /** `mid` used in the job id; `null` = hash the body instead. */
  dedupeKey: string | null
}

const toBullMqSafeIdSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_")

/**
 * Standby items that are worth a job: a message or a postback. Reads and
 * deliveries on standby are receipts for another app's traffic.
 */
const isStandbyRoutingItem = (item: unknown): boolean =>
  typeof item === "object" &&
  item !== null &&
  // The Business-AI hand-back notice is acted on where it is delivered to the
  // thread's owner (`messaging[]`); its standby copy carries nothing to store.
  !isAiHandbackNotice(item) &&
  ("message" in item || "postback" in item)

/**
 * The Conversation Routing items of one entry: `messaging[]` handover /
 * request / app_roles structures and `standby[]` deliveries. Each item is
 * isolated: a malformed one is logged and skipped, never dropping the rest of
 * the batch. Ordinary `messaging[]` items are NOT routing items (inbound
 * classification happens in incoming-message). Never throws.
 */
export const extractConversationRoutingPayloads = (
  object: string,
  entry: IncomingWebhookEntry,
): ConversationRoutingPayload[] => {
  const payloads: ConversationRoutingPayload[] = []

  for (const item of entry.messaging ?? []) {
    const kind = classifyMessagingRoutingItem(item)
    if (kind) {
      payloads.push({ kind, pageId: entry.id, body: item, dedupeKey: null })
    }
  }

  for (const item of entry.standby ?? []) {
    try {
      if (!isStandbyRoutingItem(item)) {
        logger.debug("Messenger standby receipt dropped")
        continue
      }
      const delivery = parseStandbyDelivery(item)
      if (!delivery) {
        continue
      }
      payloads.push({
        kind: "standbyMessage",
        pageId: entry.id,
        dedupeKey: delivery.mid ?? null,
        body: {
          object,
          entry: [
            {
              id: entry.id,
              time: entry.time,
              // Consumed by receiveMessage (Business-AI standby owner).
              ...(entry.hop_context ? { hop_context: entry.hop_context } : {}),
              standby: [item],
            },
          ],
        },
      })
    } catch (err) {
      logger.error({ err }, "Messenger standby item skipped")
    }
  }

  return payloads
}

/**
 * A routing job carries one-shot side effects (the handover resume flow) that
 * Meta will not redeliver once the webhook answered 200, so it rides out a
 * transient Redis/DB failure: 5 attempts, 10s exponential backoff. Same
 * options as the other channels' routing jobs. `removeOnFail` frees the
 * deterministic jobId so a redelivery can reprocess a failed job.
 */
const THREAD_CONTROL_EVENT_JOB_OPTIONS = {
  removeOnFail: true,
  attempts: 5,
  backoff: { type: "exponential", delay: 10_000 },
} as const

/** Deterministic jobId (`prefix-page-mid|bodyHash`) so a redelivery re-adds nothing. */
export const buildThreadControlJobId = async (
  payload: ConversationRoutingPayload,
): Promise<string> => {
  const suffix = payload.dedupeKey
    ? toBullMqSafeIdSegment(payload.dedupeKey)
    : await sha256Hex(JSON.stringify(payload.body))
  return `${THREAD_CONTROL_JOB_ID_PREFIX[payload.kind]}-${toBullMqSafeIdSegment(payload.pageId)}-${suffix}`
}

const enqueueConversationRoutingPayloads = async (
  queue: ContextQueue,
  payloads: ConversationRoutingPayload[],
): Promise<void> => {
  for (const payload of payloads) {
    const job: ThreadControlJobPayload = {
      kind: payload.kind,
      body: payload.body,
    }
    await queue?.add(
      THREAD_CONTROL_EVENT_JOB_NAME,
      {
        type: THREAD_CONTROL_EVENT_JOB_NAME,
        data: {
          integrationType: "messenger",
          integrationIdentifier: payload.pageId,
          payload: job,
        },
      },
      {
        jobId: await buildThreadControlJobId(payload),
        ...THREAD_CONTROL_EVENT_JOB_OPTIONS,
      },
    )
  }
}

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

    const isValidSignature = await verifyWebhookSignature(
      body,
      signature,
      config.clientSecret,
    )

    if (!isValidSignature) {
      throw new MessengerWebhookException("Invalid webhook signature")
    }

    const parsedWebhook = incomingWebhookEventSchema.safeParse(JSON.parse(body))
    if (!parsedWebhook.success) {
      logger.warn(
        {
          issues: parsedWebhook.error.issues.map(({ code, path }) => ({
            code,
            path,
          })),
        },
        "messenger webhook payload unrecognized — skipping",
      )
      return
    }
    const webhookData = parsedWebhook.data
    if (webhookData.object !== "page") {
      throw new MessengerWebhookException(
        `Unsupported webhook object type: ${webhookData.object}`,
        webhookData,
      )
    }

    // Meta batches multiple entries — and multiple messaging events per
    // entry — into a single webhook POST (e.g. a contact sending several DMs
    // quickly). Every entry/event must be processed, not just the first.
    for (const rawEntry of webhookData.entry) {
      const parsedEntry = incomingWebhookEntrySchema.safeParse(rawEntry)
      if (!parsedEntry.success) {
        logger.warn(
          { err: parsedEntry.error },
          "messenger webhook entry skipped: malformed entry",
        )
        continue
      }
      const entry = parsedEntry.data

      await enqueueConversationRoutingPayloads(
        queue,
        extractConversationRoutingPayloads(webhookData.object, entry),
      )

      const labelChange = entry.changes?.find(
        (c: { field: string }) => c.field === "inbox_labels",
      )
      if (labelChange) {
        await queue?.add("channelLabelChange", {
          type: "channelLabelChange",
          data: {
            integrationType: "messenger",
            integrationIdentifier: entry.id,
            payload: { object: webhookData.object, entry: [entry] },
          },
        })
        continue
      }

      const feedChanges =
        entry.changes?.filter((c: { field: string }) => c.field === "feed") ??
        []
      if (feedChanges.length > 0) {
        for (const feedChange of feedChanges) {
          const parsed = messengerFeedCommentValueSchema.safeParse(
            feedChange.value,
          )
          if (!parsed.success) {
            logger.warn(
              { issues: parsed.error.issues, value: feedChange.value },
              "Unrecognized feed webhook payload",
            )
            continue
          }
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
                  videoUrl: value.video,
                  tags: value.message_tags?.map(({ id, name }) => ({
                    id,
                    name,
                  })),
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
        continue
      }

      const leadgenChanges =
        entry.changes?.filter(
          (c: { field: string }) => c.field === "leadgen",
        ) ?? []
      if (leadgenChanges.length > 0) {
        for (const leadgenChange of leadgenChanges) {
          const parsed = messengerLeadgenValueSchema.safeParse(
            leadgenChange.value,
          )
          if (!parsed.success) {
            logger.warn(
              { issues: parsed.error.issues, value: leadgenChange.value },
              "Unrecognized leadgen webhook payload",
            )
            continue
          }
          const value = parsed.data
          await queue?.add("processLeadgen", {
            type: "processLeadgen",
            data: {
              integrationType: "messenger",
              integrationIdentifier: entry.id,
              leadgenId: value.leadgen_id,
              formId: value.form_id,
            },
          })
        }
        continue
      }

      if (!entry.messaging || entry.messaging.length === 0) {
        continue
      }

      for (const rawMessagingEvent of entry.messaging) {
        // Handover / request / app_roles items were enqueued above.
        if (classifyMessagingRoutingItem(rawMessagingEvent)) {
          continue
        }
        const parsedEvent =
          messengerMessagingEventSchema.safeParse(rawMessagingEvent)
        if (!parsedEvent.success) {
          logger.warn(
            { err: parsedEvent.error },
            "messenger messaging event skipped: malformed item",
          )
          continue
        }
        const messagingEvent = parsedEvent.data

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
              integrationType: "messenger",
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
              integrationType: "messenger",
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
              integrationType: "messenger",
              integrationIdentifier: entry.id,
              messageId: messagingEvent.message.mid,
            },
          })
          continue
        }

        // Skip events that carry none of message/postback/referral (e.g. a
        // pure delivery receipt) — nothing downstream can process them.
        if (
          !(
            messagingEvent.message ||
            messagingEvent.postback ||
            messagingEvent.referral
          )
        ) {
          continue
        }

        // Calculate integration identifier
        const integrationIdentifier = messagingEvent.message?.is_echo
          ? messagingEvent.sender.id
          : messagingEvent.recipient.id

        if (messagingEvent.postback) {
          await queue?.add("incomingMessage", {
            type: "incomingMessage",
            data: {
              integrationType: "messenger",
              integrationIdentifier,
              payload: singleEventPayload,
              action: messagingEvent.postback.payload,
            },
          })
          continue
        }

        if (
          messagingEvent.message?.is_echo === true &&
          messagingEvent.message?.metadata === MESSENGER_MESSAGE_METADATA
        ) {
          // Skip other echoes that passed schema validation
          continue
        }

        await queue?.add("incomingMessage", {
          type: "incomingMessage",
          data: {
            integrationType: "messenger",
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

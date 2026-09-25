import { createHash } from "node:crypto"
import {
  type BuildContextIntegrationRow,
  buildContext,
  contactInboxService,
  conversationService,
  createPlatformData,
  type EchoBatchItem,
  type EchoBatchResult,
  messengerEchoBatchService,
  type PersistedTextEchoEntry,
  resolveBroadcastSecret,
  resolveTenantSettings,
  withBlockedOwnerGuard,
  workspaceService,
} from "@chatbotx.io/business"
import type {
  MessengerAuthValue,
  MessengerMessagingEvent,
} from "@chatbotx.io/integration-messenger"
import { distributedLock, LockAcquisitionError } from "@chatbotx.io/redis"
import type { EchoParseResult } from "@chatbotx.io/sdk"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
  LowJobAction,
  type LowJobMessengerEchoFlush,
  lowQueue,
} from "@chatbotx.io/worker-config"
import { echoCollector } from "@chatbotx.io/worker-config/messenger-echo"
import type { Job } from "bullmq"
import { z } from "zod"
import { env } from "../../env"
import { logger } from "../../lib/logger"
import {
  allIntegrations,
  IntegrationNotFoundError,
  integrationService,
} from "../../services/integrations"
import { calculateMessengerEchoProcessingTtlSeconds } from "./messenger-echo-processing-lease"
import { isEchoOfOwnSend } from "./received-message"

type MessengerEchoCollectorItem = {
  entryId: string
  entryTime: number
  messaging: MessengerMessagingEvent
}

type EchoFlushJob = Pick<Job, "attemptsMade" | "id" | "opts">
type ParsedEchoBatchItem = EchoBatchItem<MessengerEchoCollectorItem>

const messengerEchoCollectorItemSchema = z.object({
  entryId: z.string(),
  entryTime: z.number(),
  messaging: z.object({}).passthrough(),
})

const LOCK_TIMEOUT_SECONDS = 60
// Two serial worst-case phases: ceil(batch/profile concurrency) * Graph timeout
// plus ceil(total attachments/attachment concurrency) * media timeout;
// double the total as a fixed safety margin and round up to whole seconds.
const PROCESSING_TTL_SECONDS = calculateMessengerEchoProcessingTtlSeconds(
  env.MESSENGER_ECHO_FLUSH_BATCH,
)

const isLockAcquisitionError = (error: unknown): boolean =>
  error instanceof LockAcquisitionError ||
  (error instanceof Error && error.name === "LockAcquisitionError")

const validateCollectorItems = (
  items: unknown[],
  integrationIdentifier: string,
): {
  items: MessengerEchoCollectorItem[]
  malformedCount: number
} => {
  const validItems: MessengerEchoCollectorItem[] = []
  let malformedCount = 0
  for (const item of items) {
    const parsed = messengerEchoCollectorItemSchema.safeParse(item)
    if (!parsed.success) {
      malformedCount += 1
      logger.error(
        { err: parsed.error, integrationIdentifier },
        "Dropped structurally malformed Messenger echo collector entry",
      )
      continue
    }
    validItems.push(parsed.data as MessengerEchoCollectorItem)
  }
  return { items: validItems, malformedCount }
}

const fallbackToSingleEvent = async (
  flushJobId: string,
  channel: string,
  integrationIdentifier: string,
  item: MessengerEchoCollectorItem,
): Promise<void> => {
  const messageIdentity = item.messaging.message?.mid ?? item
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([channel, item.entryId, messageIdentity]))
    .digest("hex")
  await integrationQueue.add(
    IntegrationJobAction.incomingMessage,
    {
      type: IntegrationJobAction.incomingMessage,
      data: {
        integrationType: "messenger",
        integrationIdentifier,
        payload: {
          object: "page",
          entry: [
            {
              id: item.entryId,
              time: item.entryTime,
              messaging: [item.messaging],
            },
          ],
        },
      },
    },
    { jobId: `messenger-echo-fallback-${flushJobId}-${fingerprint}` },
  )
}

const runOutboundLoopGuard = async (props: {
  workspaceId: string
  isWorkspaceActive: boolean
  entries: PersistedTextEchoEntry<MessengerEchoCollectorItem>[]
}): Promise<void> => {
  if (!props.isWorkspaceActive || props.entries.length === 0) {
    return
  }

  const contactInboxIds = [
    ...new Set(props.entries.map((entry) => entry.contactInboxId)),
  ]
  const conversationIds = [
    ...new Set(props.entries.map((entry) => entry.conversationId)),
  ]
  const [contactInboxes, conversations] = await Promise.all([
    contactInboxService.findManyByIds({
      workspaceId: props.workspaceId,
      ids: contactInboxIds,
      full: true,
    }),
    conversationService.findManyByIds({
      workspaceId: props.workspaceId,
      ids: conversationIds,
    }),
  ])
  const contactInboxById = new Map(
    contactInboxes.map((contactInbox) => [contactInbox.id, contactInbox]),
  )
  const conversationById = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  )

  for (const entry of props.entries) {
    if (!entry.item.text) {
      continue
    }
    const contactInbox = contactInboxById.get(entry.contactInboxId)
    const conversation = conversationById.get(entry.conversationId)
    if (!(contactInbox && conversation)) {
      logger.warn(
        {
          contactInboxId: entry.contactInboxId,
          conversationId: entry.conversationId,
          workspaceId: props.workspaceId,
        },
        "Skipped outbound automated response check because batch relations were missing",
      )
      continue
    }

    try {
      if (
        await isEchoOfOwnSend({
          conversation,
          message: entry.row,
        })
      ) {
        continue
      }
      await chatQueue.add(ChatJobAction.checkOutboundAutomatedResponse, {
        type: ChatJobAction.checkOutboundAutomatedResponse,
        data: {
          conversation,
          contactInbox,
          message: { id: entry.row.id, text: entry.item.text },
        },
      })
    } catch (err) {
      logger.warn(
        {
          err,
          contactInboxId: entry.contactInboxId,
          conversationId: entry.conversationId,
        },
        "Skipped outbound automated response check after an error",
      )
    }
  }
}

const zeroResult = (items: number): EchoBatchResult => ({
  items,
  dedupedItems: 0,
  contactsCreated: 0,
  messagesInserted: 0,
  duplicatesSkipped: 0,
  attachmentsWritten: 0,
  attachmentFailures: 0,
  perItemFailures: items,
})

const acknowledgePeeked = async (props: {
  scope: { channel: string; identifier: string }
  digest: string
  validCount: number
  malformedCount: number
}): Promise<boolean> => {
  const peekedCount = props.validCount + props.malformedCount
  const remainingItems = await echoCollector.ack(
    props.scope,
    peekedCount,
    props.digest,
  )
  if (remainingItems !== -1) {
    return true
  }

  logger.warn(
    {
      integrationIdentifier: props.scope.identifier,
      malformedCount: props.malformedCount,
      peekedCount,
      validCount: props.validCount,
    },
    "Messenger echo collector changed before acknowledgement; retained its scheduling flag",
  )
  return false
}

export const messengerEchoFlush = async (
  job: EchoFlushJob,
  data: LowJobMessengerEchoFlush["data"],
): Promise<void> => {
  if (!job.id) {
    throw new Error("Messenger echo flush job is missing an id")
  }
  const flushJobId = job.id
  const startedAt = Date.now()
  const scope = {
    channel: data.channel,
    identifier: data.integrationIdentifier,
  }

  try {
    await distributedLock.runExclusive({
      key: `messenger-echo-flush:${scope.channel}:${scope.identifier}`,
      timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
      retryTimeoutInSeconds: 0,
      fn: async () => {
        let resolved: Awaited<
          ReturnType<
            typeof integrationService.identifyInboxAndIntegrationAuthFromIdentifier
          >
        >
        try {
          resolved =
            await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
              data.channel,
              data.integrationIdentifier,
            )
        } catch (err) {
          if (!(err instanceof IntegrationNotFoundError)) {
            throw err
          }
          const peeked = await echoCollector.peek<unknown>(
            scope,
            env.MESSENGER_ECHO_FLUSH_BATCH,
            { processingTtlSeconds: PROCESSING_TTL_SECONDS },
          )
          const validated = validateCollectorItems(
            peeked.items,
            data.integrationIdentifier,
          )
          const items = validated.items
          const malformedCount =
            peeked.malformedCount + validated.malformedCount
          for (const item of items) {
            await fallbackToSingleEvent(
              flushJobId,
              data.channel,
              data.integrationIdentifier,
              item,
            )
          }
          if (
            !(await acknowledgePeeked({
              scope,
              digest: peeked.digest,
              validCount: items.length,
              malformedCount,
            }))
          ) {
            return
          }
          await echoCollector.clearFlag(scope)
          logger.warn(
            {
              err,
              integrationIdentifier: data.integrationIdentifier,
              items: items.length,
              malformedCount,
            },
            "Messenger echo flush could not resolve its inbox; queued legacy fallbacks",
          )
          return
        }

        const handled = await withBlockedOwnerGuard(
          resolved.inbox.workspaceId,
          async () => {
            const peeked = await echoCollector.peek<unknown>(
              scope,
              env.MESSENGER_ECHO_FLUSH_BATCH,
              { processingTtlSeconds: PROCESSING_TTL_SECONDS },
            )
            const validated = validateCollectorItems(
              peeked.items,
              data.integrationIdentifier,
            )
            const rawItems = validated.items
            const malformedCount =
              peeked.malformedCount + validated.malformedCount
            if (rawItems.length === 0) {
              if (malformedCount > 0) {
                if (
                  !(await acknowledgePeeked({
                    scope,
                    digest: peeked.digest,
                    validCount: 0,
                    malformedCount,
                  }))
                ) {
                  return true
                }
                logger.warn(
                  {
                    integrationIdentifier: data.integrationIdentifier,
                    malformedCount,
                  },
                  "Dropped malformed Messenger echo collector entries",
                )
              }
              await echoCollector.clearFlag(scope)
              return true
            }

            const workspace = await workspaceService.findById({
              id: resolved.inbox.workspaceId,
            })
            const isWorkspaceActive = workspaceService.isActiveNow(workspace)
            const [tenantSettings, realtimeSecret] = await Promise.all([
              resolveTenantSettings({
                workspaceId: resolved.inbox.workspaceId,
              }),
              Promise.resolve(
                resolveBroadcastSecret({
                  workspaceId: resolved.inbox.workspaceId,
                }),
              ),
            ])
            const realtimeTarget = {
              url: tenantSettings.wsUrl,
              secret: realtimeSecret,
            }
            const ctx = await buildContext<MessengerAuthValue>({
              workspaceId: resolved.inbox.workspaceId,
              integrationType: data.channel,
              integration:
                resolved.integrationRow as BuildContextIntegrationRow<MessengerAuthValue>,
              platformData: createPlatformData({
                tenantSettings,
                realtimeSecret,
              }),
            })
            const integration = allIntegrations.messenger
            const parsedItems: ParsedEchoBatchItem[] = []
            const legacyFallbackItems = new Set<MessengerEchoCollectorItem>()
            let parseFailures = 0
            const handToLegacyPath = async (
              raw: MessengerEchoCollectorItem,
            ): Promise<void> => {
              await fallbackToSingleEvent(
                flushJobId,
                data.channel,
                data.integrationIdentifier,
                raw,
              )
              legacyFallbackItems.add(raw)
            }

            for (const raw of rawItems) {
              try {
                const parsed = (await integration.runChannelHandler(
                  "message",
                  "parseEcho",
                  { ctx, data: { payload: raw.messaging } },
                )) as EchoParseResult | null
                if (!parsed) {
                  parseFailures += 1
                  await handToLegacyPath(raw)
                  continue
                }
                parsedItems.push({ ...parsed, raw })
              } catch (err) {
                parseFailures += 1
                logger.warn(
                  { err, integrationIdentifier: data.integrationIdentifier },
                  "Messenger echo item could not be parsed; using the single-event path",
                )
                await handToLegacyPath(raw)
              }
            }

            let result = zeroResult(rawItems.length)
            try {
              if (parsedItems.length > 0) {
                const batchResult = await messengerEchoBatchService.process({
                  inbox: resolved.inbox,
                  ownerId: workspace.ownerId,
                  realtimeTarget,
                  items: parsedItems,
                  ports: {
                    fetchProfile: async (sourceId) =>
                      await integration.runChannelHandler(
                        "contact",
                        "getProfile",
                        { ctx, data: { sourceId, avatar: false } },
                      ),
                    downloadAttachments: async (item) =>
                      await integration.runChannelHandler(
                        "message",
                        "downloadAttachments",
                        { ctx, data: { descriptors: item.attachments } },
                      ),
                    fallbackToSingleEvent: async (item) =>
                      await handToLegacyPath(item.raw),
                    onTextMessagesPersisted: async (entries) =>
                      await runOutboundLoopGuard({
                        workspaceId: resolved.inbox.workspaceId,
                        isWorkspaceActive,
                        entries,
                      }),
                  },
                })
                result = {
                  ...batchResult,
                  items: rawItems.length,
                  perItemFailures: batchResult.perItemFailures + parseFailures,
                }
              }
            } catch (err) {
              const attempts = job.opts.attempts ?? 1
              if (job.attemptsMade + 1 < attempts) {
                throw err
              }
              let persistedSourceIds = new Set<string>()
              try {
                persistedSourceIds =
                  await messengerEchoBatchService.findPersistedSourceIds({
                    inbox: resolved.inbox,
                    items: parsedItems,
                  })
              } catch (lookupErr) {
                logger.warn(
                  {
                    err: lookupErr,
                    integrationIdentifier: data.integrationIdentifier,
                  },
                  "Messenger echo persistence lookup failed; retaining every legacy fallback",
                )
              }
              const persistedRawItems = new Set(
                parsedItems.flatMap((item) =>
                  persistedSourceIds.has(item.sourceId) ? [item.raw] : [],
                ),
              )
              let persistedAndDropped = 0
              for (const raw of rawItems) {
                if (legacyFallbackItems.has(raw)) {
                  continue
                }
                if (persistedRawItems.has(raw)) {
                  persistedAndDropped += 1
                  continue
                }
                await handToLegacyPath(raw)
              }
              if (persistedAndDropped > 0) {
                logger.warn(
                  {
                    integrationIdentifier: data.integrationIdentifier,
                    persistedAndDropped,
                    persistedSourceIds: [...persistedSourceIds],
                  },
                  "Skipped legacy fallbacks for Messenger echoes already persisted by the failed batch",
                )
              }
              if (
                !(await acknowledgePeeked({
                  scope,
                  digest: peeked.digest,
                  validCount: rawItems.length,
                  malformedCount,
                }))
              ) {
                return true
              }
              await echoCollector.clearFlag(scope)
              logger.error(
                {
                  err,
                  integrationIdentifier: data.integrationIdentifier,
                  items: rawItems.length,
                  malformedCount,
                },
                "Messenger echo batch failed on its final attempt; queued legacy fallbacks",
              )
              return true
            }

            if (
              !(await acknowledgePeeked({
                scope,
                digest: peeked.digest,
                validCount: rawItems.length,
                malformedCount,
              }))
            ) {
              return true
            }
            await echoCollector.clearFlag(scope)
            const listDepth = await echoCollector.size(scope)
            if (
              listDepth > 0 &&
              (await echoCollector.schedule(
                scope,
                env.MESSENGER_ECHO_FLAG_TTL_MS,
              ))
            ) {
              await lowQueue.add(LowJobAction.messengerEchoFlush, {
                type: LowJobAction.messengerEchoFlush,
                data,
              })
            }

            logger.info(
              {
                ...result,
                listDepth,
                malformedCount,
                durationMs: Date.now() - startedAt,
                integrationIdentifier: data.integrationIdentifier,
              },
              "Messenger echo batch flush completed",
            )
            return true
          },
        )

        if (handled === undefined) {
          const { items, malformedCount, digest } =
            await echoCollector.peek<MessengerEchoCollectorItem>(
              scope,
              env.MESSENGER_ECHO_FLUSH_BATCH,
              { processingTtlSeconds: PROCESSING_TTL_SECONDS },
            )
          const droppedCount = items.length + malformedCount
          if (
            !(await acknowledgePeeked({
              scope,
              digest,
              validCount: items.length,
              malformedCount,
            }))
          ) {
            return
          }
          await echoCollector.clearFlag(scope)
          logger.info(
            {
              droppedCount,
              integrationIdentifier: data.integrationIdentifier,
              workspaceId: resolved.inbox.workspaceId,
            },
            "Skipping workspace job for frozen workspace",
          )
        }
      },
    })
  } catch (err) {
    if (isLockAcquisitionError(err)) {
      return
    }
    throw err
  }
}

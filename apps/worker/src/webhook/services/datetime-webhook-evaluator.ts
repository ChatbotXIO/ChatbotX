import { triggerEventTypes } from "@chatbotx.io/database/partials"
import {
  cleanupOldWebhookExecutions,
  markWebhookExecuted as insertWebhookExecution,
  listActiveDateTimeWebhooks,
  listContactCustomFieldsForDateTimeSweep,
  listExecutedWebhookPairs,
} from "@chatbotx.io/database/repositories"
import {
  getRedisConnection,
  WebhookJobAction,
  webhookQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import {
  buildContactCustomFieldMap,
  type DateTimeSweepContactCustomField,
  type DateTimeSweepEntity,
  extractDateTimeCustomFieldIds,
  filterContactsWithAnyCustomField,
  findMatchingDateTimeCondition,
  forEachSweepPage,
} from "../../shared/datetime-sweep"
import type {
  DateTimeCondition,
  DateTimeOperator,
  DateTimeTriggerValue,
} from "../../trigger/utils/datetime-calculator"

type DateTimeWebhookResult = {
  contactId: string
  error?: string
  matched: boolean
  webhookId: string
}

type WebhookSweepInfo = DateTimeSweepEntity & {
  webhookId: string
}

type WebhookMap = Record<string, WebhookSweepInfo>

const CONTACT_FIELD_PAGE_SIZE = 1000
const DATE_TIME_WEBHOOK_CHUNK_SIZE = 100
const MAX_DATE_TIME_WEBHOOKS_PER_SCAN = 10_000

async function fetchWebhookChunk(
  cursor: string | undefined,
  chunkSize: number,
): Promise<{ nextCursor: string | undefined; webhookMap: WebhookMap }> {
  const { webhooks, nextCursor } = await listActiveDateTimeWebhooks({
    cursor,
    limit: chunkSize,
  })
  const webhookMap: WebhookMap = {}

  for (const webhook of webhooks) {
    const conditions: DateTimeCondition[] = []

    for (const condition of webhook.conditions) {
      if (!condition.sourceId) {
        continue
      }

      const triggerValue = condition.value as DateTimeTriggerValue
      if (!triggerValue?.triggerType) {
        continue
      }

      conditions.push({
        triggerType: triggerValue.triggerType as DateTimeOperator,
        timeValue: triggerValue.timeValue,
        timeType: triggerValue.timeType,
        at: triggerValue.at,
        timezone: triggerValue.timezone,
        customFieldId: condition.sourceId,
      })
    }

    if (conditions.length > 0) {
      webhookMap[webhook.id] = {
        webhookId: webhook.id,
        workspaceId: webhook.workspaceId,
        conditions,
        timezone: webhook.workspace?.timezone || "UTC",
      }
    }
  }

  return { webhookMap, nextCursor }
}

async function checkExecutionCache(
  redis: ReturnType<typeof getRedisConnection>,
  webhookId: string,
  contactId: string,
): Promise<boolean> {
  const cacheKey = `webhook:executed:${webhookId}:${contactId}`
  const cached = await redis.get(cacheKey)
  return !!cached
}

async function acquireExecutionLock(
  redis: ReturnType<typeof getRedisConnection>,
  webhookId: string,
  contactId: string,
): Promise<boolean> {
  const lockKey = `webhook:lock:${webhookId}:${contactId}`
  const lockAcquired = await redis.set(lockKey, "1", "EX", 30, "NX")
  return !!lockAcquired
}

async function releaseExecutionLock(
  redis: ReturnType<typeof getRedisConnection>,
  webhookId: string,
  contactId: string,
): Promise<void> {
  const lockKey = `webhook:lock:${webhookId}:${contactId}`
  await redis.del(lockKey)
}

async function enqueueWebhookEvaluation(
  webhookInfo: WebhookSweepInfo,
  contactId: string,
  matchedCondition: DateTimeCondition,
): Promise<void> {
  await webhookQueue.add(
    "evaluate-webhooks",
    {
      type: WebhookJobAction.evaluateWebhooks,
      data: {
        workspaceId: webhookInfo.workspaceId,
        contactId,
        eventType: triggerEventTypes.enum.dateTimeBasedTrigger,
        eventData: {
          sourceId: matchedCondition.customFieldId,
        },
        timestamp: new Date(),
      },
    },
    {
      removeOnComplete: true,
      removeOnFail: 100,
    },
  )
}

async function markWebhookExecuted(
  redis: ReturnType<typeof getRedisConnection>,
  webhookInfo: WebhookSweepInfo,
  contactId: string,
): Promise<void> {
  await insertWebhookExecution({
    webhookId: webhookInfo.webhookId,
    contactId,
    workspaceId: webhookInfo.workspaceId,
  })

  const cacheKey = `webhook:executed:${webhookInfo.webhookId}:${contactId}`
  await redis.setex(cacheKey, 86_400 * 90, "1")
}

async function enqueueAndMarkWebhook(
  webhookInfo: WebhookSweepInfo,
  contactId: string,
  matchedCondition: DateTimeCondition,
): Promise<DateTimeWebhookResult> {
  const notExecutedResult = {
    webhookId: webhookInfo.webhookId,
    contactId,
    matched: false,
  }

  try {
    const redis = getRedisConnection()

    if (await checkExecutionCache(redis, webhookInfo.webhookId, contactId)) {
      return notExecutedResult
    }

    if (
      !(await acquireExecutionLock(redis, webhookInfo.webhookId, contactId))
    ) {
      return notExecutedResult
    }

    try {
      if (await checkExecutionCache(redis, webhookInfo.webhookId, contactId)) {
        return notExecutedResult
      }

      await enqueueWebhookEvaluation(webhookInfo, contactId, matchedCondition)
      await markWebhookExecuted(redis, webhookInfo, contactId)

      return {
        webhookId: webhookInfo.webhookId,
        contactId,
        matched: true,
      }
    } finally {
      await releaseExecutionLock(redis, webhookInfo.webhookId, contactId)
    }
  } catch (error) {
    logger.warn(
      { err: error, webhookId: webhookInfo.webhookId, contactId },
      "Failed to enqueue datetime webhook",
    )
    return {
      webhookId: webhookInfo.webhookId,
      contactId,
      matched: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

async function processContactBatch(
  webhookMap: WebhookMap,
  webhookIds: string[],
  contactCustomFields: DateTimeSweepContactCustomField[],
  params: { startOfMinute: number },
): Promise<DateTimeWebhookResult[]> {
  if (contactCustomFields.length === 0) {
    return []
  }

  const contactIds = [
    ...new Set(contactCustomFields.map((customField) => customField.contactId)),
  ]
  const executedSet = await listExecutedWebhookPairs({ webhookIds, contactIds })
  const contactCustomFieldMap = buildContactCustomFieldMap(contactCustomFields)
  const results: DateTimeWebhookResult[] = []

  for (const webhookInfo of Object.values(webhookMap)) {
    const contactsToCheck = filterContactsWithAnyCustomField(
      contactCustomFields,
      webhookInfo,
    )

    for (const contactId of contactsToCheck) {
      const executionKey = `${webhookInfo.webhookId}:${contactId}`
      if (executedSet.has(executionKey)) {
        continue
      }

      const customFieldValues = contactCustomFieldMap.get(contactId)
      if (!customFieldValues) {
        continue
      }

      const matchedCondition = findMatchingDateTimeCondition(
        webhookInfo,
        customFieldValues,
        {
          startOfMinute: params.startOfMinute,
        },
      )

      if (matchedCondition) {
        const result = await enqueueAndMarkWebhook(
          webhookInfo,
          contactId,
          matchedCondition,
        )
        results.push(result)
        executedSet.add(executionKey)
      }
    }
  }

  return results
}

async function processWebhookMap(
  webhookMap: WebhookMap,
  params: { startOfMinute: number },
): Promise<DateTimeWebhookResult[]> {
  const webhookIds = Object.keys(webhookMap)
  const allCustomFieldIds = extractDateTimeCustomFieldIds(webhookMap)

  const results: DateTimeWebhookResult[] = []

  await forEachSweepPage(
    (cursor) =>
      listContactCustomFieldsForDateTimeSweep({
        customFieldIds: Array.from(allCustomFieldIds),
        cursor,
        limit: CONTACT_FIELD_PAGE_SIZE,
      }),
    async (contactCustomFields) => {
      const batchResults = await processContactBatch(
        webhookMap,
        webhookIds,
        contactCustomFields,
        params,
      )
      results.push(...batchResults)
    },
  )

  return results
}

async function collectDateTimeWebhookMap(): Promise<WebhookMap> {
  const webhookMap: WebhookMap = {}
  let webhookCursor: string | undefined
  let storedWebhookCount = 0
  let droppedWebhookCount = 0

  while (true) {
    const { webhookMap: chunkMap, nextCursor } = await fetchWebhookChunk(
      webhookCursor,
      DATE_TIME_WEBHOOK_CHUNK_SIZE,
    )

    for (const [webhookId, webhookInfo] of Object.entries(chunkMap)) {
      if (storedWebhookCount >= MAX_DATE_TIME_WEBHOOKS_PER_SCAN) {
        droppedWebhookCount += 1
        continue
      }

      webhookMap[webhookId] = webhookInfo
      storedWebhookCount += 1
    }

    if (!nextCursor) {
      break
    }

    webhookCursor = nextCursor
  }

  if (droppedWebhookCount > 0) {
    logger.warn(
      {
        droppedWebhookCount,
        maxWebhookCount: MAX_DATE_TIME_WEBHOOKS_PER_SCAN,
      },
      "Datetime webhook scan exceeded the per-scan webhook cap",
    )
  }

  return webhookMap
}

export async function evaluateDateTimeWebhooks(params: {
  startOfMinute: number
}): Promise<DateTimeWebhookResult[]> {
  const webhookMap = await collectDateTimeWebhookMap()
  if (Object.keys(webhookMap).length === 0) {
    return []
  }

  return await processWebhookMap(webhookMap, params)
}

export async function cleanupWebhookExecutionsOlderThan(
  olderThan: Date,
): Promise<number> {
  return await cleanupOldWebhookExecutions(olderThan)
}

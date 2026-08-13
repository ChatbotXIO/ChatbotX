import { db, sql } from "@chatbotx.io/database/client"
import { triggerEventTypes } from "@chatbotx.io/database/partials"
import {
  listContactCustomFieldsForDateTimeSweep,
  listContactCustomFieldsForDateTimeSweepContacts,
} from "@chatbotx.io/database/repositories"
import { triggerExecutionModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { getRedisConnection } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import {
  allDateTimeConditionsMatch,
  buildContactCustomFieldMap,
  type DateTimeSweepContactCustomField,
  type DateTimeSweepEntity,
  extractDateTimeCustomFieldIds,
  filterContactsWithAnyCustomField,
  forEachSweepPage,
} from "../../shared/datetime-sweep"
import type {
  DateTimeCondition,
  DateTimeOperator,
  DateTimeTriggerValue,
} from "../utils/datetime-calculator"
import { ActionExecutor } from "./action-executor"

interface DateTimeTriggerResult {
  contactId: string
  error?: string
  matched: boolean
  triggerId: string
}

type TriggerSweepInfo = DateTimeSweepEntity & {
  actions: unknown
  triggerId: string
}

type TriggerMap = Record<string, TriggerSweepInfo>

const CONTACT_FIELD_PAGE_SIZE = 1000
const DATE_TIME_TRIGGER_CHUNK_SIZE = 100
const MAX_DATE_TIME_TRIGGERS_PER_SCAN = 10_000

async function fetchTriggerChunk(
  cursor: string | undefined,
  chunkSize: number,
): Promise<{ triggerMap: TriggerMap; nextCursor: string | undefined }> {
  const triggers = await db.query.triggerModel.findMany({
    where: {
      active: true,
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    with: {
      conditions: true,
      workspace: true,
    },
    limit: chunkSize,
    orderBy: { id: "asc" },
  })

  const filteredTriggers = triggers.filter((t) =>
    t.conditions.some(
      (c) => c.type === triggerEventTypes.enum.dateTimeBasedTrigger,
    ),
  )

  // Filter conditions to only include datetime conditions
  const triggersWithFilteredConditions = filteredTriggers.map((t) => ({
    ...t,
    conditions: t.conditions.filter(
      (c) => c.type === triggerEventTypes.enum.dateTimeBasedTrigger,
    ),
  }))

  const triggerMap: TriggerMap = {}

  for (const trigger of triggersWithFilteredConditions) {
    const conditions: DateTimeCondition[] = []

    for (const condition of trigger.conditions) {
      if (!condition?.sourceId) {
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
      triggerMap[trigger.id.toString()] = {
        triggerId: trigger.id,
        workspaceId: trigger.workspaceId,
        actions: trigger.actions,
        conditions,
        timezone: trigger.workspace?.timezone || "UTC",
      }
    }
  }

  const nextCursor =
    triggers.length === chunkSize ? triggers.at(-1)?.id : undefined

  return { triggerMap, nextCursor }
}

async function getExecutedTriggers(
  triggerIds: string[],
  contactIds: string[],
): Promise<Set<string>> {
  const executions = await db.query.triggerExecutionModel.findMany({
    where: {
      triggerId: { in: triggerIds },
      contactId: { in: contactIds },
    },
    columns: {
      triggerId: true,
      contactId: true,
    },
  })

  return new Set(executions.map((e) => `${e.triggerId}:${e.contactId}`))
}

async function checkExecutionCache(
  redis: ReturnType<typeof getRedisConnection>,
  triggerId: string,
  contactId: string,
): Promise<boolean> {
  const cacheKey = `trigger:executed:${triggerId}:${contactId}`
  const cached = await redis.get(cacheKey)
  return !!cached
}

async function acquireExecutionLock(
  redis: ReturnType<typeof getRedisConnection>,
  triggerId: string,
  contactId: string,
): Promise<boolean> {
  const lockKey = `trigger:lock:${triggerId}:${contactId}`
  const lockAcquired = await redis.set(lockKey, "1", "EX", 30, "NX")
  return !!lockAcquired
}

async function releaseExecutionLock(
  redis: ReturnType<typeof getRedisConnection>,
  triggerId: string,
  contactId: string,
): Promise<void> {
  const lockKey = `trigger:lock:${triggerId}:${contactId}`
  await redis.del(lockKey)
}

async function executeActions(
  triggerInfo: TriggerSweepInfo,
  contactId: string,
): Promise<void> {
  const actions = Array.isArray(triggerInfo.actions) ? triggerInfo.actions : []
  const executor = new ActionExecutor()

  for (const action of actions) {
    try {
      await executor.execute({
        action,
        contactId,
        workspaceId: triggerInfo.workspaceId,
        triggerId: triggerInfo.triggerId,
      })
    } catch (error) {
      logger.error(
        error,
        `Failed to execute action for trigger ${triggerInfo.triggerId} for contact ${contactId}`,
      )
    }
  }
}

async function markTriggerExecuted(
  redis: ReturnType<typeof getRedisConnection>,
  triggerInfo: TriggerSweepInfo,
  contactId: string,
): Promise<void> {
  await db
    .insert(triggerExecutionModel)
    .values({
      id: createId(),
      triggerId: triggerInfo.triggerId,
      contactId,
      workspaceId: triggerInfo.workspaceId,
      createdAt: new Date(),
      executedAt: new Date(),
    })
    .onConflictDoNothing()

  const cacheKey = `trigger:executed:${triggerInfo.triggerId}:${contactId}`
  await redis.setex(cacheKey, 86_400 * 90, "1")
}

async function executeAndMarkTrigger(
  triggerInfo: TriggerSweepInfo,
  contactId: string,
): Promise<DateTimeTriggerResult> {
  const notExecutedResult = {
    triggerId: triggerInfo.triggerId,
    contactId,
    matched: false,
  }

  try {
    const redis = getRedisConnection()

    if (await checkExecutionCache(redis, triggerInfo.triggerId, contactId)) {
      return notExecutedResult
    }

    if (
      !(await acquireExecutionLock(redis, triggerInfo.triggerId, contactId))
    ) {
      return notExecutedResult
    }

    try {
      if (await checkExecutionCache(redis, triggerInfo.triggerId, contactId)) {
        return notExecutedResult
      }

      await executeActions(triggerInfo, contactId)
      await markTriggerExecuted(redis, triggerInfo, contactId)

      return {
        triggerId: triggerInfo.triggerId,
        contactId,
        matched: true,
      }
    } finally {
      await releaseExecutionLock(redis, triggerInfo.triggerId, contactId)
    }
  } catch (error) {
    return {
      triggerId: triggerInfo.triggerId,
      contactId,
      matched: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

function collectPageTriggerCandidates(
  triggerMap: TriggerMap,
  contactCustomFields: DateTimeSweepContactCustomField[],
): {
  candidateContactIds: string[]
  candidateCustomFieldIds: string[]
  contactsByTriggerId: Map<string, Set<string>>
} {
  const candidateContactIds = new Set<string>()
  const candidateCustomFieldIds = new Set<string>()
  const contactsByTriggerId = new Map<string, Set<string>>()

  for (const triggerInfo of Object.values(triggerMap)) {
    const contactsToCheck = filterContactsWithAnyCustomField(
      contactCustomFields,
      triggerInfo,
    )
    if (contactsToCheck.size === 0) {
      continue
    }

    contactsByTriggerId.set(triggerInfo.triggerId, contactsToCheck)
    for (const contactId of contactsToCheck) {
      candidateContactIds.add(contactId)
    }
    for (const condition of triggerInfo.conditions) {
      candidateCustomFieldIds.add(condition.customFieldId)
    }
  }

  return {
    candidateContactIds: Array.from(candidateContactIds),
    candidateCustomFieldIds: Array.from(candidateCustomFieldIds),
    contactsByTriggerId,
  }
}

async function processContactBatch(
  triggerMap: TriggerMap,
  contactCustomFields: DateTimeSweepContactCustomField[],
  executedKeys: Set<string>,
  params: {
    startOfMinute: number
  },
): Promise<DateTimeTriggerResult[]> {
  if (contactCustomFields.length === 0) {
    return []
  }

  const { candidateContactIds, candidateCustomFieldIds, contactsByTriggerId } =
    collectPageTriggerCandidates(triggerMap, contactCustomFields)
  if (
    candidateContactIds.length === 0 ||
    candidateCustomFieldIds.length === 0
  ) {
    return []
  }

  const candidateTriggerIds = Array.from(contactsByTriggerId.keys())
  const executedSet = await getExecutedTriggers(
    candidateTriggerIds,
    candidateContactIds,
  )
  const hydratedCustomFields =
    await listContactCustomFieldsForDateTimeSweepContacts({
      contactIds: candidateContactIds,
      customFieldIds: candidateCustomFieldIds,
    })
  const contactCustomFieldMap = buildContactCustomFieldMap(hydratedCustomFields)
  const results: DateTimeTriggerResult[] = []

  for (const [triggerId, contactsToCheck] of contactsByTriggerId.entries()) {
    const triggerInfo = triggerMap[triggerId]
    if (!triggerInfo) {
      continue
    }

    for (const contactId of contactsToCheck) {
      const executionKey = `${triggerInfo.triggerId}:${contactId}`
      if (executedKeys.has(executionKey) || executedSet.has(executionKey)) {
        continue
      }

      const customFieldValues = contactCustomFieldMap.get(contactId)
      if (!customFieldValues) {
        continue
      }

      const allConditionsMatch = allDateTimeConditionsMatch(
        triggerInfo,
        customFieldValues,
        {
          startOfMinute: params.startOfMinute,
        },
      )

      if (allConditionsMatch) {
        const result = await executeAndMarkTrigger(triggerInfo, contactId)
        results.push(result)
        executedKeys.add(executionKey)
      }
    }
  }

  return results
}

async function processTriggerMap(
  triggerMap: TriggerMap,
  params: {
    startOfMinute: number
  },
): Promise<DateTimeTriggerResult[]> {
  const allCustomFieldIds = extractDateTimeCustomFieldIds(triggerMap)

  const results: DateTimeTriggerResult[] = []
  const executedKeys = new Set<string>()

  await forEachSweepPage(
    (cursor) =>
      listContactCustomFieldsForDateTimeSweep({
        customFieldIds: Array.from(allCustomFieldIds),
        cursor,
        limit: CONTACT_FIELD_PAGE_SIZE,
      }),
    async (contactCustomFields) => {
      const batchResults = await processContactBatch(
        triggerMap,
        contactCustomFields,
        executedKeys,
        params,
      )
      results.push(...batchResults)
    },
  )

  return results
}

async function collectDateTimeTriggerMap(): Promise<TriggerMap> {
  const triggerMap: TriggerMap = {}
  let triggerCursor: string | undefined
  let storedTriggerCount = 0
  let droppedTriggerCount = 0

  while (true) {
    const { triggerMap: chunkMap, nextCursor } = await fetchTriggerChunk(
      triggerCursor,
      DATE_TIME_TRIGGER_CHUNK_SIZE,
    )

    for (const [triggerId, triggerInfo] of Object.entries(chunkMap)) {
      if (storedTriggerCount >= MAX_DATE_TIME_TRIGGERS_PER_SCAN) {
        droppedTriggerCount += 1
        continue
      }

      triggerMap[triggerId] = triggerInfo
      storedTriggerCount += 1
    }

    if (!nextCursor) {
      break
    }

    triggerCursor = nextCursor
  }

  if (droppedTriggerCount > 0) {
    logger.warn(
      {
        droppedTriggerCount,
        maxTriggerCount: MAX_DATE_TIME_TRIGGERS_PER_SCAN,
      },
      "Datetime trigger scan exceeded the per-scan trigger cap",
    )
  }

  return triggerMap
}

export async function evaluateDateTimeTriggers(params: {
  startOfMinute: number
}): Promise<DateTimeTriggerResult[]> {
  const triggerMap = await collectDateTimeTriggerMap()
  if (Object.keys(triggerMap).length === 0) {
    return []
  }

  return await processTriggerMap(triggerMap, params)
}

export async function cleanupOldExecutions(): Promise<number> {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const result = await db.execute(
    sql`DELETE FROM "TriggerExecution" WHERE "executedAt" < ${ninetyDaysAgo}`,
  )

  return Number(result.rowCount ?? 0)
}

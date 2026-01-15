import { prisma } from "@aha.chat/database"
import { TriggerCondition } from "@aha.chat/database/enums"
import type {
  DateTimeCondition,
  DateTimeOperator,
  DateTimeTriggerValue,
} from "../utils/datetime-calculator"
import {
  matchesDateTimeCondition,
  parseDateTimeValue,
} from "../utils/datetime-calculator"
import { ActionExecutor } from "./action-executor"

interface DateTimeTriggerResult {
  triggerId: string
  contactId: string
  matched: boolean
  error?: string
}

interface TriggerMap {
  [triggerId: string]: {
    triggerId: string
    chatbotId: string
    actions: unknown
    conditions: DateTimeCondition[]
  }
}

async function fetchTriggerChunk(
  cursor: string | undefined,
  chunkSize: number,
): Promise<{ triggerMap: TriggerMap; nextCursor: string | undefined }> {
  const triggers = await prisma.trigger.findMany({
    where: {
      active: true,
      conditions: {
        some: {
          type: TriggerCondition.dateTimeBasedTrigger,
        },
      },
    },
    include: {
      conditions: {
        where: {
          type: TriggerCondition.dateTimeBasedTrigger,
        },
      },
    },
    take: chunkSize,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { id: "asc" },
  })

  const triggerMap: TriggerMap = {}

  for (const trigger of triggers) {
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
        operator: triggerValue.triggerType as DateTimeOperator,
        value: triggerValue.timeValue,
        unit: triggerValue.timeType,
        at: triggerValue.at,
        customFieldId: condition.sourceId,
      })
    }

    if (conditions.length > 0) {
      triggerMap[trigger.id] = {
        triggerId: trigger.id,
        chatbotId: trigger.chatbotId,
        actions: trigger.actions,
        conditions,
      }
    }
  }

  const nextCursor =
    triggers.length === chunkSize ? triggers.at(-1)?.id : undefined

  return { triggerMap, nextCursor }
}

function extractCustomFieldIds(triggerMap: TriggerMap): Set<string> {
  const customFieldIds = new Set<string>()
  for (const trigger of Object.values(triggerMap)) {
    for (const condition of trigger.conditions) {
      customFieldIds.add(condition.customFieldId)
    }
  }
  return customFieldIds
}

function buildContactCustomFieldMap(
  contactCustomFields: Array<{
    contactId: string
    customFieldId: string
    value: unknown
  }>,
): Map<string, Map<string, unknown>> {
  const contactCustomFieldMap = new Map<string, Map<string, unknown>>()
  for (const cf of contactCustomFields) {
    if (!contactCustomFieldMap.has(cf.contactId)) {
      contactCustomFieldMap.set(cf.contactId, new Map())
    }
    const fieldMap = contactCustomFieldMap.get(cf.contactId)
    if (fieldMap) {
      fieldMap.set(cf.customFieldId, cf.value)
    }
  }
  return contactCustomFieldMap
}

function filterContactsWithAllCustomFields(
  contactCustomFields: Array<{
    contactId: string
    contact: { chatbotId: string }
  }>,
  triggerInfo: TriggerMap[string],
  contactCustomFieldMap: Map<string, Map<string, unknown>>,
): Set<string> {
  const contactsToCheck = new Set<string>()

  for (const cf of contactCustomFields) {
    if (cf.contact.chatbotId !== triggerInfo.chatbotId) {
      return new Set()
    }

    const hasAllCustomFields = triggerInfo.conditions.every((cond) =>
      contactCustomFieldMap.get(cf.contactId)?.has(cond.customFieldId),
    )

    if (hasAllCustomFields) {
      contactsToCheck.add(cf.contactId)
    }
  }

  return contactsToCheck
}

function evaluateContactForTrigger(
  triggerInfo: TriggerMap[string],
  customFieldValues: Map<string, unknown>,
): boolean {
  for (const condition of triggerInfo.conditions) {
    const customFieldValue = customFieldValues.get(condition.customFieldId)

    const datetimeValue = parseDateTimeValue(customFieldValue)
    if (!datetimeValue) {
      return false
    }

    const matches = matchesDateTimeCondition(datetimeValue, condition)
    if (!matches) {
      return false
    }
  }

  return true
}

async function getExecutedTriggers(
  triggerIds: string[],
  contactIds: string[],
): Promise<Set<string>> {
  const executions = await prisma.triggerExecution.findMany({
    where: {
      triggerId: { in: triggerIds },
      contactId: { in: contactIds },
    },
    select: {
      triggerId: true,
      contactId: true,
    },
  })

  return new Set(executions.map((e) => `${e.triggerId}:${e.contactId}`))
}

async function executeAndMarkTrigger(
  triggerInfo: TriggerMap[string],
  contactId: string,
): Promise<DateTimeTriggerResult> {
  try {
    const actions = Array.isArray(triggerInfo.actions)
      ? triggerInfo.actions
      : []
    const executor = new ActionExecutor()

    for (const action of actions) {
      await executor.execute({
        action,
        contactId,
        chatbotId: triggerInfo.chatbotId,
      })
    }

    await prisma.$executeRaw`
      INSERT INTO "TriggerExecution" ("id", "triggerId", "contactId", "chatbotId", "createdAt", "executedAt")
      VALUES (gen_random_uuid(), ${triggerInfo.triggerId}, ${contactId}, ${triggerInfo.chatbotId}, NOW(), NOW())
      ON CONFLICT ("triggerId", "contactId") DO NOTHING
    `

    return {
      triggerId: triggerInfo.triggerId,
      contactId,
      matched: true,
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

async function processContactBatch(
  triggerMap: TriggerMap,
  triggerIds: string[],
  allCustomFieldIds: Set<string>,
  skip: number,
  batchSize: number,
): Promise<{ results: DateTimeTriggerResult[]; hasMore: boolean }> {
  const contactCustomFields = await prisma.contactCustomField.findMany({
    where: {
      customFieldId: { in: Array.from(allCustomFieldIds) },
    },
    include: {
      contact: {
        select: {
          id: true,
          chatbotId: true,
        },
      },
    },
    skip,
    take: batchSize,
  })

  if (contactCustomFields.length === 0) {
    return { results: [], hasMore: false }
  }

  const contactIds = [...new Set(contactCustomFields.map((cf) => cf.contactId))]
  const executedSet = await getExecutedTriggers(triggerIds, contactIds)
  const contactCustomFieldMap = buildContactCustomFieldMap(contactCustomFields)
  const results: DateTimeTriggerResult[] = []

  for (const triggerInfo of Object.values(triggerMap)) {
    const contactsToCheck = filterContactsWithAllCustomFields(
      contactCustomFields,
      triggerInfo,
      contactCustomFieldMap,
    )

    for (const contactId of contactsToCheck) {
      const executionKey = `${triggerInfo.triggerId}:${contactId}`
      if (executedSet.has(executionKey)) {
        continue
      }

      const customFieldValues = contactCustomFieldMap.get(contactId)
      if (!customFieldValues) {
        continue
      }

      const allConditionsMatch = evaluateContactForTrigger(
        triggerInfo,
        customFieldValues,
      )

      if (allConditionsMatch) {
        const result = await executeAndMarkTrigger(triggerInfo, contactId)
        results.push(result)
        executedSet.add(executionKey)
      }
    }
  }

  return {
    results,
    hasMore: contactCustomFields.length === batchSize,
  }
}

async function processTriggerChunk(
  triggerMap: TriggerMap,
): Promise<DateTimeTriggerResult[]> {
  const triggerIds = Object.keys(triggerMap)
  const allCustomFieldIds = extractCustomFieldIds(triggerMap)

  const CONTACT_BATCH_SIZE = 1000
  const results: DateTimeTriggerResult[] = []
  let skip = 0
  let hasMore = true

  while (hasMore) {
    const { results: batchResults, hasMore: more } = await processContactBatch(
      triggerMap,
      triggerIds,
      allCustomFieldIds,
      skip,
      CONTACT_BATCH_SIZE,
    )

    results.push(...batchResults)
    hasMore = more
    skip += CONTACT_BATCH_SIZE
  }

  return results
}

export async function evaluateDateTimeTriggers(): Promise<
  DateTimeTriggerResult[]
> {
  const TRIGGER_CHUNK_SIZE = 100
  const allResults: DateTimeTriggerResult[] = []
  let triggerCursor: string | undefined
  let triggerCount = 0

  while (true) {
    const { triggerMap, nextCursor } = await fetchTriggerChunk(
      triggerCursor,
      TRIGGER_CHUNK_SIZE,
    )

    const triggerIds = Object.keys(triggerMap)
    if (triggerIds.length === 0) {
      break
    }

    triggerCount += triggerIds.length
    console.log(
      `Processing ${triggerIds.length} triggers (total: ${triggerCount})`,
    )

    const results = await processTriggerChunk(triggerMap)
    allResults.push(...results)

    if (!nextCursor) {
      break
    }

    triggerCursor = nextCursor
  }

  console.log(
    `Completed: ${triggerCount} triggers, ${allResults.length} executions`,
  )
  return allResults
}

export async function cleanupOldExecutions(): Promise<number> {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const result = await prisma.$executeRaw`
    DELETE FROM "TriggerExecution"
    WHERE "executedAt" < ${ninetyDaysAgo}
  `

  return Number(result)
}

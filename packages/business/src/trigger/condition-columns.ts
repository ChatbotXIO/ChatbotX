/**
 * The 4 columns a condition row carries — shared shape for trigger/webhook
 * condition upserts. Both `trigger/service.ts` and `webhook/service.ts` use
 * the identical mapping, so it lives in its own file rather than one domain
 * importing the other's service module.
 */
export type ConditionInput = {
  id?: string
  type: string
  sourceId?: string | null
  operator?: string | null
  value?: unknown
}

export const toConditionColumnsShared = (condition: ConditionInput) => ({
  type: condition.type,
  sourceId: condition.sourceId ?? null,
  operator: condition.operator ?? null,
  value: condition.value ?? null,
})

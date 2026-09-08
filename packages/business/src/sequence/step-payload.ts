import type { sequenceStepModel } from "@chatbotx.io/database/schema"

// The `delayUnit` column is a bare `text()` with no DB-level enum — this is
// the canonical union both the builder schema (`schema/action.ts`) and this
// write-boundary conform to, so the two can't drift apart.
export const SEQUENCE_STEP_DELAY_UNITS = [
  "immediate",
  "minutes",
  "hours",
  "days",
  "specificTime",
] as const
export type SequenceStepDelayUnit = (typeof SEQUENCE_STEP_DELAY_UNITS)[number]

/**
 * The subset of `upsertSequenceStepRequest` fields relevant to a step's
 * create/update payload — kept loose (`Partial`-friendly, all optional
 * except `order`) so both `buildCreateData` and `buildUpdateData` accept the
 * same shape the builder action already validates.
 */
export type SequenceStepPayloadInput = {
  order: number
  delayDays?: number
  delayMinutes?: number
  delayUnit?: SequenceStepDelayUnit
  flowId?: string | null
  specificDateTime?: string | null
  isActive?: boolean
  anytime?: boolean
  sendTimeStart?: string | null
  sendTimeEnd?: string | null
  sendDays?: string[]
}

export function buildUpdateData(
  parsedInput: SequenceStepPayloadInput,
): Partial<typeof sequenceStepModel.$inferInsert> {
  const {
    order,
    delayDays,
    delayMinutes,
    delayUnit,
    flowId,
    specificDateTime,
    isActive,
    anytime,
    sendTimeStart,
    sendTimeEnd,
    sendDays,
  } = parsedInput

  return {
    order,
    ...(delayDays !== undefined && { delayDays }),
    ...(delayMinutes !== undefined && { delayMinutes }),
    ...(delayUnit !== undefined && { delayUnit }),
    ...(flowId !== undefined && { flowId }),
    ...(specificDateTime !== undefined && {
      specificDateTime: specificDateTime ? new Date(specificDateTime) : null,
    }),
    ...(isActive !== undefined && { isActive }),
    ...(anytime !== undefined && { anytime }),
    ...(sendTimeStart !== undefined && {
      sendTimeStart: sendTimeStart || null,
    }),
    ...(sendTimeEnd !== undefined && { sendTimeEnd: sendTimeEnd || null }),
    ...(sendDays !== undefined && {
      sendDays: sendDays ? JSON.stringify(sendDays) : null,
    }),
  }
}

export function buildCreateData(
  parsedInput: SequenceStepPayloadInput,
  sequenceId: string,
  id: string,
): typeof sequenceStepModel.$inferInsert {
  const {
    order,
    delayDays,
    delayMinutes,
    delayUnit,
    flowId,
    specificDateTime,
    isActive,
    anytime,
    sendTimeStart,
    sendTimeEnd,
    sendDays,
  } = parsedInput

  return {
    id,
    sequenceId,
    order,
    delayDays: delayDays ?? 1,
    delayMinutes: delayMinutes ?? 0,
    delayUnit: delayUnit ?? "days",
    flowId: flowId ?? null,
    specificDateTime: specificDateTime ? new Date(specificDateTime) : null,
    isActive: isActive ?? true,
    anytime: anytime ?? true,
    sendTimeStart: sendTimeStart || null,
    sendTimeEnd: sendTimeEnd || null,
    sendDays: sendDays ? JSON.stringify(sendDays) : null,
  }
}

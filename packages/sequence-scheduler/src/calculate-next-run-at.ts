import { db, type Transaction } from "@aha.chat/database/client"
import { addMilliseconds } from "date-fns"

type DrizzleClient = typeof db | Transaction

export type SequenceStepDelay = {
  delayDays: number
  delayMinutes: number
  delayUnit: string | null
  specificDateTime: Date | null
}

const MINUTE_IN_MS = 60_000
const DAY_IN_MS = 24 * 60 * MINUTE_IN_MS

export function calculateNextRunAtFromStep(
  step: SequenceStepDelay,
  baseTime: Date = new Date(),
): Date {
  if (step.delayUnit === "specificTime" && step.specificDateTime) {
    return new Date(step.specificDateTime.getTime())
  }

  const delayMs = step.delayDays * DAY_IN_MS + step.delayMinutes * MINUTE_IN_MS

  if (delayMs <= 0) {
    return baseTime
  }

  return addMilliseconds(baseTime, delayMs)
}

export async function calculateNextRunAt(
  sequenceId: string,
  enrolledAt: Date = new Date(),
  tx?: DrizzleClient,
): Promise<{ nextRunAt: Date; nextStepId: string | null }> {
  const client = tx ?? db

  const firstStep = await client.query.sequenceStepModel.findFirst({
    where: {
      sequenceId,
      order: 0,
      isActive: true,
    },
    columns: {
      id: true,
      delayDays: true,
      delayMinutes: true,
      delayUnit: true,
      specificDateTime: true,
    },
  })

  if (!firstStep) {
    return { nextRunAt: enrolledAt, nextStepId: null }
  }

  return {
    nextRunAt: calculateNextRunAtFromStep(firstStep, enrolledAt),
    nextStepId: firstStep.id,
  }
}

import { db, type Transaction } from "@aha.chat/database/client"

type DrizzleClient = typeof db | Transaction

export interface SequenceStepDelay {
  delayDays: number
  delayMinutes: number
  delayUnit: string | null
  specificDateTime: Date | null
}

export function calculateNextRunAtFromStep(
  step: SequenceStepDelay,
  baseTime: Date = new Date(),
): Date {
  if (step.delayUnit === "specificTime" && step.specificDateTime) {
    return new Date(step.specificDateTime)
  }

  const delayMs =
    step.delayDays * 24 * 60 * 60 * 1000 + step.delayMinutes * 60 * 1000

  return delayMs > 0 ? new Date(baseTime.getTime() + delayMs) : baseTime
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

  const nextRunAt = calculateNextRunAtFromStep(firstStep, enrolledAt)

  return {
    nextRunAt,
    nextStepId: firstStep.id,
  }
}

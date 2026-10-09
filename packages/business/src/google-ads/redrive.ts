import { googleAdsConversionEventRepository } from "@chatbotx.io/database/repositories"
import type { GoogleAdsConversionEventModel } from "@chatbotx.io/database/types"
import { enqueueSend } from "./send-queue"
import { computeSendDelayMs } from "./timing"

/**
 * Moves an event to its next generation and schedules it behind the 6 h click
 * gate. Null when the fenced redrive lost a race (the row moved on), in which
 * case nothing is enqueued.
 */
export const redriveAndEnqueue = async (
  input: Parameters<typeof googleAdsConversionEventRepository.redrive>[0],
  now: Date,
): Promise<GoogleAdsConversionEventModel | null> => {
  const redriven = await googleAdsConversionEventRepository.redrive(input)
  if (!redriven) {
    return null
  }
  await enqueueSend(
    redriven,
    redriven.attempt,
    computeSendDelayMs(redriven.googleClickReceivedAt, now),
  )
  return redriven
}

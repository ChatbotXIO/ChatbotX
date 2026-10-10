import {
  googleAdsConversionEventRepository,
  type ListGoogleAdsEventsInput,
} from "@chatbotx.io/database/repositories"
import { type DeliverInput, deliverGoogleAdsConversion } from "./delivery"
import {
  pollGoogleAdsProcessingStatus,
  sweepStrandedGoogleAdsEvents,
  syncGoogleAdsSetups,
} from "./housekeeping"
import {
  type RecordConversionInput,
  type RecordConversionResult,
  recordGoogleAdsConversion,
} from "./record-conversion"
import { redriveAndEnqueue } from "./redrive"
import { getGoogleAdsStats } from "./stats"
import type { GetGoogleAdsStatsInput } from "./stats-schema"

export type RetryEventResult =
  | { status: "retried" }
  | { status: "notRetryable" }

/** Producers, delivery and housekeeping of Google Ads conversions. */
export const googleAdsConversionService = {
  record: (input: RecordConversionInput): Promise<RecordConversionResult> =>
    recordGoogleAdsConversion(input),

  deliver: (input: DeliverInput): Promise<void> =>
    deliverGoogleAdsConversion(input),

  pollProcessingStatus: pollGoogleAdsProcessingStatus,

  sweepStranded: sweepStrandedGoogleAdsEvents,

  syncSetups: syncGoogleAdsSetups,

  /** One page of the workspace's event history (the repository clamps `perPage`). */
  listEvents: (input: ListGoogleAdsEventsInput) =>
    googleAdsConversionEventRepository.listByWorkspace(input),

  /** Conversion statistics over a window (days in the caller's timezone, by conversion time). */
  getStats: (input: GetGoogleAdsStatsInput) => getGoogleAdsStats(input),

  /** Whether the workspace has ever recorded a conversion (any date). */
  hasAnyEvent: (workspaceId: string): Promise<boolean> =>
    googleAdsConversionEventRepository.existsForWorkspace(workspaceId),

  /** Redrives a failed event as a new generation (the history UI's Retry). */
  async retry(input: {
    id: string
    workspaceId: string
  }): Promise<RetryEventResult> {
    const event =
      await googleAdsConversionEventRepository.findWorkspaceEvent(input)
    if (event?.status !== "failed") {
      return { status: "notRetryable" }
    }
    const redriven = await redriveAndEnqueue(
      { ...input, fromStatuses: ["failed"], expectedAttempt: event.attempt },
      new Date(),
    )
    return { status: redriven ? "retried" : "notRetryable" }
  },
}

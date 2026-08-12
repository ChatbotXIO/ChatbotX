import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const AdsConversionJobAction = {
  sendConversionEvent: "sendConversionEvent",
  evaluateTemplateSent: "evaluateTemplateSent",
  evaluateConversionTrigger: "evaluateConversionTrigger",
  syncRetargetAudience: "syncRetargetAudience",
} as const

export type AdsConversionJobSendConversionEvent = {
  type: typeof AdsConversionJobAction.sendConversionEvent
  data: {
    adsConversionEventId: string
    workspaceId: string
  }
}

export type AdsConversionJobEvaluateTemplateSent = {
  type: typeof AdsConversionJobAction.evaluateTemplateSent
  data: {
    workspaceId: string
    integrationWhatsappId: string
    contactInboxId: string
    templateId: string
  }
}

/**
 * Generic conversion-trigger evaluation job shared by every trigger type
 * beyond `templateSent` (tagApplied, keywordMatched, contactReplied). The
 * `occurrence` discriminant carries just enough context for
 * `adsConversionService.evaluateConversionTrigger` to match it against each
 * enabled rule's `trigger` — see `packages/business/src/ads-conversion/schema.ts`.
 */
export type AdsConversionJobEvaluateConversionTrigger = {
  type: typeof AdsConversionJobAction.evaluateConversionTrigger
  data: {
    workspaceId: string
    integrationWhatsappId: string
    contactInboxId: string
    occurrence:
      | { type: "tagApplied"; tagId: string }
      | { type: "keywordMatched"; automatedResponseId: string }
      | { type: "contactReplied"; isFirstReply: boolean }
  }
}

export type AdsConversionJobSyncRetargetAudience = {
  type: typeof AdsConversionJobAction.syncRetargetAudience
  data: {
    workspaceId: string
    customAudienceId: string
    segment: "conversations" | "leads" | "purchases"
    adId?: string | null
    integrationWhatsappId?: string
    since: string
    until: string
  }
}

export type AdsConversionJobData =
  | AdsConversionJobSendConversionEvent
  | AdsConversionJobEvaluateTemplateSent
  | AdsConversionJobEvaluateConversionTrigger
  | AdsConversionJobSyncRetargetAudience

export const adsConversionQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<AdsConversionJobData>(queueNames.enum.adsConversion, {
        connection: getRedisConnection(),
        defaultJobOptions: {
          ...defaultJobOptions,
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 30_000,
          },
        },
      })

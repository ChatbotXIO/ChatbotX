import { z } from "zod"
import type { SocialProvider } from "../../partials/social-account"
import type {
  SocialContentType,
  SocialPostTargetStatus,
} from "../../partials/social-post"

/**
 * What writing the attempt marker decided: `leaseLost` (the claim is no longer
 * ours) or `reservationTaken` (a newer attempt reserved the destination, so
 * nothing may be sent).
 */
export const attemptMarkResults = z.enum([
  "marked",
  "leaseLost",
  "reservationTaken",
])
export type AttemptMarkResult = z.infer<typeof attemptMarkResults>

/** Why a publish attempt did not produce a post, as the target stores it. */
export type SocialTargetError = {
  category: string
  code: string
  message: string
}

export type SocialTargetContinuation = Record<string, string | number | boolean>

/**
 * What one attempt (or one recovery step) decided for a target. Written by
 * `settle` in one conditional UPDATE that presents the claim's lease.
 */
export type SocialTargetOutcome =
  | {
      externalPostId: string
      kind: "published"
      permalink: string | null
      publishedAt: Date
    }
  | {
      // The head is on the network but follow-up parts remain: the target stays
      // `processing` (no lease; each part has its own) until every part is out.
      externalPostId: string
      kind: "headPublished"
      permalink: string | null
      publishedAt: Date
    }
  | {
      continuation: SocialTargetContinuation
      kind: "processing"
      /** When the recovery scan reads the provider-side status again. */
      nextCheckAt: Date
    }
  | {
      /**
       * `rateLimit`: a limit answer, a budget apart from the network-error
       * attempts: it spends no attempt (`attemptCount` is given back) and
       * counts in `rateLimitAttempts`.
       */
      budget?: "rateLimit"
      error: SocialTargetError | null
      kind: "retry"
      nextAttemptAt: Date
    }
  | {
      error: SocialTargetError
      /** The claim's attempt is returned (nothing was sent). */
      giveAttemptBack?: boolean
      kind: "failed"
    }
  | { error: SocialTargetError; kind: "needsReview" }

/** A target taken by a worker: the lease is the proof every later write presents. */
export type ClaimedSocialTarget = {
  attemptCount: number
  leaseUntil: Date
}

/** A target whose lease ran out, taken over by the recovery scan. */
export type ExpiredSocialTarget = {
  attemptCount: number
  continuation: SocialTargetContinuation | null
  id: string
  leaseUntil: Date
  publishStartedAt: Date | null
  socialPostId: string
  status: SocialPostTargetStatus
  workspaceId: string
}

export type SocialTargetForPublish = {
  /** Rate-limit retries already used (their own budget). */
  rateLimitAttempts: number
  /** The TikTok publishing login; `null` for a destination published with an inbox token. */
  accountId: string | null
  accountProvider: SocialProvider
  accountStatus: "connected" | "needsReauth" | "disconnected" | null
  attemptCount: number
  contentType: SocialContentType
  continuation: SocialTargetContinuation | null
  /** The TikTok destination's external id; `null` for the inbox networks (see the credential source). */
  destinationExternalId: string | null
  destinationId: string
  destinationIsActive: boolean
  inboxId: string | null
  /** Set once the head is published. */
  externalPostId: string | null
  id: string
  linkUrl: string | null
  options: Record<string, boolean | string | number>
  overridesMedia: boolean
  /** The head's permalink once it is published. */
  permalink: string | null
  /** Follow-up parts the target carries; the head settles as `headPublished` when there are any. */
  partCount: number
  postText: string | null
  provider: SocialProvider
  publishedAt: Date | null
  publishStartedAt: Date | null
  socialPostId: string
  status: SocialPostTargetStatus
  textOverride: string | null
  workspaceId: string
}

/** An inbox that reads the same account a destination publishes to. */
export type SocialDestinationInbox = {
  channel: string
  inboxId: string
  integrationId: string
}

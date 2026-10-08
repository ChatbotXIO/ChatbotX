import {
  type GoogleAdsCustomerPropertiesSnapshot,
  type GoogleAdsMatchingSnapshot,
  type GoogleAdsProcessingDetail,
  googleAdsEventOptionsSchema,
} from "@chatbotx.io/database/partials"
import { googleAdsConversionEventRepository } from "@chatbotx.io/database/repositories"
import type { GoogleAdsConversionEventModel } from "@chatbotx.io/database/types"
import {
  GOOGLE_ADS_FAILURE_MESSAGES,
  type GoogleAdsAuthValue,
  GoogleAdsException,
  type GoogleAdsIngestConsent,
  type GoogleAdsIngestOutcome,
  type GoogleAdsUploadMethod,
  integration as integrationGoogleAds,
  missingRequiredScopes,
  NOT_ALLOWLISTED_REASON,
  parseScopes,
  parseUploadMethod,
  sanitizeGoogleAdsError,
} from "@chatbotx.io/integration-google-ads"
import { AuthException, AuthRefreshException } from "@chatbotx.io/sdk"
import { z } from "zod"
import { logProviderError } from "../error-log/service"
import {
  type GoogleAdsSetup,
  integrationGoogleAdsService,
} from "../integration-google-ads/service"
import { logger } from "../logger"
import { consentForTransport } from "./consent"
import {
  loadMatchingIdentifiers,
  type MatchingTemplateResolver,
} from "./customer-matching"
import { userPropertiesOf } from "./customer-properties"
import { resolveLoginAccountId } from "./login-account"
import { enqueueSend } from "./send-queue"
import {
  computeSendDelayMs,
  FIRST_PROCESSING_CHECK_MS,
  isConversionExpired,
  MAX_REDRIVE_GENERATIONS,
  PROCESSING_REDRIVE_DELAY_MS,
  REDRIVE_DELAY_MS,
} from "./timing"

export type DeliverInput = {
  eventId: string
  workspaceId: string
  /** The redrive generation the job was enqueued for. */
  attempt: number
  /** BullMQ will not retry this job again after this run. */
  isLastInJobAttempt: boolean
  /** Replaces the customer-matching `{{variable}}`s with the contact's values; the worker provides it. */
  resolveMatchingTemplates: MatchingTemplateResolver
}

export type Lease = { id: string; workspaceId: string; claimToken: string }

/** What to do with a claimed event before any request is sent. */
export type DeliveryGuardOutcome =
  | { kind: "skip"; status: "skipped_no_account" | "skipped_expired" }
  | { kind: "defer"; delayMs: number; reason: string }

/**
 * Whether the connection's stored grant lacks a scope the EVENT's pinned method
 * needs (e.g. a Data Manager event after the workspace reconnected as legacy,
 * `adwords` only). A row without a recorded scope predates the check and passes.
 */
const lacksScopesForEvent = (
  event: GoogleAdsConversionEventModel,
  setup: GoogleAdsSetup,
): boolean => {
  const storedScope = (setup.integration.auth as GoogleAdsAuthValue | null)
    ?.metadata?.scope
  if (!storedScope) {
    return false
  }
  return (
    missingRequiredScopes(
      parseScopes(storedScope),
      parseUploadMethod(event.uploadMethod),
    ).length > 0
  )
}

/**
 * Pure pre-flight checks, in order: the account must still be the one the
 * event was recorded against, the click must not be expired (advisory, plan
 * §6 rules A/B; Google stays authoritative), the grant must be usable, and the
 * click must be old enough for Google.
 */
export const evaluateDeliveryGuards = (input: {
  event: GoogleAdsConversionEventModel
  setup: GoogleAdsSetup | null
  now: Date
}): DeliveryGuardOutcome | null => {
  const { event, setup, now } = input
  if (
    !setup ||
    setup.integration.customerId !== event.customerId ||
    setup.integration.conversionCustomerId !== event.conversionCustomerId
  ) {
    return { kind: "skip", status: "skipped_no_account" }
  }
  if (
    isConversionExpired({
      occurredAt: event.occurredAt,
      googleClickReceivedAt: event.googleClickReceivedAt,
      lookbackWindowDays: event.lookbackWindowDays,
      now,
    })
  ) {
    return { kind: "skip", status: "skipped_expired" }
  }
  // An insufficient grant is recoverable by reconnecting: defer, never fail or send.
  if (
    setup.connection?.status === "needs_reauth" ||
    lacksScopesForEvent(event, setup)
  ) {
    return { kind: "defer", delayMs: REDRIVE_DELAY_MS, reason: "needs_reauth" }
  }
  if (setup.readiness !== "ready") {
    return { kind: "skip", status: "skipped_no_account" }
  }
  const waitMs = computeSendDelayMs(event.googleClickReceivedAt, now)
  return waitMs > 0
    ? { kind: "defer", delayMs: waitMs, reason: "click_too_recent" }
    : null
}

/**
 * Terminal auth failure: the grant itself is unusable. The SDK throws an
 * `AuthRefreshException` for exhausted refresh attempts too, but only wraps an
 * `AuthException` origin (revoked / invalid_grant) when the failure is terminal;
 * any other origin is a transient refresh outage that must retry normally.
 */
const isTerminalAuthFailure = (error: unknown): boolean =>
  error instanceof AuthException ||
  (error instanceof AuthRefreshException &&
    error.getOriginError() instanceof AuthException)

const logLostClaim = (
  event: GoogleAdsConversionEventModel,
  action: string,
): void => {
  logger.warn(
    {
      eventId: event.id,
      workspaceId: event.workspaceId,
      attempt: event.attempt,
    },
    `google ads: lease lost before ${action}; another worker owns this generation`,
  )
}

const isLegacyNotAllowed = (error: unknown): boolean =>
  error instanceof GoogleAdsException && error.reason === NOT_ALLOWLISTED_REASON

export const failDelivery = async (
  event: GoogleAdsConversionEventModel,
  lease: Lease,
  error: unknown,
  options: { logProviderFailure: boolean } = { logProviderFailure: true },
): Promise<void> => {
  const sanitized = sanitizeGoogleAdsError(error, { secrets: [event.clickId] })
  // A stable cause has a fixed, actionable text; Google's wording is not kept.
  const message = isLegacyNotAllowed(error)
    ? GOOGLE_ADS_FAILURE_MESSAGES.legacy_upload_not_allowed
    : sanitized.message
  const finished = await googleAdsConversionEventRepository.finishSending({
    ...lease,
    to: "failed",
    error: message,
    failureStage: "delivery",
  })
  if (!finished) {
    logLostClaim(event, "recording the failure")
  }
  if (finished && options.logProviderFailure) {
    await logProviderError({
      provider: "google-ads",
      workspaceId: event.workspaceId,
      error: new Error(message),
      httpCode: sanitized.httpCode,
    })
  }
}

/** Gives the lease back and schedules the next generation, or fails once the generations run out. */
const deferDelivery = async (
  event: GoogleAdsConversionEventModel,
  lease: Lease,
  delayMs: number,
  reason: string,
): Promise<void> => {
  if (event.attempt >= MAX_REDRIVE_GENERATIONS) {
    await failDelivery(
      event,
      lease,
      new Error(`Delivery deferred too long: ${reason}`),
      { logProviderFailure: false },
    )
    return
  }
  const released = await googleAdsConversionEventRepository.releaseClaim({
    ...lease,
    nextAttempt: event.attempt + 1,
  })
  if (released) {
    await enqueueSend(released, released.attempt, delayMs)
  } else {
    logLostClaim(event, "deferring")
  }
}

const LEGACY_COMPLETED_STATUS = "LEGACY_UPLOAD_COMPLETED"
/** Stored when Google already held a replayed upload and its job id is unknown. */
const LEGACY_RECOVERED_REQUEST_ID = "legacy:recovered"

/** The developer token is optional: an unreadable credential just means none is sent. */
const optionalDeveloperToken = async (
  workspaceId: string,
): Promise<string | undefined> => {
  const token =
    await integrationGoogleAdsService.resolveDeveloperToken(workspaceId)
  return token.kind === "available" ? token.developerToken : undefined
}

const MAX_LOGGED_FIELD_WARNINGS = 10

/**
 * Data Manager `FieldWarning` is `{ reason, description, field }`. Only the
 * field path and the reason code are logged: `description` is free text that
 * can echo the value that was sent (a click id, and from the matching phase
 * an identifier), so it is never read.
 */
const fieldWarningSchema = z.object({
  field: z.string().optional().catch(undefined),
  reason: z.string().optional().catch(undefined),
})

const summarizeFieldWarning = (
  warning: unknown,
  secrets: readonly string[],
): { field?: string; reason?: string } => {
  const parsed = fieldWarningSchema.safeParse(warning)
  if (!parsed.success) {
    return {}
  }
  const { field, reason } = parsed.data
  const scrub = (value: string): string =>
    sanitizeGoogleAdsError(new Error(value), { secrets }).message
  return {
    ...(field ? { field: scrub(field) } : {}),
    ...(reason ? { reason: scrub(reason) } : {}),
  }
}

/** Data Manager accepted the request but flagged fields; log only their paths and reason codes. */
const logFieldWarnings = (
  event: GoogleAdsConversionEventModel,
  fieldWarnings: readonly unknown[] | undefined,
): void => {
  if (!fieldWarnings || fieldWarnings.length === 0) {
    return
  }
  const warnings = fieldWarnings
    .slice(0, MAX_LOGGED_FIELD_WARNINGS)
    .map((warning) => summarizeFieldWarning(warning, [event.clickId]))
  logger.warn(
    {
      eventId: event.id,
      workspaceId: event.workspaceId,
      warningCount: fieldWarnings.length,
      warnings,
    },
    "google ads: Data Manager returned field warnings",
  )
}

/** Detail of a legacy upload Google recorded synchronously. */
const legacyCompletionDetail = (
  sendAttemptedAt: string | undefined,
  duplicateRecovery: boolean,
): GoogleAdsProcessingDetail => ({
  requestStatus: LEGACY_COMPLETED_STATUS,
  recordCount: 1,
  errorCounts: [],
  warningCounts: [],
  ...(sendAttemptedAt ? { sendAttemptedAt } : {}),
  ...(duplicateRecovery ? { duplicateRecovery: true } : {}),
})

const completeDirectly = async (
  event: GoogleAdsConversionEventModel,
  lease: Lease,
  input: {
    requestId: string
    sentAt: Date
    duplicateRecovery: boolean
    stamp: string | undefined
  },
): Promise<void> => {
  const done = await googleAdsConversionEventRepository.finishSendingProcessed({
    ...lease,
    attempt: event.attempt,
    requestId: input.requestId,
    sentAt: input.sentAt,
    processingDetail: legacyCompletionDetail(
      input.stamp,
      input.duplicateRecovery,
    ),
  })
  if (!done) {
    logLostClaim(event, "recording the completed upload")
  }
}

const stampOf = (event: GoogleAdsConversionEventModel): string | undefined =>
  event.processingDetail?.sendAttemptedAt

type SendContext = {
  event: GoogleAdsConversionEventModel
  lease: Lease
  /** An upload for this event may already have left the process. */
  isReplay: boolean
  /** `sendAttemptedAt` as stamped under this lease. */
  stamp: string | undefined
}

const handleLegacyOutcome = async (
  context: SendContext,
  outcome: Exclude<GoogleAdsIngestOutcome, { kind: "accepted" }>,
): Promise<void> => {
  const { event, lease, isReplay, stamp } = context
  switch (outcome.kind) {
    case "completed": {
      logFieldWarnings(event, outcome.fieldWarnings)
      await completeDirectly(event, lease, {
        requestId: outcome.requestId,
        sentAt: new Date(),
        duplicateRecovery: false,
        stamp,
      })
      return
    }
    case "duplicate": {
      if (isReplay) {
        await completeDirectly(event, lease, {
          requestId: LEGACY_RECOVERED_REQUEST_ID,
          sentAt: new Date(),
          duplicateRecovery: true,
          stamp,
        })
        return
      }
      await failDelivery(
        event,
        lease,
        new Error("Google already holds this conversion"),
      )
      return
    }
    case "retry": {
      await deferDelivery(
        event,
        lease,
        outcome.reason === "tooRecent"
          ? PROCESSING_REDRIVE_DELAY_MS
          : REDRIVE_DELAY_MS,
        `google_${outcome.reason}`,
      )
      return
    }
    case "validated": {
      await failDelivery(
        event,
        lease,
        new Error("Google answered a validation result to a real upload"),
      )
      return
    }
    default: {
      const exhaustive: never = outcome
      throw new Error(`Unhandled upload outcome: ${String(exhaustive)}`)
    }
  }
}

const UNSUPPORTED_OPTIONS_MESSAGE = "Unsupported conversion options version"

/**
 * What this event's immutable options snapshot says to send: the consent its
 * pinned transport carries and the customer-matching configuration. No
 * snapshot = no consent and no matching; an unreadable one (e.g. a newer
 * version) must never be guessed.
 */
const snapshotOf = (
  event: GoogleAdsConversionEventModel,
  uploadMethod: GoogleAdsUploadMethod,
):
  | {
      ok: true
      consent: GoogleAdsIngestConsent | undefined
      matching: GoogleAdsMatchingSnapshot | undefined
      customerProperties: GoogleAdsCustomerPropertiesSnapshot | undefined
    }
  | { ok: false } => {
  if (!event.options) {
    return {
      ok: true,
      consent: undefined,
      matching: undefined,
      customerProperties: undefined,
    }
  }
  const options = googleAdsEventOptionsSchema.safeParse(event.options)
  if (!options.success) {
    return { ok: false }
  }
  return {
    ok: true,
    consent: consentForTransport(options.data.consent, uploadMethod).sent,
    matching: options.data.version === 2 ? options.data.matching : undefined,
    customerProperties:
      options.data.version === 2 ? options.data.customerProperties : undefined,
  }
}

const sendToGoogle = async (
  event: GoogleAdsConversionEventModel,
  lease: Lease,
  setup: GoogleAdsSetup,
  resolveMatchingTemplates: MatchingTemplateResolver | undefined,
): Promise<void> => {
  // Routed by the event's pinned transport, never by the live credential.
  const uploadMethod = parseUploadMethod(event.uploadMethod)
  const snapshot = snapshotOf(event, uploadMethod)
  if (!snapshot.ok) {
    // A local version mismatch, not a Google failure: keep it out of the provider Error Log.
    await failDelivery(event, lease, new Error(UNSUPPORTED_OPTIONS_MESSAGE), {
      logProviderFailure: false,
    })
    return
  }
  const isReplay = Boolean(stampOf(event))
  let stamp = stampOf(event)
  if (uploadMethod === "legacy") {
    const marked = await googleAdsConversionEventRepository.markSendAttempted({
      ...lease,
      attempt: event.attempt,
      at: new Date(),
    })
    if (!marked) {
      logLostClaim(event, "starting the upload")
      return
    }
    stamp = stampOf(marked)
  }
  const ctx = await integrationGoogleAdsService.buildActionContext(
    event.workspaceId,
    setup.integration,
  )
  // Google fails an event that carries user data when the account has not signed
  // the enhanced-conversions terms (`DESTINATION_ACCOUNT_ENHANCED_CONVERSIONS_
  // TERMS_NOT_SIGNED`); the click alone would have been recorded.
  // Only a confirmed `true` sends user data; unknown is treated as not accepted.
  const termsAccepted = setup.integration.acceptedCustomerDataTerms === true
  const userIdentifiers = termsAccepted
    ? await loadMatchingIdentifiers(
        event,
        snapshot.matching,
        resolveMatchingTemplates,
      )
    : undefined
  if (snapshot.matching?.status === "enabled" && !termsAccepted) {
    logger.info(
      { eventId: event.id, workspaceId: event.workspaceId },
      "google ads: customer data terms not accepted, customer matching withheld, sent by click only",
    )
  } else if (snapshot.matching?.status === "enabled" && !userIdentifiers) {
    // Counts and ids only: never the value, its hash or which field was empty.
    logger.info(
      { eventId: event.id, workspaceId: event.workspaceId },
      "google ads: customer matching had no usable identifier, sent by click only",
    )
  }
  const outcome = await integrationGoogleAds.runAction("ingestEvent", {
    ctx,
    props: {
      uploadMethod,
      developerToken:
        uploadMethod === "legacy"
          ? await optionalDeveloperToken(event.workspaceId)
          : undefined,
      loginAccountId: resolveLoginAccountId({
        customerId: setup.integration.customerId,
        loginCustomerId: setup.integration.loginCustomerId,
        conversionCustomerId: event.conversionCustomerId,
      }),
      operatingAccountId: event.conversionCustomerId,
      conversionActionId: event.conversionActionId,
      event: {
        transactionId: event.transactionId,
        eventTimestamp: event.occurredAt,
        clickIdType: event.clickIdType,
        clickId: event.clickId,
        value: event.value === null ? undefined : Number(event.value),
        currency: event.currency ?? undefined,
        consent: snapshot.consent,
        userIdentifiers,
        userProperties: userPropertiesOf(snapshot.customerProperties),
      },
    },
  })
  if (outcome.kind !== "accepted") {
    await handleLegacyOutcome({ event, lease, isReplay, stamp }, outcome)
    return
  }
  const { requestId, fieldWarnings } = outcome
  if (!requestId) {
    await failDelivery(
      event,
      lease,
      new Error("Data Manager accepted the request without a request id"),
    )
    return
  }
  logFieldWarnings(event, fieldWarnings)
  const now = new Date()
  const sent = await googleAdsConversionEventRepository.finishSending({
    ...lease,
    to: "sent",
    requestId,
    sentAt: now,
    processingStatus: "processing",
    nextProcessingCheckAt: new Date(now.getTime() + FIRST_PROCESSING_CHECK_MS),
  })
  if (!sent) {
    logLostClaim(event, "recording the send")
  }
}

const runClaimed = async (
  event: GoogleAdsConversionEventModel,
  lease: Lease,
  resolveMatchingTemplates: MatchingTemplateResolver | undefined,
): Promise<void> => {
  const setup = await integrationGoogleAdsService.getSetup(event.workspaceId)
  const guard = evaluateDeliveryGuards({ event, setup, now: new Date() })
  if (guard?.kind === "skip") {
    const skipped = await googleAdsConversionEventRepository.finishSending({
      ...lease,
      to: guard.status,
    })
    if (!skipped) {
      logLostClaim(event, "skipping")
    }
    return
  }
  if (guard?.kind === "defer") {
    await deferDelivery(event, lease, guard.delayMs, guard.reason)
    return
  }
  if (!setup) {
    return
  }
  try {
    await sendToGoogle(event, lease, setup, resolveMatchingTemplates)
  } catch (error) {
    if (isTerminalAuthFailure(error)) {
      await deferDelivery(event, lease, REDRIVE_DELAY_MS, "needs_reauth")
      return
    }
    throw error
  }
}

const ACTION_TOO_RECENT_REASON = "CONVERSION_ACTION_TOO_RECENTLY_CREATED"

/**
 * A Google failure that is valid later, so the event is deferred (as the legacy
 * path does) rather than failed: Data Manager's "conversion action created too
 * recently", and an outage or quota error (408, 429, 5xx) once BullMQ's own
 * retries are used up.
 */
const deferralOf = (
  error: unknown,
  isLastInJobAttempt: boolean,
): { delayMs: number; reason: string } | undefined => {
  if (!(error instanceof GoogleAdsException)) {
    return
  }
  if (error.reason?.endsWith(ACTION_TOO_RECENT_REASON)) {
    return {
      delayMs: PROCESSING_REDRIVE_DELAY_MS,
      reason: "conversion_action_too_recent",
    }
  }
  if (error.retryable && isLastInJobAttempt) {
    return { delayMs: REDRIVE_DELAY_MS, reason: "google_unavailable" }
  }
}

/**
 * One delivery attempt of one event generation. Exactly one worker holds the
 * lease; a stale job, a duplicate delivery or a concurrent sweeper claims
 * nothing. Transient failures keep the generation and rethrow for BullMQ's own
 * retries; terminal failures, and the last retry of a non-Google error, fail
 * the event.
 */
export const deliverGoogleAdsConversion = async (
  input: DeliverInput,
): Promise<void> => {
  const lease: Lease = {
    id: input.eventId,
    workspaceId: input.workspaceId,
    claimToken: crypto.randomUUID(),
  }
  const event = await googleAdsConversionEventRepository.claimForSending({
    ...lease,
    attempt: input.attempt,
  })
  if (!event) {
    return
  }
  try {
    await runClaimed(event, lease, input.resolveMatchingTemplates)
  } catch (error) {
    const deferral = deferralOf(error, input.isLastInJobAttempt)
    if (deferral) {
      await deferDelivery(event, lease, deferral.delayMs, deferral.reason)
      return
    }
    const terminal = error instanceof GoogleAdsException && !error.retryable
    if (terminal || input.isLastInJobAttempt) {
      await failDelivery(event, lease, error)
      return
    }
    const released = await googleAdsConversionEventRepository.releaseClaim({
      ...lease,
      nextAttempt: event.attempt,
    })
    if (!released) {
      logLostClaim(event, "releasing for retry")
    }
    // BullMQ persists and logs the thrown error, so it must not echo the click id.
    throw new Error(
      sanitizeGoogleAdsError(error, { secrets: [event.clickId] }).message,
    )
  }
}

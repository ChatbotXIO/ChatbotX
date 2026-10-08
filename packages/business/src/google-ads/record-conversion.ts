import type {
  GoogleAdsEventOptions,
  GoogleAdsEventSource,
  GoogleAdsIdentityPolicy,
} from "@chatbotx.io/database/partials"
import {
  contactInboxRepository,
  googleAdsConversionEventRepository,
} from "@chatbotx.io/database/repositories"
import type { GoogleAdsConversionEventModel } from "@chatbotx.io/database/types"
import {
  type GoogleAdsAuthValue,
  sanitizeGoogleAdsError,
  uploadMethodOf,
} from "@chatbotx.io/integration-google-ads"
import {
  type GoogleAdsChannel,
  googleAdsChannels,
  hasGoogleClick,
  isEnabledConversionAction,
  isExternalAttributionAction,
  isOnePerClickAction,
} from "@chatbotx.io/utils/google-click"
import { integrationGoogleAdsService } from "../integration-google-ads/service"
import {
  type GoogleAdsConsentInput,
  googleAdsConsentInputSchema,
} from "./consent"
import { buildMatchingSnapshot } from "./customer-matching"
import {
  buildCustomerPropertiesSnapshot,
  type CustomerPropertiesInput,
  parseCustomerProperties,
} from "./customer-properties"
import { redriveAndEnqueue } from "./redrive"
import {
  resolvedConversionTimeSchema,
  resolvedConversionValueSchema,
  resolvedDedupIdSchema,
} from "./schema"
import { enqueueSend, isSendJobLive } from "./send-queue"
import { computeSendDelayMs, MAX_REDRIVE_GENERATIONS } from "./timing"
import { buildTransactionId } from "./transaction-id"

export type RecordConversionInput = {
  workspaceId: string
  contactInboxId: string
  source: GoogleAdsEventSource
  /** Flow step id or trigger id; stored for the history, never part of the identity. */
  scopeId: string
  conversionActionId: string
  value?: string
  currency?: string
  /**
   * Read by the producer BEFORE template resolution; the conversion time when
   * no time is provided. (`record` reads its own `validationNow` afterwards.)
   */
  recordedAt: Date
  dedupMode: GoogleAdsIdentityPolicy
  /** Resolved order or event ID; required in `id` mode, ignored (and not stored) otherwise. */
  dedupId?: string
  /**
   * Durable key of this occurrence, required in `event` mode and ignored
   * otherwise. The producer builds it from something that survives its own
   * retries (queue job id + step or action); a random or time-based value
   * would turn every retry into a new conversion.
   */
  occurrenceKey?: string
  /** Resolved conversion time (RFC 3339 with a zone); blank = use `recordedAt`. */
  conversionTime?: string
  consent: GoogleAdsConsentInput
  /**
   * Customer matching: the step's `{{variable}}` for each identifier, unresolved.
   * Configuration only: the values are resolved from the contact and hashed at
   * delivery, never recorded here.
   */
  matchEmail?: string
  matchPhone?: string
  /** Resolved customer properties (NEW / RETURNING, LOW / MEDIUM / HIGH); blank = not set. */
  customerType?: CustomerPropertiesInput["customerType"]
  customerValueBucket?: CustomerPropertiesInput["customerValueBucket"]
}

export type RecordConversionResult =
  | { status: "queued"; event: GoogleAdsConversionEventModel }
  /** The inbox carries no Google click (or no usable capture time). */
  | { status: "noClick" }
  /** The inbox's channel is not in `GOOGLE_ADS_CHANNEL_VALUES`. */
  | { status: "unsupportedChannel" }
  /** The workspace has no ready Google Ads account. */
  | { status: "noAccount" }
  | { status: "unknownConversionAction" }
  | { status: "actionDisabled" }
  /** A gbraid click was recorded against a ONE_PER_CLICK action, which Data Manager rejects. */
  | { status: "incompatibleAction" }
  /** The action uses external attribution, which Data Manager cannot ingest. */
  | { status: "unsupportedAction" }
  | { status: "invalidValue" }
  /** `id` mode without a resolved order or event ID. */
  | { status: "missingDedupId" }
  /** The resolved order or event ID is longer than 64 characters. */
  | { status: "invalidDedupId" }
  /** `event` mode without a durable occurrence key (the producer could not provide one). */
  | { status: "missingOccurrenceKey" }
  /** A customer type or value bucket that is set but not one of the allowed values. */
  | { status: "invalidCustomerProperty" }
  | { status: "invalidConversionTime"; reason: "malformed" | "future" }

const readClick = (
  referral: GoogleClickReferralLike,
): {
  clickIdType: "gclid" | "gbraid"
  clickId: string
  receivedAt: Date
} | null => {
  const clickId = referral.gclid ?? referral.gbraid
  const receivedAt = referral.googleClickReceivedAt
    ? new Date(referral.googleClickReceivedAt)
    : null
  if (!(clickId && receivedAt) || Number.isNaN(receivedAt.getTime())) {
    return null
  }
  return {
    clickIdType: referral.gclid ? "gclid" : "gbraid",
    clickId,
    receivedAt,
  }
}

type GoogleClickReferralLike = {
  gclid?: string | null
  gbraid?: string | null
  googleClickReceivedAt?: string | null
}

type Click = NonNullable<ReturnType<typeof readClick>>
type ConversionAction = NonNullable<
  NonNullable<
    Awaited<ReturnType<typeof integrationGoogleAdsService.getSetup>>
  >["integration"]["conversionActions"]
>[number]
type Setup = NonNullable<
  Awaited<ReturnType<typeof integrationGoogleAdsService.getSetup>>
>

type Refusal = Exclude<RecordConversionResult, { status: "queued" }>
type Guarded<T> = { ok: true; value: T } | { ok: false; refusal: Refusal }

const refuse = (
  status: Exclude<Refusal["status"], "invalidConversionTime">,
): { ok: false; refusal: Refusal } => ({
  ok: false,
  refusal: { status },
})

type Identity =
  | { mode: "click" }
  | { mode: "id"; dedupId: string }
  | { mode: "event"; occurrenceKey: string }

type ValidatedInput = {
  customerProperties: Extract<
    ReturnType<typeof parseCustomerProperties>,
    { ok: true }
  >["value"]
  value: string | null
  currency: string | null
  identity: Identity
  /** `undefined` = the conversion happened when it was recorded. */
  conversionTime: Date | undefined
  /** Parsed (unknown keys stripped), so nothing but the snapshot shape is stored. */
  consent: GoogleAdsConsentInput
}

const DEDUP_REFUSALS = {
  missing: "missingDedupId",
  invalid: "invalidDedupId",
} as const

const resolveIdentity = (input: RecordConversionInput): Guarded<Identity> => {
  if (input.dedupMode === "click") {
    return { ok: true, value: { mode: "click" } }
  }
  if (input.dedupMode === "event") {
    const occurrenceKey = input.occurrenceKey?.trim()
    return occurrenceKey
      ? { ok: true, value: { mode: "event", occurrenceKey } }
      : refuse("missingOccurrenceKey")
  }
  const dedupId = resolvedDedupIdSchema.parse(input.dedupId)
  if (dedupId.status !== "ok") {
    return refuse(DEDUP_REFUSALS[dedupId.status])
  }
  return { ok: true, value: { mode: "id", dedupId: dedupId.id } }
}

const validateInput = (
  input: RecordConversionInput,
  validationNow: Date,
): Guarded<ValidatedInput> => {
  const value = resolvedConversionValueSchema.safeParse({
    value: input.value,
    currency: input.currency,
  })
  if (!value.success) {
    return refuse("invalidValue")
  }
  const identity = resolveIdentity(input)
  if (!identity.ok) {
    return identity
  }
  const customerProperties = parseCustomerProperties(input)
  if (!customerProperties.ok) {
    return refuse("invalidCustomerProperty")
  }
  const time = resolvedConversionTimeSchema(validationNow).parse(
    input.conversionTime,
  )
  if (time.status !== "ok") {
    return {
      ok: false,
      refusal: { status: "invalidConversionTime", reason: time.status },
    }
  }
  return {
    ok: true,
    value: {
      value: value.data.value ?? null,
      currency: value.data.currency ?? null,
      identity: identity.value,
      customerProperties: customerProperties.value,
      conversionTime: time.time,
      // A malformed entry is a programmer error: producers pass `toConsentInput` output.
      consent: googleAdsConsentInputSchema.parse(input.consent),
    },
  }
}

/** Channel gate (single source: `GOOGLE_ADS_CHANNEL_VALUES`) + click presence. */
const resolveAttribution = async (
  input: RecordConversionInput,
): Promise<Guarded<{ channel: GoogleAdsChannel; click: Click }>> => {
  const attribution = await contactInboxRepository.findGoogleClickAttribution({
    workspaceId: input.workspaceId,
    contactInboxId: input.contactInboxId,
  })
  if (!attribution) {
    return refuse("noClick")
  }
  const channel = googleAdsChannels.safeParse(attribution.channel)
  if (!channel.success) {
    return refuse("unsupportedChannel")
  }
  const click = attribution.referral ? readClick(attribution.referral) : null
  if (!(click && hasGoogleClick(attribution.referral))) {
    return refuse("noClick")
  }
  return { ok: true, value: { channel: channel.data, click } }
}

const resolveSetup = async (
  input: RecordConversionInput,
): Promise<
  Guarded<{
    setup: Setup
    conversionCustomerId: string
    action: ConversionAction
  }>
> => {
  const setup = await integrationGoogleAdsService.getSetup(input.workspaceId)
  const conversionCustomerId = setup?.integration.conversionCustomerId
  if (!(setup && conversionCustomerId && setup.readiness === "ready")) {
    return refuse("noAccount")
  }
  const action = setup.integration.conversionActions?.find(
    ({ id }) => id === input.conversionActionId,
  )
  if (!action) {
    return refuse("unknownConversionAction")
  }
  if (!isEnabledConversionAction(action)) {
    return refuse("actionDisabled")
  }
  // PROCESSING_ERROR_REASON_EXTERNAL_ATTRIBUTION_DATA_MISSING: Data Manager
  // cannot ingest conversions attributed by a third party.
  if (isExternalAttributionAction(action)) {
    return refuse("unsupportedAction")
  }
  return { ok: true, value: { setup, conversionCustomerId, action } }
}

type Resolved = {
  input: RecordConversionInput
  fields: ValidatedInput
  channel: GoogleAdsChannel
  click: Click
  setup: Setup
  conversionCustomerId: string
  action: ConversionAction
}

const computeTransactionId = (r: Resolved): Promise<string> => {
  const scope = {
    workspaceId: r.input.workspaceId,
    conversionCustomerId: r.conversionCustomerId,
    conversionActionId: r.action.id,
  }
  const { identity } = r.fields
  switch (identity.mode) {
    case "id":
      return buildTransactionId({
        ...scope,
        mode: "id",
        dedupId: identity.dedupId,
      })
    case "event":
      return buildTransactionId({
        ...scope,
        mode: "event",
        occurrenceKey: identity.occurrenceKey,
      })
    default:
      return buildTransactionId({
        ...scope,
        mode: "click",
        clickId: r.click.clickId,
      })
  }
}

const KEY_SOURCES = {
  click: "click",
  id: "explicit",
  event: "occurrence",
} as const

/** Pinned for the event's whole life: delivery routes by this, never by the connection's current method. */
const uploadMethodOfResolved = (r: Resolved) =>
  uploadMethodOf(r.setup.integration.auth as GoogleAdsAuthValue)

/**
 * Immutable snapshot of how the event was identified, timed and consented.
 * v2 only when an enrichment is configured, so every other event keeps the
 * exact v1 shape (and replays byte for byte as before).
 */
const buildOptions = (r: Resolved): GoogleAdsEventOptions => {
  const { identity, conversionTime } = r.fields
  const base = {
    identity: {
      version: 1 as const,
      configuredPolicy: identity.mode,
      effectivePolicy: identity.mode,
      keySource: KEY_SOURCES[identity.mode],
      id: identity.mode === "id" ? identity.dedupId : null,
    },
    timeSource: conversionTime ? ("provided" as const) : ("recorded" as const),
    consent: r.fields.consent,
  }
  const matching = buildMatchingSnapshot({
    matchEmail: r.input.matchEmail,
    matchPhone: r.input.matchPhone,
    adUserDataStatus: r.fields.consent.adUserData.status,
    uploadMethod: uploadMethodOfResolved(r),
  })
  const customerProperties = buildCustomerPropertiesSnapshot({
    parsed: r.fields.customerProperties,
    adUserDataStatus: r.fields.consent.adUserData.status,
    uploadMethod: uploadMethodOfResolved(r),
  })
  if (!(matching || customerProperties)) {
    return { version: 1, ...base }
  }
  return {
    version: 2,
    ...base,
    ...(matching ? { matching } : {}),
    ...(customerProperties ? { customerProperties } : {}),
  }
}

const insertEvent = (r: Resolved, transactionId: string) =>
  googleAdsConversionEventRepository.insertIgnoreDuplicate({
    workspaceId: r.input.workspaceId,
    integrationGoogleAdsId: r.setup.integration.id,
    contactInboxId: r.input.contactInboxId,
    customerId: r.setup.integration.customerId,
    loginCustomerId: r.setup.integration.loginCustomerId,
    conversionCustomerId: r.conversionCustomerId,
    conversionActionId: r.action.id,
    conversionActionName: r.action.name,
    conversionActionCategory: r.action.category,
    lookbackWindowDays: r.action.clickThroughLookbackWindowDays,
    channel: r.channel,
    source: r.input.source,
    scopeId: r.input.scopeId,
    clickIdType: r.click.clickIdType,
    clickId: r.click.clickId,
    googleClickReceivedAt: r.click.receivedAt,
    // Stored as given: the click receipt is a proxy for the real click, so
    // no clamp and no occurredAt >= receipt rule; Google is authoritative.
    occurredAt: r.fields.conversionTime ?? r.input.recordedAt,
    value: r.fields.value,
    currency: r.fields.currency,
    transactionId,
    options: buildOptions(r),
    // A reconnect only affects NEW events.
    uploadMethod: uploadMethodOfResolved(r),
    status: "pending",
    attempt: 0,
    processingAttempts: 0,
  })

const persistAndEnqueue = async (
  r: Resolved,
): Promise<RecordConversionResult> => {
  const transactionId = await computeTransactionId(r)
  const now = new Date()
  const inserted = await insertEvent(r, transactionId)
  if (inserted) {
    await enqueueSend(inserted, 0, computeSendDelayMs(r.click.receivedAt, now))
    return { status: "queued", event: inserted }
  }
  const existing = await googleAdsConversionEventRepository.findByTransactionId(
    { workspaceId: r.input.workspaceId, transactionId },
  )
  if (!existing) {
    return { status: "noClick" }
  }
  await recoverUnscheduledEvent(existing, now)
  return { status: "queued", event: existing }
}

/**
 * Records one conversion for delivery. Every refusal is a typed outcome (no
 * row is written) so the flow step / trigger action can take its error branch.
 * Idempotent: a repeat of the same click (or order/event ID) recovers the existing event and
 * only re-enqueues it when its job is gone.
 */
export const recordGoogleAdsConversion = async (
  input: RecordConversionInput,
): Promise<RecordConversionResult> => {
  // Second clock: read after template resolution, used only for the future check.
  const fields = validateInput(input, new Date())
  if (!fields.ok) {
    return fields.refusal
  }
  const attribution = await resolveAttribution(input)
  if (!attribution.ok) {
    return attribution.refusal
  }
  const account = await resolveSetup(input)
  if (!account.ok) {
    return account.refusal
  }
  // PROCESSING_ERROR_REASON_ONE_PER_CLICK_CONVERSION_ACTION_NOT_PERMITTED_WITH_BRAID:
  // a gbraid (iOS) click needs an action that counts every conversion.
  if (
    attribution.value.click.clickIdType === "gbraid" &&
    isOnePerClickAction(account.value.action)
  ) {
    return { status: "incompatibleAction" }
  }
  const resolved: Resolved = {
    input,
    fields: fields.value,
    ...attribution.value,
    ...account.value,
  }
  try {
    return await persistAndEnqueue(resolved)
  } catch (error) {
    // Insert/enqueue receive the click id as a bound parameter; a driver error
    // can echo it, so only a sanitized plain Error may leave this function.
    throw new Error(
      sanitizeGoogleAdsError(error, { secrets: [resolved.click.clickId] })
        .message,
    )
  }
}

/** A duplicate whose job vanished (enqueue failed after insert) is redriven, not dropped. */
const recoverUnscheduledEvent = async (
  event: GoogleAdsConversionEventModel,
  now: Date,
): Promise<void> => {
  if (
    event.status !== "pending" ||
    event.claimToken ||
    event.attempt >= MAX_REDRIVE_GENERATIONS
  ) {
    return
  }
  if (await isSendJobLive(event.id, event.attempt)) {
    return
  }
  await redriveAndEnqueue(
    {
      id: event.id,
      workspaceId: event.workspaceId,
      fromStatuses: ["pending"],
      expectedAttempt: event.attempt,
    },
    now,
  )
}

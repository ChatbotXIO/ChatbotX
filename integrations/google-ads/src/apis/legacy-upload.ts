import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { customerIdSchema } from "@chatbotx.io/utils/google-click"
import { z } from "zod"
import { GoogleAdsException, rescueGoogleAds } from "../exception"
import { adsHeaders, googleAdsHttp } from "../lib/http-client"
import {
  conversionActionIdSchema,
  malformedResponse,
  parseId,
} from "../lib/request-guards"
import {
  classifyUploadErrors,
  hasUploadErrors,
  NOT_ALLOWLISTED_REASON,
  type PartialFailureError,
  partialFailureErrorSchema,
} from "../lib/upload-errors"
import type {
  GoogleAdsIngestEvent,
  GoogleAdsLegacyUploadOutcome,
} from "../schemas"

/** Prefix of the stored request id; marks a row that must never be polled. */
export const LEGACY_REQUEST_ID_PREFIX = "legacy:"

const ORDER_ID_VERSION = "v1-"
const ORDER_ID_HASH_LENGTH = 40
const REJECTED_STATUS = 400
const FORBIDDEN_STATUS = 403
const UNAUTHORIZED_STATUS = 401

/**
 * Provider-side dedup key: deterministic, versioned, non-PII and <= 64 chars.
 * The local transaction id (which may embed workspace/contact context) is never
 * sent; replays of one event always produce the same value.
 */
export const legacyOrderId = async (transactionId: string): Promise<string> =>
  `${ORDER_ID_VERSION}${(await sha256Hex(transactionId)).slice(0, ORDER_ID_HASH_LENGTH)}`

/** `yyyy-mm-dd HH:mm:ss+00:00`, always UTC, no milliseconds. */
const formatLegacyDateTime = (date: Date): string =>
  `${date.toISOString().slice(0, 19).replace("T", " ")}+00:00`

type LegacyUploadInput = {
  accessToken: string
  /** Optional: Google ignores it since the 2026-09 sunset. */
  developerToken?: string
  loginAccountId: string
  operatingAccountId: string
  conversionActionId: string
  event: GoogleAdsIngestEvent
  validateOnly?: boolean
}

const malformedUploadResponse = (): GoogleAdsException =>
  malformedResponse("Google Ads upload response could not be read")

/** Legacy `Consent` enum values; only ad user data exists on this API. */
const LEGACY_CONSENT = {
  granted: "GRANTED",
  denied: "DENIED",
} as const

const buildConversion = async (
  input: LegacyUploadInput,
  customerId: string,
  conversionActionId: string,
) => ({
  [input.event.clickIdType]: input.event.clickId,
  conversionAction: `customers/${customerId}/conversionActions/${conversionActionId}`,
  conversionDateTime: formatLegacyDateTime(input.event.eventTimestamp),
  ...(input.event.value === undefined
    ? {}
    : { conversionValue: input.event.value }),
  ...(input.event.currency === undefined
    ? {}
    : { currencyCode: input.event.currency }),
  orderId: await legacyOrderId(input.event.transactionId),
  ...(input.event.consent?.adUserData
    ? {
        consent: {
          adUserData: LEGACY_CONSENT[input.event.consent.adUserData],
        },
      }
    : {}),
})

// int64 is a decimal string in proto3 JSON.
const jobIdSchema = z.string().regex(/^[1-9]\d{0,18}$|^0$/)

const uploadResponseSchema = z.object({
  jobId: z.unknown().optional(),
  results: z.array(z.unknown()).nullish(),
  partialFailureError: partialFailureErrorSchema.nullish(),
})

/**
 * `ClickConversionResult` (Google Ads API): a successful entry of `results`
 * echoes `gclid` | `gbraid`, `conversionAction` (resource name) and
 * `conversionDateTime`; a failed entry (partial failure) is an empty object.
 */
const clickConversionResultSchema = z.object({
  gclid: z.string().optional(),
  gbraid: z.string().optional(),
  conversionAction: z.string().optional(),
  conversionDateTime: z.string().optional(),
})

type ExpectedResult = {
  clickIdType: "gclid" | "gbraid"
  clickId: string
  conversionAction: string
}

/**
 * A recorded result must echo the request: the click id of the requested type
 * OR the requested conversion action's resource name. Either is enough (the
 * docs list all fields on every successful entry, but a result is only
 * rejected when it proves neither); an empty, foreign or unrelated object is
 * not a success.
 */
const isRecordedResult = (
  result: unknown,
  expected: ExpectedResult,
): boolean => {
  const parsed = clickConversionResultSchema.safeParse(result)
  if (!parsed.success) {
    return false
  }
  return (
    parsed.data[expected.clickIdType] === expected.clickId ||
    parsed.data.conversionAction === expected.conversionAction
  )
}

const rejection = (
  reasons: string[],
  reasonCategory?: string,
  httpStatusCode = REJECTED_STATUS,
): GoogleAdsException =>
  new GoogleAdsException({
    httpStatusCode,
    reason: reasons[0] ?? "rejected",
    reasonCategory,
    retryable: false,
    // Reasons are bounded enum names, never Google's free text (which may echo ids).
    message: `Google rejected the conversion: ${reasons.join(", ") || "unknown reason"}`,
    details: [],
  })

const notAllowed = (): GoogleAdsException =>
  new GoogleAdsException({
    httpStatusCode: FORBIDDEN_STATUS,
    reason: NOT_ALLOWLISTED_REASON,
    retryable: false,
    message: "Google does not allow the legacy upload API for this customer",
    details: [],
  })

const fromFailure = (
  error: PartialFailureError,
  httpStatusCode?: number,
): GoogleAdsLegacyUploadOutcome => {
  const classified = classifyUploadErrors(error)
  switch (classified.kind) {
    case "notAllowed":
      throw notAllowed()
    case "permanent":
      throw rejection(
        classified.reasons,
        classified.firstCategory,
        httpStatusCode,
      )
    case "malformed":
      throw malformedUploadResponse()
    case "duplicate":
      return { kind: "duplicate" }
    case "retry":
      return { kind: "retry", reason: classified.reason }
    default: {
      const exhaustive: never = classified
      throw new Error(`Unhandled upload error class: ${String(exhaustive)}`)
    }
  }
}

const interpret = (
  response: unknown,
  validateOnly: boolean,
  expected: ExpectedResult,
): GoogleAdsLegacyUploadOutcome => {
  const parsed = uploadResponseSchema.safeParse(response)
  if (!parsed.success) {
    throw malformedUploadResponse()
  }
  const { partialFailureError, results, jobId } = parsed.data
  if (partialFailureError) {
    return fromFailure(partialFailureError)
  }
  if (validateOnly) {
    return { kind: "validated", fieldWarnings: [] }
  }
  const validJobId = jobIdSchema.safeParse(jobId)
  if (
    !validJobId.success ||
    results?.length !== 1 ||
    !isRecordedResult(results[0], expected)
  ) {
    throw malformedUploadResponse()
  }
  return {
    kind: "completed",
    requestId: `${LEGACY_REQUEST_ID_PREFIX}${validJobId.data}`,
    fieldWarnings: [],
  }
}

const topLevelEnvelopeSchema = z.object({ error: partialFailureErrorSchema })
const httpErrorSchema = z.object({
  response: z.object({ status: z.number() }),
  data: z.unknown(),
})

type PostResult =
  | { kind: "body"; body: unknown }
  | { kind: "failure"; failure: PartialFailureError; httpStatusCode: number }

/**
 * The complete top-level `GoogleAdsFailure` of an HTTP error, when it names
 * Ads error codes. A 401 stays an auth failure and a body without codes keeps
 * the status-based handling of `rescueGoogleAds`.
 */
const topLevelFailure = (error: unknown): PostResult | undefined => {
  const http = httpErrorSchema.safeParse(error)
  if (!http.success || http.data.response.status === UNAUTHORIZED_STATUS) {
    return
  }
  const envelope = topLevelEnvelopeSchema.safeParse(http.data.data)
  if (!(envelope.success && hasUploadErrors(envelope.data.error))) {
    return
  }
  return {
    kind: "failure",
    failure: envelope.data.error,
    httpStatusCode: http.data.response.status,
  }
}

const post = async (
  input: LegacyUploadInput,
  request: {
    operatingId: string
    loginId: string
    conversion: Awaited<ReturnType<typeof buildConversion>>
    validateOnly: boolean
  },
): Promise<PostResult> => {
  try {
    const body = await googleAdsHttp.post<unknown>(
      `customers/${request.operatingId}:uploadClickConversions`,
      {
        headers: adsHeaders({
          accessToken: input.accessToken,
          developerToken: input.developerToken,
          loginCustomerId:
            request.loginId === request.operatingId
              ? undefined
              : request.loginId,
        }),
        json: {
          conversions: [request.conversion],
          partialFailure: true,
          ...(request.validateOnly ? { validateOnly: true } : {}),
        },
      },
    )
    return { kind: "body", body }
  } catch (error) {
    const failure = topLevelFailure(error)
    if (failure) {
      return failure
    }
    throw error
  }
}

/**
 * Sends ONE click conversion through the legacy `uploadClickConversions` (REST,
 * `adwords` scope). Unlike Data Manager the outcome is synchronous: `completed`
 * means Google recorded it, so nothing is ever polled. Permanent rejections
 * and an unreadable 2xx throw a non-retryable `GoogleAdsException`; a transient
 * or duplicate partial failure is returned as a typed outcome for the caller.
 */
export const legacyUploadClickConversion = async (
  input: LegacyUploadInput,
): Promise<GoogleAdsLegacyUploadOutcome> => {
  const operatingId = parseId(
    customerIdSchema,
    input.operatingAccountId,
    "operating customer id",
  )
  const loginId = parseId(
    customerIdSchema,
    input.loginAccountId,
    "login customer id",
  )
  const actionId = parseId(
    conversionActionIdSchema,
    input.conversionActionId,
    "conversion action id",
  )
  const validateOnly = input.validateOnly === true
  const conversion = await buildConversion(input, operatingId, actionId)
  const sent = await rescueGoogleAds(() =>
    post(input, { operatingId, loginId, conversion, validateOnly }),
  ).catch((error: unknown) => {
    throw error instanceof SyntaxError ? malformedUploadResponse() : error
  })
  if (sent.kind === "failure") {
    return fromFailure(sent.failure, sent.httpStatusCode)
  }
  return interpret(sent.body, validateOnly, {
    clickIdType: input.event.clickIdType,
    clickId: input.event.clickId,
    conversionAction: conversion.conversionAction,
  })
}

import {
  customerIdSchema,
  googleAdsCustomerTypes,
  googleAdsCustomerValueBuckets,
} from "@chatbotx.io/utils/google-click"
import { GOOGLE_ADS_ACCOUNT_TYPE, GOOGLE_ADS_EVENT_SOURCE } from "../constants"
import { GoogleAdsException, rescueGoogleAds } from "../exception"
import { bearerHeaders, dataManagerHttp } from "../lib/http-client"
import {
  conversionActionIdSchema,
  MALFORMED_ID_STATUS,
  malformedResponse,
  parseId,
} from "../lib/request-guards"
import {
  type GoogleAdsIngestConsent,
  type GoogleAdsIngestConsentStatus,
  type GoogleAdsIngestEvent,
  type GoogleAdsIngestUserIdentifiers,
  type GoogleAdsIngestUserProperties,
  type GoogleAdsRequestStatus,
  ingestResponseSchema,
  requestStatusResponseSchema,
} from "../schemas"

type IngestInput = {
  accessToken: string
  loginAccountId: string
  operatingAccountId: string
  conversionActionId: string
  event: GoogleAdsIngestEvent
  /** Validates the request without recording the conversion. */
  validateOnly?: boolean
}

const account = (accountId: string, label: string) => ({
  accountType: GOOGLE_ADS_ACCOUNT_TYPE,
  accountId: parseId(customerIdSchema, accountId, label),
})

const malformedDataManagerResponse = (what: string): GoogleAdsException =>
  malformedResponse(`Data Manager ${what} response could not be read`)

/** Data Manager `Consent` enum values (JSON names). */
const DATA_MANAGER_CONSENT: Record<GoogleAdsIngestConsentStatus, string> = {
  granted: "CONSENT_GRANTED",
  denied: "CONSENT_DENIED",
}

/** Only the answered settings; `undefined` when there is nothing to send. */
const buildConsent = (consent: GoogleAdsIngestConsent | undefined) => {
  const adUserData = consent?.adUserData
  const adPersonalization = consent?.adPersonalization
  if (!(adUserData || adPersonalization)) {
    return
  }
  return {
    ...(adUserData ? { adUserData: DATA_MANAGER_CONSENT[adUserData] } : {}),
    ...(adPersonalization
      ? { adPersonalization: DATA_MANAGER_CONSENT[adPersonalization] }
      : {}),
  }
}

const HEX_SHA256 = /^[0-9a-f]{64}$/i

/** A digest that is not exactly 64 hex characters can never be accepted: fail terminally, without echoing it. */
const parseDigest = (value: string, label: string): string => {
  if (!HEX_SHA256.test(value)) {
    throw new GoogleAdsException({
      httpStatusCode: MALFORMED_ID_STATUS,
      reason: "invalidIdentifier",
      retryable: false,
      message: `Google Ads ${label} is not a SHA-256 hex digest`,
      details: [],
    })
  }
  return value
}

/** One identifier per entry, as `userData.userIdentifiers` requires; `undefined` when there is none. */
const buildUserData = (
  identifiers: GoogleAdsIngestUserIdentifiers | undefined,
) => {
  const userIdentifiers = [
    ...(identifiers?.emailAddress
      ? [{ emailAddress: parseDigest(identifiers.emailAddress, "e-mail hash") }]
      : []),
    ...(identifiers?.phoneNumber
      ? [{ phoneNumber: parseDigest(identifiers.phoneNumber, "phone hash") }]
      : []),
  ]
  return userIdentifiers.length > 0 ? { userIdentifiers } : undefined
}

/** Only the allowed enum values reach Google; anything else can never succeed, so it fails terminally. */
const buildUserProperties = (
  properties: GoogleAdsIngestUserProperties | undefined,
) => {
  const customerType = properties?.customerType
  const customerValueBucket = properties?.customerValueBucket
  if (!(customerType || customerValueBucket)) {
    return
  }
  const type = customerType
    ? googleAdsCustomerTypes.safeParse(customerType)
    : undefined
  const bucket = customerValueBucket
    ? googleAdsCustomerValueBuckets.safeParse(customerValueBucket)
    : undefined
  if ((type && !type.success) || (bucket && !bucket.success)) {
    throw new GoogleAdsException({
      httpStatusCode: MALFORMED_ID_STATUS,
      reason: "invalidUserProperty",
      retryable: false,
      message: "Google Ads user property is not an allowed value",
      details: [],
    })
  }
  return {
    ...(type?.success ? { customerType: type.data } : {}),
    ...(bucket?.success ? { customerValueBucket: bucket.data } : {}),
  }
}

const buildEvent = (
  event: GoogleAdsIngestEvent,
  userData: ReturnType<typeof buildUserData>,
) => {
  const userProperties = buildUserProperties(event.userProperties)
  const consent = buildConsent(event.consent)
  return {
    transactionId: event.transactionId,
    eventTimestamp: event.eventTimestamp.toISOString(),
    adIdentifiers: { [event.clickIdType]: event.clickId },
    eventSource: GOOGLE_ADS_EVENT_SOURCE,
    ...(event.value === undefined ? {} : { conversionValue: event.value }),
    ...(event.currency === undefined ? {} : { currency: event.currency }),
    ...(consent ? { consent } : {}),
    ...(userData ? { userData } : {}),
    ...(userProperties ? { userProperties } : {}),
  }
}

/**
 * Sends ONE conversion. Request-level validation is atomic and processing is
 * asynchronous: success here only means Google accepted the request — the
 * outcome is read later with `retrieveRequestStatus`.
 */
export const dataManagerIngestEvent = async (
  input: IngestInput,
): Promise<{ requestId: string | null; fieldWarnings: unknown[] }> => {
  const userData = buildUserData(input.event.userIdentifiers)
  const response = await rescueGoogleAds(() =>
    dataManagerHttp.post<unknown>("events:ingest", {
      headers: bearerHeaders(input.accessToken),
      json: {
        destinations: [
          {
            loginAccount: account(input.loginAccountId, "login customer id"),
            operatingAccount: account(
              input.operatingAccountId,
              "operating customer id",
            ),
            productDestinationId: parseId(
              conversionActionIdSchema,
              input.conversionActionId,
              "conversion action id",
            ),
          },
        ],
        events: [buildEvent(input.event, userData)],
        // Required by Google whenever userData is sent; our digests are hex.
        ...(userData ? { encoding: "HEX" } : {}),
        ...(input.validateOnly ? { validateOnly: true } : {}),
      },
    }),
  ).catch((error: unknown) => {
    // A 2xx whose body is not JSON: the request may already be recorded.
    throw error instanceof SyntaxError
      ? malformedDataManagerResponse("ingest")
      : error
  })

  const parsed = ingestResponseSchema.safeParse(response)
  if (!parsed.success) {
    throw malformedDataManagerResponse("ingest")
  }
  return {
    requestId: parsed.data.requestId ?? null,
    fieldWarnings: parsed.data.fieldWarnings ?? [],
  }
}

const toCount = (value: string | number | undefined): number | null => {
  const count = Number(value)
  return value !== undefined && Number.isFinite(count) ? count : null
}

const toReasonCounts = (
  counts: { reason: string; recordCount?: string | number }[] | undefined,
) =>
  (counts ?? []).map(({ reason, recordCount }) => ({
    reason,
    recordCount: toCount(recordCount) ?? 0,
  }))

export const retrieveRequestStatus = async (input: {
  accessToken: string
  requestId: string
}): Promise<GoogleAdsRequestStatus[]> => {
  const response = await rescueGoogleAds(() =>
    dataManagerHttp.get<unknown>("requestStatus:retrieve", {
      headers: bearerHeaders(input.accessToken),
      searchParams: { requestId: input.requestId },
    }),
  ).catch((error: unknown) => {
    throw error instanceof SyntaxError
      ? malformedDataManagerResponse("status")
      : error
  })
  const parsed = requestStatusResponseSchema.safeParse(response)
  if (!parsed.success) {
    throw malformedDataManagerResponse("status")
  }
  return parsed.data.requestStatusPerDestination.map((entry) => ({
    requestStatus: entry.requestStatus,
    recordCount: toCount(
      (entry.eventsIngestionStatus ?? entry.ingestEventsStatus)?.recordCount,
    ),
    errorCounts: toReasonCounts(entry.errorInfo?.errorCounts),
    warningCounts: toReasonCounts(entry.warningInfo?.warningCounts),
  }))
}

import { AuthException } from "@chatbotx.io/sdk"
import { describe, expect, test, vi } from "vitest"
import { GoogleAdsException } from "../src/exception"
import {
  baseAuth,
  DIRECT,
  LEGACY_UPLOAD,
  MANAGER,
  requests,
  route,
  useWireServer,
} from "./helpers/wire-server"

vi.mock("../src/constants", async (importOriginal) =>
  (await import("./helpers/wire-server")).mockConstants(
    await importOriginal<typeof import("../src/constants")>(),
  ),
)

vi.mock("../src/client", async (importOriginal) =>
  (await import("./helpers/wire-server")).mockClient(
    await importOriginal<typeof import("../src/client")>(),
  ),
)

useWireServer()

const ORDER_ID_PATTERN = /^v1-[0-9a-f]{40}$/
const CLICK_ID = "Cj0KCQ-secret-click-id"
const TRANSACTION_ID = "gads-v2-111-i-3f2a9c41d8e75b60a1c4e9f07d2b8a35"

const event = {
  transactionId: TRANSACTION_ID,
  eventTimestamp: new Date("2026-10-07T01:02:03.456Z"),
  clickIdType: "gclid" as const,
  clickId: CLICK_ID,
  value: 12.5,
  currency: "USD",
}
const base = {
  accessToken: "ya29.access",
  loginAccountId: DIRECT,
  operatingAccountId: DIRECT,
  conversionActionId: "987654",
  event,
}

const failure = (...codes: Record<string, string>[]) => ({
  results: [{}],
  partialFailureError: {
    code: 3,
    message: `Multiple errors in 'details'. First error: click ${CLICK_ID} is bad`,
    details: [
      {
        "@type":
          "type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure",
        errors: codes.map((errorCode) => ({
          errorCode,
          message: `bad ${CLICK_ID} ${TRANSACTION_ID}`,
        })),
      },
    ],
  },
})

const upload = async (overrides: Record<string, unknown> = {}) => {
  const { legacyUploadClickConversion } = await import(
    "../src/apis/legacy-upload"
  )
  return await legacyUploadClickConversion({ ...base, ...overrides })
}

const caught = async (fn: () => Promise<unknown>): Promise<unknown> =>
  await fn().then(
    () => undefined,
    (error: unknown) => error,
  )

describe("legacyUploadClickConversion request", () => {
  test("posts the exact v25 route, body and headers for a gclid", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: { jobId: "1234567890123", results: [{ gclid: CLICK_ID }] },
    })

    const result = await upload()

    expect(result).toEqual({
      kind: "completed",
      requestId: "legacy:1234567890123",
      fieldWarnings: [],
    })
    const sent = requests[0]
    expect(sent?.path).toBe(`/v25/customers/${DIRECT}:uploadClickConversions`)
    expect(sent?.headers.authorization).toBe("Bearer ya29.access")
    expect(sent?.headers["developer-token"]).toBeUndefined()
    expect(sent?.headers["login-customer-id"]).toBeUndefined()
    expect(sent?.json).toEqual({
      conversions: [
        {
          gclid: CLICK_ID,
          conversionAction: `customers/${DIRECT}/conversionActions/987654`,
          conversionDateTime: "2026-10-07 01:02:03+00:00",
          conversionValue: 12.5,
          currencyCode: "USD",
          orderId: expect.stringMatching(ORDER_ID_PATTERN),
        },
      ],
      partialFailure: true,
    })
  })

  test("a gbraid event, no value, a manager login and an optional token", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: { jobId: "7", results: [{ gbraid: "gb-1234567890" }] },
    })

    await upload({
      loginAccountId: MANAGER,
      developerToken: "dev-token-abc",
      event: {
        transactionId: "t",
        eventTimestamp: new Date("2026-10-07T08:02:03+07:00"),
        clickIdType: "gbraid",
        clickId: "gb-1234567890",
      },
    })

    expect(requests[0]?.headers["developer-token"]).toBe("dev-token-abc")
    expect(requests[0]?.headers["login-customer-id"]).toBe(MANAGER)
    const body = requests[0]?.json as { conversions: Record<string, unknown>[] }
    expect(body.conversions[0]).toEqual({
      gbraid: "gb-1234567890",
      conversionAction: `customers/${DIRECT}/conversionActions/987654`,
      conversionDateTime: "2026-10-07 01:02:03+00:00",
      orderId: expect.stringMatching(ORDER_ID_PATTERN),
    })
  })

  test("the order id is deterministic, versioned, short and not the transaction id", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: { jobId: "7", results: [{ gclid: CLICK_ID }] },
    })

    await upload()
    await upload()
    await upload({ event: { ...event, transactionId: "another" } })

    const ids = requests.map(
      (request) =>
        (request.json as { conversions: { orderId: string }[] }).conversions[0]
          ?.orderId ?? "",
    )
    expect(ids[0]).toBe(ids[1])
    expect(ids[2]).not.toBe(ids[0])
    expect(ids[0]?.length).toBeLessThanOrEqual(64)
    expect(requests[0]?.raw).not.toContain(TRANSACTION_ID)
  })

  test.each([
    ["granted", "GRANTED"],
    ["denied", "DENIED"],
  ] as const)("sends consent.adUserData %s as %s", async (status, wire) => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: { jobId: "7", results: [{ gclid: CLICK_ID }] },
    })

    await upload({ event: { ...event, consent: { adUserData: status } } })

    const body = requests[0]?.json as { conversions: Record<string, unknown>[] }
    expect(body.conversions[0]?.consent).toEqual({ adUserData: wire })
  })

  test("never sends adPersonalization and omits consent when ad user data is null", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: { jobId: "7", results: [{ gclid: CLICK_ID }] },
    })

    await upload({
      event: {
        ...event,
        consent: { adUserData: "granted", adPersonalization: "denied" },
      },
    })
    await upload({
      event: { ...event, consent: { adPersonalization: "granted" } },
    })
    await upload()

    expect(requests[0]?.raw).not.toContain("adPersonalization")
    expect(requests[1]?.raw).not.toContain("consent")
    expect(requests[2]?.raw).not.toContain("consent")
  })

  test("a manual retry and a redrive of the same event send byte-identical bodies", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: { jobId: "7", results: [{ gclid: CLICK_ID }] },
    })
    const replay = { event: { ...event, consent: { adUserData: "denied" } } }

    await upload(replay)
    await upload(replay)
    await upload(replay)

    expect(requests[1]?.raw).toBe(requests[0]?.raw)
    expect(requests[2]?.raw).toBe(requests[0]?.raw)
  })

  test("validateOnly is sent and an empty response is a validation success", async () => {
    route(LEGACY_UPLOAD(DIRECT), { json: {} })

    const result = await upload({ validateOnly: true })

    expect(result).toEqual({ kind: "validated", fieldWarnings: [] })
    expect(requests[0]?.json).toMatchObject({
      validateOnly: true,
      partialFailure: true,
    })
  })

  test("a malformed identifier never leaves the process", async () => {
    const error = await caught(() => upload({ conversionActionId: "12x" }))

    expect(error).toMatchObject({ reason: "invalidIdentifier" })
    expect(requests).toHaveLength(0)
  })
})

describe("legacyUploadClickConversion response (C5)", () => {
  test.each([
    ["no jobId", { results: [{ gclid: CLICK_ID }] }],
    ["a numeric jobId", { jobId: 123, results: [{ gclid: CLICK_ID }] }],
    ["a non-decimal jobId", { jobId: "12a", results: [{ gclid: CLICK_ID }] }],
    ["no results", { jobId: "12" }],
    ["an empty results array", { jobId: "12", results: [] }],
    [
      "two results",
      { jobId: "12", results: [{ gclid: CLICK_ID }, { gclid: CLICK_ID }] },
    ],
    ["an empty (failed) result", { jobId: "12", results: [{}] }],
    [
      "a result with unrelated fields only",
      { jobId: "12", results: [{ x: 1 }] },
    ],
    [
      "a result echoing another click id",
      { jobId: "12", results: [{ gclid: "other" }] },
    ],
    [
      "a result echoing a gbraid for a gclid request",
      { jobId: "12", results: [{ gbraid: CLICK_ID }] },
    ],
    ["a result of the wrong type", { jobId: "12", results: ["ok"] }],
    [
      "a conversion action of another account",
      {
        jobId: "12",
        results: [{ conversionAction: "customers/1/conversionActions/987654" }],
      },
    ],
  ])("%s is terminal-malformed, never String(undefined)", async (_name, json) => {
    route(LEGACY_UPLOAD(DIRECT), { json })

    const error = await caught(() => upload())

    expect(error).toBeInstanceOf(GoogleAdsException)
    expect(error).toMatchObject({
      retryable: false,
      reason: "malformedResponse",
    })
  })

  test("a result echoing only the requested conversion action is a success", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: {
        jobId: "12",
        results: [
          {
            conversionAction: `customers/${DIRECT}/conversionActions/987654`,
            conversionDateTime: "2026-10-07 01:02:03+00:00",
          },
        ],
      },
    })

    expect(await upload()).toMatchObject({
      kind: "completed",
      requestId: "legacy:12",
    })
  })

  test("the malformed message is fixed and never echoes ids", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: { jobId: "12", results: [{ gclid: "echo-other-click" }] },
    })

    const error = await caught(() => upload())

    expect((error as Error).message).toBe(
      "Google Ads upload response could not be read",
    )
    expect((error as Error).message).not.toContain(CLICK_ID)
  })

  test("a non-JSON 2xx and an empty 2xx are terminal-malformed", async () => {
    for (const raw of ["<html/>", ""]) {
      route(LEGACY_UPLOAD(DIRECT), { raw, contentType: "text/html" })
      expect(await caught(() => upload())).toMatchObject({
        retryable: false,
        reason: "malformedResponse",
      })
    }
  })

  test("a dropped connection surfaces as a non-Google error for BullMQ retry", async () => {
    route(LEGACY_UPLOAD(DIRECT), { destroy: true })

    const error = await caught(() => upload())

    expect(error).toBeDefined()
    expect(error).not.toBeInstanceOf(GoogleAdsException)
  })
})

describe("partial-failure classifier (C4)", () => {
  test.each([
    [
      "TOO_RECENT_EVENT",
      { conversionUploadError: "TOO_RECENT_EVENT" },
      "tooRecent",
    ],
    [
      "TOO_RECENT_CONVERSION_ACTION",
      { conversionUploadError: "TOO_RECENT_CONVERSION_ACTION" },
      "tooRecent",
    ],
    ["RESOURCE_EXHAUSTED", { quotaError: "RESOURCE_EXHAUSTED" }, "transient"],
    ["INTERNAL_ERROR", { internalError: "INTERNAL_ERROR" }, "transient"],
  ])("%s is requeued", async (_name, errorCode, reason) => {
    route(LEGACY_UPLOAD(DIRECT), { json: failure(errorCode) })

    expect(await upload()).toEqual({ kind: "retry", reason })
  })

  test("a bare gRPC UNAVAILABLE / INTERNAL status is transient, without inventing an HTTP status", async () => {
    for (const code of [14, 13, 8]) {
      route(LEGACY_UPLOAD(DIRECT), {
        json: { results: [{}], partialFailureError: { code, message: "x" } },
      })
      expect(await upload()).toEqual({ kind: "retry", reason: "transient" })
    }
  })

  test("duplicate-class errors are reported as a duplicate", async () => {
    for (const name of [
      "CLICK_CONVERSION_ALREADY_EXISTS",
      "ORDER_ID_ALREADY_IN_USE",
    ]) {
      route(LEGACY_UPLOAD(DIRECT), {
        json: failure({ conversionUploadError: name }),
      })
      expect(await upload()).toEqual({ kind: "duplicate" })
    }
  })

  test("a permanent error is terminal and its message carries enum names only", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: failure({ conversionUploadError: "CLICK_NOT_FOUND" }),
    })

    const error = await caught(() => upload())

    expect(error).toBeInstanceOf(GoogleAdsException)
    expect(error).toMatchObject({
      retryable: false,
      reason: "CLICK_NOT_FOUND",
    })
    const text = JSON.stringify({
      message: (error as Error).message,
      details: (error as GoogleAdsException).details,
    })
    expect(text).toContain("CLICK_NOT_FOUND")
    expect(text).not.toContain(CLICK_ID)
    expect(text).not.toContain(TRANSACTION_ID)
  })

  test("EXPIRED_EVENT and CONVERSION_PRECEDES_EVENT are terminal, not retryable", async () => {
    for (const name of ["EXPIRED_EVENT", "CONVERSION_PRECEDES_EVENT"]) {
      route(LEGACY_UPLOAD(DIRECT), {
        json: failure({ conversionUploadError: name }),
      })
      expect(await caught(() => upload())).toMatchObject({
        reason: name,
        retryable: false,
      })
    }
  })

  test("a permanent error beats a transient companion; duplicates never mask a permanent one", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: failure(
        { quotaError: "RESOURCE_EXHAUSTED" },
        { conversionUploadError: "EXPIRED_EVENT" },
      ),
    })
    expect(await caught(() => upload())).toMatchObject({
      reason: "EXPIRED_EVENT",
    })

    route(LEGACY_UPLOAD(DIRECT), {
      json: failure(
        { conversionUploadError: "CLICK_CONVERSION_ALREADY_EXISTS" },
        { conversionUploadError: "UNPARSEABLE_GCLID" },
      ),
    })
    expect(await caught(() => upload())).toMatchObject({
      reason: "UNPARSEABLE_GCLID",
    })
  })

  test("a partial failure without readable codes is terminal-malformed", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: { results: [{}], partialFailureError: { code: 3, message: "?" } },
    })

    expect(await caught(() => upload())).toMatchObject({
      reason: "malformedResponse",
      retryable: false,
    })
  })

  test("an unrecognised reason string is bounded to UNKNOWN", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: failure({ conversionUploadError: `weird ${CLICK_ID}` }),
    })

    const error = await caught(() => upload())

    expect(error).toMatchObject({ reason: "UNKNOWN" })
    expect((error as Error).message).not.toContain(CLICK_ID)
  })

  test("CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE inside partialFailureError", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: failure({
        authorizationError: "CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE",
      }),
    })

    const { classifyGoogleAdsFailure } = await import(
      "../src/lib/failure-cause"
    )
    const error = await caught(() => upload())

    expect(classifyGoogleAdsFailure(error)).toBe("legacy_upload_not_allowed")
    expect((error as Error).message).not.toContain(CLICK_ID)
  })
})

describe("top-level errors", () => {
  test("CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE as an HTTP error maps to the stable cause", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      status: 403,
      json: {
        error: {
          code: 403,
          status: "PERMISSION_DENIED",
          message: `no access for ${CLICK_ID}`,
          details: [
            {
              errors: [
                {
                  errorCode: {
                    authorizationError:
                      "CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE",
                  },
                  message: "not allowed",
                },
              ],
            },
          ],
        },
      },
    })

    const { classifyGoogleAdsFailure } = await import(
      "../src/lib/failure-cause"
    )
    const error = await caught(() => upload())

    expect(classifyGoogleAdsFailure(error)).toBe("legacy_upload_not_allowed")
  })

  test("the same cause arrives with a non-403 status (never assume 403)", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      status: 400,
      json: {
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          details: [
            {
              errors: [
                {
                  errorCode: {
                    authorizationError:
                      "CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    const { classifyGoogleAdsFailure } = await import(
      "../src/lib/failure-cause"
    )
    expect(classifyGoogleAdsFailure(await caught(() => upload()))).toBe(
      "legacy_upload_not_allowed",
    )
  })

  const httpFailure = (status: number, ...codes: Record<string, string>[]) => ({
    status,
    json: {
      error: {
        code: status,
        status: "INVALID_ARGUMENT",
        message: `bad ${CLICK_ID}`,
        details: [
          {
            "@type":
              "type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure",
            errors: codes.map((errorCode) => ({
              errorCode,
              message: CLICK_ID,
            })),
          },
        ],
      },
    },
  })

  test("HTTP 400 TOO_RECENT_EVENT is requeued, not terminal", async () => {
    route(
      LEGACY_UPLOAD(DIRECT),
      httpFailure(400, { conversionUploadError: "TOO_RECENT_EVENT" }),
    )

    expect(await upload()).toEqual({ kind: "retry", reason: "tooRecent" })
  })

  test("a top-level duplicate recovers like a partial-failure duplicate", async () => {
    for (const name of [
      "CLICK_CONVERSION_ALREADY_EXISTS",
      "ORDER_ID_ALREADY_IN_USE",
    ]) {
      route(
        LEGACY_UPLOAD(DIRECT),
        httpFailure(400, { conversionUploadError: name }),
      )
      expect(await upload()).toEqual({ kind: "duplicate" })
    }
  })

  test("a later not-allowlisted error is not hidden behind an earlier one", async () => {
    route(
      LEGACY_UPLOAD(DIRECT),
      httpFailure(
        400,
        { conversionUploadError: "TOO_RECENT_EVENT" },
        { authorizationError: "CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE" },
      ),
    )
    const { classifyGoogleAdsFailure } = await import(
      "../src/lib/failure-cause"
    )

    expect(classifyGoogleAdsFailure(await caught(() => upload()))).toBe(
      "legacy_upload_not_allowed",
    )
  })

  test("a later permanent error beats an earlier duplicate / recent one", async () => {
    route(
      LEGACY_UPLOAD(DIRECT),
      httpFailure(
        400,
        { conversionUploadError: "CLICK_CONVERSION_ALREADY_EXISTS" },
        { conversionUploadError: "TOO_RECENT_EVENT" },
        { conversionUploadError: "EXPIRED_EVENT" },
      ),
    )

    const error = await caught(() => upload())

    expect(error).toMatchObject({ reason: "EXPIRED_EVENT", retryable: false })
    expect((error as Error).message).not.toContain(CLICK_ID)
  })

  test("a top-level transient family error is requeued", async () => {
    route(
      LEGACY_UPLOAD(DIRECT),
      httpFailure(429, { quotaError: "RESOURCE_EXHAUSTED" }),
    )

    expect(await upload()).toEqual({ kind: "retry", reason: "transient" })
  })

  test("a 401 carrying Ads errors stays an AuthException", async () => {
    route(
      LEGACY_UPLOAD(DIRECT),
      httpFailure(401, { authenticationError: "OAUTH_TOKEN_INVALID" }),
    )

    expect(await caught(() => upload())).toBeInstanceOf(AuthException)
  })

  test("a 5xx without Ads errors keeps the retryable exception", async () => {
    route(LEGACY_UPLOAD(DIRECT), httpFailure(500))

    expect(await caught(() => upload())).toMatchObject({ retryable: true })
  })

  test("a 503 is a retryable GoogleAdsException and a 401 an AuthException", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      status: 503,
      json: { error: { code: 503 } },
    })
    expect(await caught(() => upload())).toMatchObject({ retryable: true })

    route(LEGACY_UPLOAD(DIRECT), {
      status: 401,
      json: { error: { code: 401, status: "UNAUTHENTICATED" } },
    })
    expect(await caught(() => upload())).toBeInstanceOf(AuthException)
  })

  test("an HTTP error never leaks the click id, order id or tokens", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      status: 400,
      json: {
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          message: `bad gclid=${CLICK_ID} Bearer ya29.access`,
        },
      },
    })

    const error = await caught(() =>
      upload({ developerToken: "dev-token-abc" }),
    )
    const { sanitizeGoogleAdsError } = await import("../src/lib/sanitize")
    const text = JSON.stringify(
      sanitizeGoogleAdsError(error, { secrets: [CLICK_ID] }),
    )

    for (const secret of [CLICK_ID, "ya29.access", "dev-token-abc"]) {
      expect(text).not.toContain(secret)
    }
  })
})

describe("ingestEvent routes by the event's method", () => {
  const ctx = { auth: { ...baseAuth(), metadata: { customerId: DIRECT } } }
  const props = {
    loginAccountId: DIRECT,
    operatingAccountId: DIRECT,
    conversionActionId: "987654",
    event,
  }

  test("legacy goes to uploadClickConversions, absent goes to Data Manager", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: { jobId: "5", results: [{ gclid: CLICK_ID }] },
    })
    route("POST /v1/events:ingest", { json: { requestId: "dm-1" } })
    const { integration } = await import("../src/integration")

    const legacy = await integration.actions.ingestEvent({
      ctx: ctx as never,
      props: { ...props, uploadMethod: "legacy" },
    })
    const dataManager = await integration.actions.ingestEvent({
      ctx: ctx as never,
      props,
    })

    expect(legacy).toMatchObject({ kind: "completed", requestId: "legacy:5" })
    expect(dataManager).toMatchObject({ kind: "accepted", requestId: "dm-1" })
    expect(requests.map((request) => request.path)).toEqual([
      `/v25/customers/${DIRECT}:uploadClickConversions`,
      "/v1/events:ingest",
    ])
  })
})

describe("legacyUploadClickConversion ignores customer matching", () => {
  test("identifiers on the event never reach the legacy body", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: { jobId: "1234567890123", results: [{ gclid: CLICK_ID }] },
    })

    await upload({
      event: {
        ...event,
        userIdentifiers: {
          emailAddress: "a1".repeat(32),
          phoneNumber: "b2".repeat(32),
        },
      },
    })

    const raw = requests.at(-1)?.raw ?? ""
    expect(raw).not.toContain("userIdentifiers")
    expect(raw).not.toContain("a1".repeat(32))
    expect(raw).not.toContain("encoding")
  })

  test("user properties on the event never reach the legacy body", async () => {
    route(LEGACY_UPLOAD(DIRECT), {
      json: { jobId: "1234567890123", results: [{ gclid: CLICK_ID }] },
    })

    await upload({
      event: {
        ...event,
        userProperties: { customerType: "NEW", customerValueBucket: "HIGH" },
      },
    })

    const raw = requests.at(-1)?.raw ?? ""
    expect(raw).not.toContain("userProperties")
    expect(raw).not.toContain("customerType")
  })
})

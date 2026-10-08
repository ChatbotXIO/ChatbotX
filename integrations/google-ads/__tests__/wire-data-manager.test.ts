import { AuthException } from "@chatbotx.io/sdk"
import { describe, expect, test, vi } from "vitest"
import { GoogleAdsException } from "../src/exception"

import {
  credentials,
  DIRECT,
  googleAdsFailure,
  INGEST,
  LIST_ACCESSIBLE,
  MANAGER,
  RFC3339_UTC,
  requests,
  route,
  STATUS,
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

describe("dataManagerIngestEvent", () => {
  const event = {
    transactionId: "tx-1",
    eventTimestamp: new Date("2026-10-07T01:02:03.000Z"),
    clickIdType: "gclid" as const,
    clickId: "Cj0KCQ-click",
    value: 12.5,
    currency: "USD",
  }
  const base = {
    accessToken: "ya29.access",
    loginAccountId: MANAGER,
    operatingAccountId: DIRECT,
    conversionActionId: "987654",
  }

  test("posts the exact Data Manager body with only the bearer token", async () => {
    route(INGEST, { json: { requestId: "dm-request-1" } })
    const { dataManagerIngestEvent } = await import("../src/apis/data-manager")

    const result = await dataManagerIngestEvent({ ...base, event })

    expect(result).toEqual({ requestId: "dm-request-1", fieldWarnings: [] })
    const sent = requests[0]
    expect(sent?.path).toBe("/v1/events:ingest")
    expect(sent?.headers.authorization).toBe("Bearer ya29.access")
    expect(sent?.headers["developer-token"]).toBeUndefined()
    expect(sent?.json).toEqual({
      destinations: [
        {
          loginAccount: { accountType: "GOOGLE_ADS", accountId: MANAGER },
          operatingAccount: { accountType: "GOOGLE_ADS", accountId: DIRECT },
          productDestinationId: "987654",
        },
      ],
      events: [
        {
          transactionId: "tx-1",
          eventTimestamp: "2026-10-07T01:02:03.000Z",
          adIdentifiers: { gclid: "Cj0KCQ-click" },
          eventSource: "MESSAGE",
          conversionValue: 12.5,
          currency: "USD",
        },
      ],
    })
  })

  test("timestamp is RFC3339 UTC; gbraid, validateOnly and a value-less event are encoded", async () => {
    route(INGEST, { json: {} })
    const { dataManagerIngestEvent } = await import("../src/apis/data-manager")

    const result = await dataManagerIngestEvent({
      ...base,
      validateOnly: true,
      event: {
        transactionId: "tx-2",
        eventTimestamp: new Date("2026-10-07T08:02:03+07:00"),
        clickIdType: "gbraid",
        clickId: "gb-1",
      },
    })

    expect(result).toEqual({ requestId: null, fieldWarnings: [] })
    const body = requests[0]?.json as {
      validateOnly?: boolean
      events: Record<string, unknown>[]
    }
    expect(body.validateOnly).toBe(true)
    expect(body.events[0]).toEqual({
      transactionId: "tx-2",
      eventTimestamp: "2026-10-07T01:02:03.000Z",
      adIdentifiers: { gbraid: "gb-1" },
      eventSource: "MESSAGE",
    })
    expect(body.events[0]?.eventTimestamp).toMatch(RFC3339_UTC)
  })

  test("validateOnly is omitted when not requested", async () => {
    route(INGEST, { json: {} })
    const { dataManagerIngestEvent } = await import("../src/apis/data-manager")

    await dataManagerIngestEvent({ ...base, event })

    expect(requests[0]?.json).not.toHaveProperty("validateOnly")
  })

  test("a 2xx with a non-JSON body is terminal (the request may be recorded)", async () => {
    route(INGEST, { raw: "<html>ok</html>", contentType: "text/html" })
    const { dataManagerIngestEvent } = await import("../src/apis/data-manager")

    const error = await dataManagerIngestEvent({ ...base, event }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(GoogleAdsException)
    expect(error).toMatchObject({
      retryable: false,
      reason: "malformedResponse",
    })
  })

  test("a 2xx with an empty body is terminal too", async () => {
    route(INGEST, { raw: "" })
    const { dataManagerIngestEvent } = await import("../src/apis/data-manager")

    const error = await dataManagerIngestEvent({ ...base, event }).catch(
      (e: unknown) => e,
    )

    expect(error).toMatchObject({
      retryable: false,
      reason: "malformedResponse",
    })
  })
})

describe("retrieveRequestStatus", () => {
  // Shape of RetrieveRequestStatusResponse in
  // https://developers.google.com/data-manager/api/reference/rest/v1/requestStatus/retrieve
  const official = {
    requestStatusPerDestination: [
      {
        destination: {
          loginAccount: { accountType: "GOOGLE_ADS", accountId: MANAGER },
          operatingAccount: { accountType: "GOOGLE_ADS", accountId: DIRECT },
          productDestinationId: "987654",
        },
        requestStatus: "PARTIAL_SUCCESS",
        errorInfo: {
          errorCounts: [
            {
              recordCount: "2",
              reason: "PROCESSING_ERROR_REASON_INVALID_CONVERSION_ACTION",
            },
          ],
        },
        warningInfo: {
          warningCounts: [
            {
              recordCount: "1",
              reason: "PROCESSING_WARNING_REASON_UNSPECIFIED",
            },
          ],
        },
        eventsIngestionStatus: { recordCount: "5" },
      },
    ],
  }

  test("GETs requestStatus:retrieve?requestId= and reads the documented fields", async () => {
    route(STATUS, { json: official })
    const { retrieveRequestStatus } = await import("../src/apis/data-manager")

    const result = await retrieveRequestStatus({
      accessToken: "ya29.access",
      requestId: "dm-request-1",
    })

    expect(requests[0]?.query.get("requestId")).toBe("dm-request-1")
    expect(requests[0]?.headers.authorization).toBe("Bearer ya29.access")
    expect(result).toEqual([
      {
        requestStatus: "PARTIAL_SUCCESS",
        recordCount: 5,
        errorCounts: [
          {
            reason: "PROCESSING_ERROR_REASON_INVALID_CONVERSION_ACTION",
            recordCount: 2,
          },
        ],
        warningCounts: [
          { reason: "PROCESSING_WARNING_REASON_UNSPECIFIED", recordCount: 1 },
        ],
      },
    ])
  })

  test("a still-processing request (only requestStatus) is readable", async () => {
    route(STATUS, {
      json: { requestStatusPerDestination: [{ requestStatus: "PROCESSING" }] },
    })
    const { retrieveRequestStatus } = await import("../src/apis/data-manager")

    expect(
      await retrieveRequestStatus({ accessToken: "t", requestId: "r" }),
    ).toEqual([
      {
        requestStatus: "PROCESSING",
        recordCount: null,
        errorCounts: [],
        warningCounts: [],
      },
    ])
  })

  test("a 2xx with a non-JSON body is a terminal malformedResponse", async () => {
    route(STATUS, { raw: "nope", contentType: "text/plain" })
    const { retrieveRequestStatus } = await import("../src/apis/data-manager")

    const error = await retrieveRequestStatus({
      accessToken: "t",
      requestId: "r",
    }).catch((e: unknown) => e)

    // Non-JSON on a GET must not escape as a bare SyntaxError.
    expect(error).toBeInstanceOf(GoogleAdsException)
    expect(error).toMatchObject({ retryable: false })
  })
})

describe("error classification over the wire", () => {
  test.each([
    [429, "RESOURCE_EXHAUSTED", true],
    [500, "INTERNAL", true],
    [503, "UNAVAILABLE", true],
    [400, "INVALID_ARGUMENT", false],
  ])("Data Manager %i %s -> retryable=%s", async (code, status, retryable) => {
    route(INGEST, {
      status: code,
      json: {
        error: {
          code,
          message: "boom",
          status,
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.BadRequest",
              fieldViolations: [{ field: "events[0]", description: "bad" }],
            },
          ],
        },
      },
    })
    const { dataManagerIngestEvent } = await import("../src/apis/data-manager")

    const error = await dataManagerIngestEvent({
      accessToken: "t",
      loginAccountId: MANAGER,
      operatingAccountId: DIRECT,
      conversionActionId: "1",
      event: {
        transactionId: "t",
        eventTimestamp: new Date(0),
        clickIdType: "gclid",
        clickId: "c",
      },
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GoogleAdsException)
    expect(error).toMatchObject({
      retryable,
      apiStatus: status,
      httpStatusCode: code,
    })
  })

  test("401 from Data Manager is an AuthException so the SDK refreshes once", async () => {
    route(INGEST, {
      status: 401,
      json: { error: { code: 401, status: "UNAUTHENTICATED", message: "x" } },
    })
    const { dataManagerIngestEvent } = await import("../src/apis/data-manager")

    await expect(
      dataManagerIngestEvent({
        accessToken: "t",
        loginAccountId: MANAGER,
        operatingAccountId: DIRECT,
        conversionActionId: "1",
        event: {
          transactionId: "t",
          eventTimestamp: new Date(0),
          clickIdType: "gclid",
          clickId: "c",
        },
      }),
    ).rejects.toBeInstanceOf(AuthException)
  })

  test("Google Ads 403 DEVELOPER_TOKEN_NOT_APPROVED carries reason and requestId", async () => {
    route(LIST_ACCESSIBLE, {
      status: 403,
      json: googleAdsFailure(
        403,
        "PERMISSION_DENIED",
        { authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED" },
        "The developer token is only approved for use with test accounts.",
      ),
    })
    const { listAccessibleCustomers } = await import("../src/apis/google-ads")

    const error = await listAccessibleCustomers(credentials).catch(
      (e: unknown) => e,
    )

    expect(error).toMatchObject({
      reason: "DEVELOPER_TOKEN_NOT_APPROVED",
      requestId: "wire-request-id",
      retryable: false,
      httpStatusCode: 403,
    })
    const { classifyGoogleAdsFailure } = await import(
      "../src/lib/failure-cause"
    )
    expect(classifyGoogleAdsFailure(error)).toBe("developer_token_not_approved")
  })

  test("403 SERVICE_DISABLED (google.rpc.ErrorInfo) classifies as api_not_enabled", async () => {
    route(LIST_ACCESSIBLE, {
      status: 403,
      json: {
        error: {
          code: 403,
          message:
            "Google Ads API has not been used in project 123 before or it is disabled.",
          status: "PERMISSION_DENIED",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason: "SERVICE_DISABLED",
              domain: "googleapis.com",
              metadata: { service: "googleads.googleapis.com" },
            },
          ],
        },
      },
    })
    const { listAccessibleCustomers } = await import("../src/apis/google-ads")
    const { classifyGoogleAdsFailure } = await import(
      "../src/lib/failure-cause"
    )

    const error = await listAccessibleCustomers(credentials).catch(
      (e: unknown) => e,
    )

    expect(classifyGoogleAdsFailure(error)).toBe("api_not_enabled")
  })

  test("429 RESOURCE_EXHAUSTED and 500 are retryable; a non-JSON 502 body still classifies by status", async () => {
    const { listAccessibleCustomers } = await import("../src/apis/google-ads")

    route(LIST_ACCESSIBLE, {
      status: 429,
      json: googleAdsFailure(
        429,
        "RESOURCE_EXHAUSTED",
        { quotaError: "RESOURCE_EXHAUSTED" },
        "Too many requests.",
      ),
    })
    expect(
      await listAccessibleCustomers(credentials).catch((e) => e),
    ).toMatchObject({ retryable: true, reason: "RESOURCE_EXHAUSTED" })

    route(LIST_ACCESSIBLE, { status: 500, json: { error: { code: 500 } } })
    expect(
      await listAccessibleCustomers(credentials).catch((e) => e),
    ).toMatchObject({ retryable: true })

    route(LIST_ACCESSIBLE, {
      status: 502,
      raw: "<html>Bad gateway</html>",
      contentType: "text/html",
    })
    expect(
      await listAccessibleCustomers(credentials).catch((e) => e),
    ).toMatchObject({ retryable: true, httpStatusCode: 502 })
  })

  test("a non-JSON 200 from the Ads API does not look like a Google failure", async () => {
    route(LIST_ACCESSIBLE, { raw: "not json", contentType: "text/plain" })
    const { listAccessibleCustomers } = await import("../src/apis/google-ads")

    const error = await listAccessibleCustomers(credentials).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(AuthException)
  })
})

describe("Data Manager failure explanations over the wire", () => {
  test("a 400 with BadRequest.fieldViolations tells why, without the click id", async () => {
    const clickId = "Cj0KCQ-WIRE-SECRET"
    route(INGEST, {
      status: 400,
      json: {
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          message: "Request contains an invalid argument.",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.BadRequest",
              fieldViolations: [
                {
                  field: "events[0].adIdentifiers.gclid",
                  description: `invalid ${clickId}`,
                  reason: "INVALID_VALUE",
                },
              ],
            },
          ],
        },
      },
    })
    const { dataManagerIngestEvent } = await import("../src/apis/data-manager")
    const { sanitizeGoogleAdsError } = await import("../src/lib/sanitize")

    const error = await dataManagerIngestEvent({
      accessToken: "t",
      loginAccountId: MANAGER,
      operatingAccountId: DIRECT,
      conversionActionId: "1",
      event: {
        transactionId: "t",
        eventTimestamp: new Date(0),
        clickIdType: "gclid",
        clickId,
      },
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GoogleAdsException)
    const { message } = sanitizeGoogleAdsError(error, { secrets: [clickId] })
    expect(message).toContain("events[0].adIdentifiers.gclid: invalid")
    expect(message).toContain("INVALID_VALUE")
    expect(message).not.toContain(clickId)
  })
})

describe("dataManagerIngestEvent consent", () => {
  const event = {
    transactionId: "gads-v2-111-i-3f2a9c41d8e75b60a1c4e9f07d2b8a35",
    eventTimestamp: new Date("2026-10-07T01:02:03.000Z"),
    clickIdType: "gclid" as const,
    clickId: "Cj0KCQ-click",
  }
  const base = {
    accessToken: "ya29.access",
    loginAccountId: MANAGER,
    operatingAccountId: DIRECT,
    conversionActionId: "987654",
  }
  const sentEvent = async (consent?: Record<string, string>) => {
    route(INGEST, { json: { requestId: "dm-request-1" } })
    const { dataManagerIngestEvent } = await import("../src/apis/data-manager")
    await dataManagerIngestEvent({
      ...base,
      event: { ...event, ...(consent ? { consent } : {}) } as never,
    })
    return (requests.at(-1)?.json as { events: Record<string, unknown>[] })
      .events[0]
  }

  test("sends the v2 transaction id and both consent settings with exact enums", async () => {
    const sent = await sentEvent({
      adUserData: "granted",
      adPersonalization: "denied",
    })

    expect(sent?.transactionId).toBe(event.transactionId)
    expect(sent?.consent).toEqual({
      adUserData: "CONSENT_GRANTED",
      adPersonalization: "CONSENT_DENIED",
    })
  })

  test.each([
    [{ adUserData: "denied" }, { adUserData: "CONSENT_DENIED" }],
    [
      { adPersonalization: "granted" },
      { adPersonalization: "CONSENT_GRANTED" },
    ],
  ])("sends only the answered setting %j", async (consent, expected) => {
    const sent = await sentEvent(consent)

    expect(sent?.consent).toEqual(expected)
  })

  test("omits consent entirely when neither setting is answered", async () => {
    expect(await sentEvent({})).not.toHaveProperty("consent")
    expect(await sentEvent()).not.toHaveProperty("consent")
  })

  test("the same event sends byte-identical bodies on a replay", async () => {
    const consent = { adUserData: "granted", adPersonalization: "denied" }
    await sentEvent(consent)
    await sentEvent(consent)

    expect(requests.at(-1)?.raw).toBe(requests.at(-2)?.raw)
  })
})

describe("dataManagerIngestEvent customer matching", () => {
  const EMAIL_HASH = "a1".repeat(32)
  const PHONE_HASH = "B2".repeat(32)
  const event = {
    transactionId: "gads-v2-111-i-3f2a9c41d8e75b60a1c4e9f07d2b8a35",
    eventTimestamp: new Date("2026-10-07T01:02:03.000Z"),
    clickIdType: "gclid" as const,
    clickId: "Cj0KCQ-click",
  }
  const base = {
    accessToken: "ya29.access",
    loginAccountId: MANAGER,
    operatingAccountId: DIRECT,
    conversionActionId: "987654",
  }
  const send = async (userIdentifiers?: Record<string, string>) => {
    route(INGEST, { json: { requestId: "dm-request-1" } })
    const { dataManagerIngestEvent } = await import("../src/apis/data-manager")
    await dataManagerIngestEvent({
      ...base,
      event: { ...event, ...(userIdentifiers ? { userIdentifiers } : {}) },
    })
    return requests.at(-1)?.json as {
      encoding?: string
      events: Record<string, unknown>[]
    }
  }

  test("sends one identifier per entry in userData and declares HEX at request level", async () => {
    const body = await send({
      emailAddress: EMAIL_HASH,
      phoneNumber: PHONE_HASH,
    })

    expect(body.encoding).toBe("HEX")
    expect(body.events[0]?.userData).toEqual({
      userIdentifiers: [
        { emailAddress: EMAIL_HASH },
        { phoneNumber: PHONE_HASH },
      ],
    })
  })

  test("a single identifier is sent alone", async () => {
    const body = await send({ phoneNumber: PHONE_HASH })

    expect(body.events[0]?.userData).toEqual({
      userIdentifiers: [{ phoneNumber: PHONE_HASH }],
    })
  })

  test("without identifiers the body has neither userData nor encoding", async () => {
    for (const userIdentifiers of [undefined, {}]) {
      const body = await send(userIdentifiers)

      expect(body).not.toHaveProperty("encoding")
      expect(body.events[0]).not.toHaveProperty("userData")
    }
  })

  test.each([
    ["a raw e-mail", { emailAddress: "jane@example.com" }],
    ["a short digest", { phoneNumber: "ab".repeat(16) }],
    ["a non-hex 64-char value", { emailAddress: "z".repeat(64) }],
  ])("%s is a terminal failure that sends nothing and echoes nothing", async (_label, identifiers) => {
    route(INGEST, { json: { requestId: "dm-request-1" } })
    const { dataManagerIngestEvent } = await import("../src/apis/data-manager")
    const before = requests.length

    const failure = await dataManagerIngestEvent({
      ...base,
      event: { ...event, userIdentifiers: identifiers },
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(GoogleAdsException)
    expect((failure as GoogleAdsException).retryable).toBe(false)
    expect(String((failure as Error).message)).not.toContain("example.com")
    expect(requests.length).toBe(before)
  })

  test("the same identifiers send byte-identical bodies on a replay", async () => {
    await send({ emailAddress: EMAIL_HASH })
    await send({ emailAddress: EMAIL_HASH })

    expect(requests.at(-1)?.raw).toBe(requests.at(-2)?.raw)
  })
})

describe("dataManagerIngestEvent customer properties", () => {
  const event = {
    transactionId: "gads-v2-111-i-3f2a9c41d8e75b60a1c4e9f07d2b8a35",
    eventTimestamp: new Date("2026-10-07T01:02:03.000Z"),
    clickIdType: "gclid" as const,
    clickId: "Cj0KCQ-click",
  }
  const base = {
    accessToken: "ya29.access",
    loginAccountId: MANAGER,
    operatingAccountId: DIRECT,
    conversionActionId: "987654",
  }
  const send = async (userProperties?: Record<string, string>) => {
    route(INGEST, { json: { requestId: "dm-request-1" } })
    const { dataManagerIngestEvent } = await import("../src/apis/data-manager")
    await dataManagerIngestEvent({
      ...base,
      event: { ...event, ...(userProperties ? { userProperties } : {}) },
    })
    return requests.at(-1)?.json as { events: Record<string, unknown>[] }
  }

  test("sends the set properties on the event itself, with no userData and no encoding", async () => {
    const body = (await send({
      customerType: "RETURNING",
      customerValueBucket: "MEDIUM",
    })) as { encoding?: string; events: Record<string, unknown>[] }

    expect(body.events[0]?.userProperties).toEqual({
      customerType: "RETURNING",
      customerValueBucket: "MEDIUM",
    })
    expect(body.events[0]).not.toHaveProperty("userData")
    expect(body).not.toHaveProperty("encoding")
  })

  test("a single property is sent alone", async () => {
    const body = await send({ customerValueBucket: "LOW" })

    expect(body.events[0]?.userProperties).toEqual({
      customerValueBucket: "LOW",
    })
  })

  test("without properties the event has no userProperties", async () => {
    const body = await send({})

    expect(body.events[0]).not.toHaveProperty("userProperties")
  })

  test.each([
    ["an unknown customer type", { customerType: "VIP" }],
    ["a lowercase bucket", { customerValueBucket: "high" }],
  ])("%s is a terminal failure that sends nothing", async (_label, props) => {
    route(INGEST, { json: { requestId: "dm-request-1" } })
    const { dataManagerIngestEvent } = await import("../src/apis/data-manager")
    const before = requests.length

    const failure = await dataManagerIngestEvent({
      ...base,
      event: { ...event, userProperties: props },
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(GoogleAdsException)
    expect((failure as GoogleAdsException).retryable).toBe(false)
    expect(requests.length).toBe(before)
  })

  test("properties and identifiers travel in their own event fields", async () => {
    route(INGEST, { json: { requestId: "dm-request-1" } })
    const { dataManagerIngestEvent } = await import("../src/apis/data-manager")
    await dataManagerIngestEvent({
      ...base,
      event: {
        ...event,
        userIdentifiers: { emailAddress: "a1".repeat(32) },
        userProperties: { customerType: "NEW" },
      },
    })

    const body = requests.at(-1)?.json as {
      events: Record<string, unknown>[]
    }
    expect(body.events[0]?.userData).toEqual({
      userIdentifiers: [{ emailAddress: "a1".repeat(32) }],
    })
    expect(body.events[0]?.userProperties).toEqual({ customerType: "NEW" })
  })
})

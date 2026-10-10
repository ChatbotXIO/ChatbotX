import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }))

vi.mock("../src/lib/http-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/http-client")>()
  return {
    ...actual,
    dataManagerHttp: { post: mocks.post, get: mocks.get },
  }
})

const { GoogleAdsException } = await import("../src/exception")
const { dataManagerIngestEvent, retrieveRequestStatus } = await import(
  "../src/apis/data-manager"
)

const CLICK_ID = "ABCDEFGHIJKLMNOP"
const event = {
  transactionId: "gads-1",
  eventTimestamp: new Date("2026-10-05T01:02:03.000Z"),
  clickIdType: "gclid" as const,
  clickId: CLICK_ID,
}
const base = {
  accessToken: "token",
  loginAccountId: "111-222-3333",
  operatingAccountId: "4445556666",
  conversionActionId: "987",
  event,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.post.mockResolvedValue({ requestId: "req-1" })
})

describe("dataManagerIngestEvent", () => {
  test("posts one MESSAGE event with a gclid to the operating conversion customer", async () => {
    const result = await dataManagerIngestEvent(base)

    expect(result).toEqual({ requestId: "req-1", fieldWarnings: [] })
    expect(mocks.post).toHaveBeenCalledWith("events:ingest", {
      headers: { Authorization: "Bearer token" },
      json: {
        destinations: [
          {
            loginAccount: {
              accountType: "GOOGLE_ADS",
              accountId: "1112223333",
            },
            operatingAccount: {
              accountType: "GOOGLE_ADS",
              accountId: "4445556666",
            },
            productDestinationId: "987",
          },
        ],
        events: [
          {
            transactionId: "gads-1",
            eventTimestamp: "2026-10-05T01:02:03.000Z",
            adIdentifiers: { gclid: CLICK_ID },
            eventSource: "MESSAGE",
          },
        ],
      },
    })
  })

  test("sends a gbraid, value and currency when given", async () => {
    await dataManagerIngestEvent({
      ...base,
      event: { ...event, clickIdType: "gbraid", value: 49.9, currency: "USD" },
    })

    const [, { json }] = mocks.post.mock.calls[0]
    expect(json.events[0]).toMatchObject({
      adIdentifiers: { gbraid: CLICK_ID },
      conversionValue: 49.9,
      currency: "USD",
    })
    expect(json.events[0].adIdentifiers.gclid).toBeUndefined()
  })

  test("adds validateOnly only when requested", async () => {
    await dataManagerIngestEvent({ ...base, validateOnly: true })
    await dataManagerIngestEvent(base)

    expect(mocks.post.mock.calls[0][1].json.validateOnly).toBe(true)
    expect(mocks.post.mock.calls[1][1].json).not.toHaveProperty("validateOnly")
  })

  test("surfaces fieldWarnings from the response", async () => {
    mocks.post.mockResolvedValue({
      requestId: "req-1",
      fieldWarnings: [{ field: "currency" }],
    })

    await expect(dataManagerIngestEvent(base)).resolves.toEqual({
      requestId: "req-1",
      fieldWarnings: [{ field: "currency" }],
    })
  })

  test("returns a null request id when Google omits it (validateOnly)", async () => {
    mocks.post.mockResolvedValue({})

    await expect(
      dataManagerIngestEvent({ ...base, validateOnly: true }),
    ).resolves.toEqual({ requestId: null, fieldWarnings: [] })
  })

  test.each([
    ["customer id", { operatingAccountId: "123" }],
    ["conversion action id", { conversionActionId: "12/../3" }],
  ])("rejects a malformed %s before any request", async (_label, override) => {
    await expect(
      dataManagerIngestEvent({ ...base, ...override }),
    ).rejects.toThrow()
    expect(mocks.post).not.toHaveBeenCalled()
  })

  test.each([
    ["customer id", { operatingAccountId: "123" }],
    ["conversion action id", { conversionActionId: "12/../3" }],
  ])("a malformed %s is a terminal GoogleAdsException, not a ZodError", async (_label, override) => {
    const error = await dataManagerIngestEvent({ ...base, ...override }).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(GoogleAdsException)
    expect(error).toMatchObject({ retryable: false })
    expect((error as Error).message).not.toContain("12/../3")
  })

  test("an unreadable 2xx ingest body is terminal (no blind resend)", async () => {
    mocks.post.mockResolvedValue({ requestId: 123, fieldWarnings: "x" })

    const error = await dataManagerIngestEvent(base).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(GoogleAdsException)
    expect(error).toMatchObject({ retryable: false })
  })

  test("a 2xx ingest body that is not JSON is terminal (no blind resend)", async () => {
    mocks.post.mockRejectedValue(new SyntaxError("Unexpected token < in JSON"))

    const error = await dataManagerIngestEvent(base).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(GoogleAdsException)
    expect(error).toMatchObject({ retryable: false })
    expect((error as Error).message).not.toContain("Unexpected token")
  })

  test("a network failure stays retryable (not mistaken for a bad body)", async () => {
    const network = new TypeError("fetch failed")
    mocks.post.mockRejectedValue(network)

    await expect(dataManagerIngestEvent(base)).rejects.toBe(network)
  })

  test("surfaces a Google failure as a typed exception", async () => {
    mocks.post.mockRejectedValue(
      Object.assign(new Error("HTTP 400"), {
        response: { status: 400 },
        data: { error: { status: "INVALID_ARGUMENT", message: "bad" } },
      }),
    )

    await expect(dataManagerIngestEvent(base)).rejects.toMatchObject({
      httpStatusCode: 400,
      retryable: false,
    })
  })
})

describe("retrieveRequestStatus", () => {
  test("maps the per-destination status, counts and reasons", async () => {
    mocks.get.mockResolvedValue({
      requestStatusPerDestination: [
        {
          destination: "accountTypes/GOOGLE_ADS/accounts/4445556666",
          requestStatus: "FAILED",
          errorInfo: {
            errorCounts: [{ reason: "EVENT_TIME_INVALID", recordCount: "1" }],
          },
          ingestEventsStatus: { recordCount: "1" },
        },
      ],
    })

    const statuses = await retrieveRequestStatus({
      accessToken: "token",
      requestId: "req-1",
    })

    expect(mocks.get).toHaveBeenCalledWith("requestStatus:retrieve", {
      headers: { Authorization: "Bearer token" },
      searchParams: { requestId: "req-1" },
    })
    expect(statuses).toEqual([
      {
        requestStatus: "FAILED",
        recordCount: 1,
        errorCounts: [{ reason: "EVENT_TIME_INVALID", recordCount: 1 }],
        warningCounts: [],
      },
    ])
  })

  test("reads the documented eventsIngestionStatus record count", async () => {
    mocks.get.mockResolvedValue({
      requestStatusPerDestination: [
        {
          destination: {
            loginAccount: { accountType: "GOOGLE_ADS", accountId: "1" },
            operatingAccount: { accountType: "GOOGLE_ADS", accountId: "2" },
            productDestinationId: "987",
          },
          requestStatus: "SUCCESS",
          warningInfo: {
            warningCounts: [
              { reason: "PROCESSING_WARNING_REASON_X", recordCount: "1" },
            ],
          },
          eventsIngestionStatus: { recordCount: "3" },
        },
      ],
    })

    await expect(
      retrieveRequestStatus({ accessToken: "t", requestId: "r" }),
    ).resolves.toEqual([
      {
        requestStatus: "SUCCESS",
        recordCount: 3,
        errorCounts: [],
        warningCounts: [
          { reason: "PROCESSING_WARNING_REASON_X", recordCount: 1 },
        ],
      },
    ])
  })

  test("a malformed status body is a terminal, sanitized exception", async () => {
    mocks.get.mockResolvedValue({ requestStatusPerDestination: "nope" })

    await expect(
      retrieveRequestStatus({ accessToken: "t", requestId: "r" }),
    ).rejects.toMatchObject({ retryable: false, name: expect.any(String) })
  })

  test("tolerates omitted default enums and a non-string destination", async () => {
    mocks.get.mockResolvedValue({
      requestStatusPerDestination: [
        {
          destination: { operatingAccount: { accountId: "1" } },
          errorInfo: { errorCounts: [{ recordCount: "2" }] },
        },
      ],
    })

    await expect(
      retrieveRequestStatus({ accessToken: "t", requestId: "r" }),
    ).resolves.toEqual([
      {
        requestStatus: "REQUEST_STATUS_UNKNOWN",
        recordCount: null,
        errorCounts: [
          { reason: "PROCESSING_ERROR_REASON_UNSPECIFIED", recordCount: 2 },
        ],
        warningCounts: [],
      },
    ])
  })

  test("returns an empty list when Google reports no destinations yet", async () => {
    mocks.get.mockResolvedValue({})

    await expect(
      retrieveRequestStatus({ accessToken: "t", requestId: "r" }),
    ).resolves.toEqual([])
  })
})

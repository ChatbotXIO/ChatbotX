import { AuthException } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import {
  GoogleAdsException,
  isRetryableGoogleAdsStatus,
  parseGoogleAdsOriginError,
  rescueGoogleAds,
} from "../src/exception"
import { sanitizeGoogleAdsError } from "../src/lib/sanitize"

const kyError = (status: number, data?: unknown) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status }, data })

describe("isRetryableGoogleAdsStatus", () => {
  test.each([
    [408, true],
    [429, true],
    [500, true],
    [503, true],
    [400, false],
    [403, false],
    [404, false],
    [409, false],
  ])("status %i → retryable=%s", (status, retryable) => {
    expect(isRetryableGoogleAdsStatus(status)).toBe(retryable)
  })
})

describe("parseGoogleAdsOriginError", () => {
  test("reads status, reason and per-error messages from a Google error body", () => {
    const source = parseGoogleAdsOriginError(
      kyError(400, {
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          message: "Request contains an invalid argument.",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason: "BAD",
            },
            { errors: [{ message: "Click is too recent" }] },
          ],
        },
      }),
    )

    expect(source).toEqual({
      httpStatusCode: 400,
      apiStatus: "INVALID_ARGUMENT",
      reason: "BAD",
      message: "Request contains an invalid argument.",
      details: ["Click is too recent"],
    })
  })

  test("falls back to the Google Ads errorCode and reads the request id", () => {
    const source = parseGoogleAdsOriginError(
      kyError(403, {
        error: {
          status: "PERMISSION_DENIED",
          details: [
            {
              requestId: "req-9",
              errors: [
                {
                  errorCode: { authorizationError: "USER_PERMISSION_DENIED" },
                  message: "User cannot access customer",
                },
              ],
            },
          ],
        },
      }),
    )

    expect(source.reason).toBe("USER_PERMISSION_DENIED")
    expect(source.requestId).toBe("req-9")
  })

  test("falls back to 400 and the error message for non-HTTP errors", () => {
    expect(parseGoogleAdsOriginError(new Error("socket hang up"))).toEqual({
      httpStatusCode: 400,
      message: "socket hang up",
      details: [],
    })
  })
})

describe("rescueGoogleAds", () => {
  test("turns a 401 into AuthException so the SDK refreshes and retries", async () => {
    await expect(
      rescueGoogleAds(() => Promise.reject(kyError(401))),
    ).rejects.toBeInstanceOf(AuthException)
  })

  test("classifies a 429 as a retryable typed exception", async () => {
    const error = await rescueGoogleAds(() =>
      Promise.reject(kyError(429, { error: { message: "Quota" } })),
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(GoogleAdsException)
    expect((error as GoogleAdsException).retryable).toBe(true)
  })

  test("classifies a 403 as terminal", async () => {
    const error = await rescueGoogleAds(() =>
      Promise.reject(kyError(403, { error: { status: "PERMISSION_DENIED" } })),
    ).catch((caught: unknown) => caught)

    expect((error as GoogleAdsException).retryable).toBe(false)
    expect((error as GoogleAdsException).apiStatus).toBe("PERMISSION_DENIED")
  })

  test("rethrows a timeout or connection reset untouched (transient, not a 400)", async () => {
    const timeout = Object.assign(new Error("Request timed out"), {
      name: "TimeoutError",
    })

    await expect(rescueGoogleAds(() => Promise.reject(timeout))).rejects.toBe(
      timeout,
    )
  })

  test("keeps the request body (click id) off the thrown exception", async () => {
    const clickId = "Cj0KCQiA1234567890abcdef"
    const httpError = Object.assign(new Error("HTTP 500"), {
      response: { status: 500 },
      options: { json: { events: [{ adIdentifiers: { gclid: clickId } }] } },
      data: { error: { message: "boom" } },
    })

    const error = await rescueGoogleAds(() => Promise.reject(httpError)).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(GoogleAdsException)
    expect(
      JSON.stringify(error, Object.getOwnPropertyNames(error as object)),
    ).not.toContain(clickId)
    expect((error as GoogleAdsException).getOriginError()).toBeUndefined()
  })

  test("passes an SDK exception through unchanged", async () => {
    const original = new AuthException("nope")
    await expect(rescueGoogleAds(() => Promise.reject(original))).rejects.toBe(
      original,
    )
  })
})

describe("parseGoogleAdsOriginError with malformed bodies", () => {
  test.each([
    ["details is a string", { error: { details: "oops" } }],
    ["details is an object", { error: { details: { reason: "x" } } }],
    ["details hold null and numbers", { error: { details: [null, 5, "x"] } }],
    ["errors is not an array", { error: { details: [{ errors: "bad" }] } }],
    [
      "errors items are wrong types",
      { error: { details: [{ errors: [null, 7, { errorCode: "x" }] }] } },
    ],
    ["error is a string", { error: "boom" }],
    ["body is an array", [1, 2]],
    ["body is null", null],
  ])("%s never throws and keeps the HTTP status", (_label, body) => {
    const source = parseGoogleAdsOriginError(kyError(503, body))

    expect(source.httpStatusCode).toBe(503)
    expect(source.details).toEqual([])
  })

  test("ignores a wrongly typed field but keeps the valid ones", () => {
    const source = parseGoogleAdsOriginError(
      kyError(400, {
        error: {
          status: 42,
          message: "kept",
          details: [
            { reason: 7 },
            { reason: "GOOD", errors: [{ message: "m" }] },
          ],
        },
      }),
    )

    expect(source).toMatchObject({
      apiStatus: undefined,
      message: "kept",
      reason: "GOOD",
      details: ["m"],
    })
  })

  test("rescueGoogleAds classifies by status even for a malformed body", async () => {
    await expect(
      rescueGoogleAds(() =>
        Promise.reject(kyError(500, { error: { details: "oops" } })),
      ),
    ).rejects.toMatchObject({ httpStatusCode: 500, retryable: true })
  })
})

describe("google.rpc.BadRequest fieldViolations", () => {
  // https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/send-events#failure_responses
  const badRequest = (fieldViolations: unknown) =>
    kyError(400, {
      error: {
        code: 400,
        status: "INVALID_ARGUMENT",
        message: "Request contains an invalid argument.",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.BadRequest",
            fieldViolations,
          },
        ],
      },
    })

  test("explains why: field, description and reason end up in the message", () => {
    const error = new GoogleAdsException(
      parseGoogleAdsOriginError(
        badRequest([
          {
            field: "events[0].adIdentifiers.gclid",
            description: "invalid",
            reason: "INVALID_VALUE",
          },
        ]),
      ),
    )

    expect(error.details).toEqual([
      "events[0].adIdentifiers.gclid: invalid (INVALID_VALUE)",
    ])
    expect(error.message).toContain("events[0].adIdentifiers.gclid: invalid")
  })

  test("is tolerant: missing parts, wrong types and junk entries never throw", () => {
    const source = parseGoogleAdsOriginError(
      badRequest([
        { field: "events[1]" },
        { description: "only a description" },
        { field: 5, description: {} },
        "junk",
        null,
      ]),
    )

    expect(source.details).toEqual(["events[1]", "only a description"])
  })

  test("a non-array fieldViolations degrades to no detail", () => {
    expect(parseGoogleAdsOriginError(badRequest("nope")).details).toEqual([])
  })

  test("keeps at most 5 violations, and the sanitised message stays bounded", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      field: `events[${index}]`,
      description: "x".repeat(500),
    }))

    const source = parseGoogleAdsOriginError(badRequest(many))

    expect(source.details).toHaveLength(5)
    const { message } = sanitizeGoogleAdsError(new GoogleAdsException(source))
    expect(message.length).toBeLessThanOrEqual(1000)
  })

  test("a click id straddling the old 200-character cut leaves no fragment", () => {
    // Truncating BEFORE redaction used to cut the id in half, so the exact-match
    // redaction missed it and a prefix of the click id reached the event row.
    const clickId = "Cj0KCQjw-STRADDLING-CLICK-ID-0123456789"
    const description = `${"a".repeat(190)}${clickId} trailing`
    const error = new GoogleAdsException(
      parseGoogleAdsOriginError(
        badRequest([{ field: "events[0].adIdentifiers.gclid", description }]),
      ),
    )

    const { message } = sanitizeGoogleAdsError(error, { secrets: [clickId] })

    expect(message).not.toContain("Cj0KCQjw")
    expect(message).not.toContain("STRADDLING")
    expect(message).toContain("[redacted]")
  })

  test("a click id echoed by Google never survives sanitising", () => {
    const clickId = "Cj0KCQjw-SECRET-CLICK"
    const error = new GoogleAdsException(
      parseGoogleAdsOriginError(
        badRequest([
          {
            field: "events[0].adIdentifiers.gclid",
            description: `Invalid gclid ${clickId} for this account; gclid=${clickId}`,
          },
        ]),
      ),
    )

    const { message } = sanitizeGoogleAdsError(error, { secrets: [clickId] })

    expect(message).toContain("events[0].adIdentifiers.gclid")
    expect(message).not.toContain(clickId)
  })
})

describe("responseSnippet (server-log diagnostics for an unreadable error body)", () => {
  const httpError = (status: number, data: unknown) =>
    Object.assign(new Error(`HTTP ${status}`), { response: { status }, data })

  test("an HTML or empty error body leaves a redacted, bounded preview", () => {
    const html = `<html>denied Bearer ya29.secret-token ${"x".repeat(1000)}</html>`

    const fromHtml = parseGoogleAdsOriginError(httpError(403, html))
    const fromEmpty = parseGoogleAdsOriginError(httpError(403, undefined))

    expect(fromHtml.responseSnippet).toContain("denied")
    expect(fromHtml.responseSnippet).not.toContain("ya29.secret-token")
    expect(fromHtml.responseSnippet?.length).toBeLessThanOrEqual(300)
    expect(fromEmpty.responseSnippet).toBe("(empty body)")
  })

  test("a readable Google error body needs no preview", () => {
    const source = parseGoogleAdsOriginError(
      httpError(403, {
        error: { code: 403, message: "denied", status: "PERMISSION_DENIED" },
      }),
    )

    expect(source.responseSnippet).toBeUndefined()
  })

  test("the preview never reaches the exception message", () => {
    const error = new GoogleAdsException(
      parseGoogleAdsOriginError(httpError(403, "<html>internal page</html>")),
    )

    expect(error.responseSnippet).toContain("internal page")
    expect(error.message).not.toContain("internal page")
  })
})

describe("parseGoogleAdsOriginError with streaming (array) error bodies", () => {
  const ownerBody = [
    {
      error: {
        code: 403,
        message: "The caller does not have permission",
        status: "PERMISSION_DENIED",
        details: [
          {
            "@type":
              "type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure",
            errors: [
              {
                errorCode: { authorizationError: "CUSTOMER_NOT_ENABLED" },
                message:
                  "The customer account can't be accessed because it is not yet enabled or has been deactivated.",
              },
            ],
          },
        ],
      },
    },
  ]

  test("reads reason, status and message from a [{error}] body without a snippet", () => {
    const source = parseGoogleAdsOriginError(kyError(403, ownerBody))

    expect(source).toMatchObject({
      httpStatusCode: 403,
      apiStatus: "PERMISSION_DENIED",
      reason: "CUSTOMER_NOT_ENABLED",
      message: "The caller does not have permission",
    })
    expect(source.details).toEqual([
      "The customer account can't be accessed because it is not yet enabled or has been deactivated.",
    ])
    expect(source.responseSnippet).toBeUndefined()
  })

  test("reads the same fields from the object form", () => {
    const source = parseGoogleAdsOriginError(kyError(403, ownerBody[0]))

    expect(source.reason).toBe("CUSTOMER_NOT_ENABLED")
    expect(source.responseSnippet).toBeUndefined()
  })

  test("uses the first array element that carries an error", () => {
    const source = parseGoogleAdsOriginError(
      kyError(403, [{ results: [] }, null, 3, ownerBody[0]]),
    )

    expect(source.reason).toBe("CUSTOMER_NOT_ENABLED")
  })

  test.each([
    [[]],
    [[1, "x", null]],
    [[{ error: "nope" }]],
    [[{ error: { details: "garbage", status: 4 } }]],
    [[[{ error: { message: "nested" } }]]],
  ])("tolerates unreadable array body %j (keeps a snippet, never throws)", (body) => {
    const source = parseGoogleAdsOriginError(kyError(403, body))

    expect(source.httpStatusCode).toBe(403)
    expect(source.reason).toBeUndefined()
    expect(source.responseSnippet).toBeDefined()
  })

  test("rescueGoogleAds surfaces the reason from an array body", async () => {
    const error = await rescueGoogleAds(() =>
      Promise.reject(kyError(403, ownerBody)),
    ).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GoogleAdsException)
    expect(error).toMatchObject({ reason: "CUSTOMER_NOT_ENABLED" })
  })
})

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  discoverAhachatPages,
  getAhachatPage,
  listAhachatContacts,
} from "../src/apis"
import { isAhachatConfigured, resolveAhachatApiBaseUrl } from "../src/client"
import { AHACHAT_API_BASE_URL_ENV } from "../src/constants"
import { AhachatApiError } from "../src/error"

const NONCE_PATTERN = /^[0-9a-f]{32}$/
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/
const HASH_KEY = btoa("s".repeat(32))
const API_KEY = btoa("a".repeat(32))
const SCOPE = {
  workspaceId: "11640681410281472",
  actor: { type: "user" as const, id: "u1" },
}
const PAGE = { channel: "messenger" as const, id: "1122334455" }
const sentBody = (_fetchMock: ReturnType<typeof stubFetch>) =>
  JSON.parse(sentBodies.at(-1) ?? "{}") as Record<string, unknown>

const pageData = {
  id: "1122334455",
  channel: "messenger",
  name: "My Shop",
  avatar: "https://cdn.example.com/page.jpg",
  link: "https://www.facebook.com/1122334455",
  connected_page_id: null,
  latest_user_id: "99",
}

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  })

/** The JSON text of each request body, read before the transport consumes it. */
const sentBodies: string[] = []

const stubFetch = (response: () => Response | Promise<Response>) => {
  const fetchMock = vi.fn(async (request: Request) => {
    sentBodies.push(await request.clone().text())
    return await response()
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const captureError = async (promise: Promise<unknown>) => {
  const error = await promise.catch((caught: unknown) => caught)
  expect(error).toBeInstanceOf(AhachatApiError)
  return error as AhachatApiError
}

beforeEach(() => {
  vi.stubEnv(AHACHAT_API_BASE_URL_ENV, "https://chatbot.example.com/export/")
  vi.stubEnv("AHACHAT_API_KEY", API_KEY)
  vi.stubEnv("AHACHAT_HASH_KEY", HASH_KEY)
  vi.stubEnv("AHACHAT_KEY_ID", "k1")
})

afterEach(() => {
  sentBodies.length = 0
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("resolveAhachatApiBaseUrl", () => {
  test.each([
    ["unset", ""],
    ["not a url", "chatbot.example.com"],
    ["plain http", "http://chatbot.example.com"],
    ["with credentials", "https://user:pass@chatbot.example.com"],
  ])("rejects a base url that is %s", (_label, value) => {
    vi.stubEnv(AHACHAT_API_BASE_URL_ENV, value)

    expect(() => resolveAhachatApiBaseUrl()).toThrow(AhachatApiError)
  })

  test("normalises the trailing slash", () => {
    vi.stubEnv(AHACHAT_API_BASE_URL_ENV, "https://chatbot.example.com///")

    expect(resolveAhachatApiBaseUrl()).toBe("https://chatbot.example.com/")
  })

  test("keeps the configured path, which the code never hard-codes", () => {
    vi.stubEnv(AHACHAT_API_BASE_URL_ENV, "https://chatbot.example.com/a/b")

    expect(resolveAhachatApiBaseUrl()).toBe("https://chatbot.example.com/a/b/")
  })
})

describe("export key contract", () => {
  test.each([
    ["no API key", "AHACHAT_API_KEY", ""],
    ["no hash key", "AHACHAT_HASH_KEY", ""],
    ["a weak API key", "AHACHAT_API_KEY", "c2hvcnQ="],
    ["a hash key that is not base64", "AHACHAT_HASH_KEY", "not base64!"],
    ["the same secret twice", "AHACHAT_HASH_KEY", API_KEY],
    ["a bad key id", "AHACHAT_KEY_ID", "a b"],
  ])("%s fails before any request", async (_label, name, value) => {
    vi.stubEnv(name, value)
    const fetchMock = stubFetch(() => jsonResponse({ data: pageData }))

    expect((await captureError(getAhachatPage(SCOPE, PAGE))).code).toBe(
      "notConfigured",
    )
    expect(isAhachatConfigured()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("the key id defaults to k1 and names the pair in the header", async () => {
    vi.stubEnv("AHACHAT_KEY_ID", "")
    const fetchMock = stubFetch(() => jsonResponse({ data: pageData }))

    await getAhachatPage(SCOPE, PAGE)

    expect(
      (fetchMock.mock.calls[0]?.[0] as Request).headers.get("X-Aha-Key-Id"),
    ).toBe("k1")
  })

  test("a rotated pair is signed under its own key id", async () => {
    vi.stubEnv("AHACHAT_API_KEY", btoa("n".repeat(32)))
    vi.stubEnv("AHACHAT_HASH_KEY", btoa("m".repeat(32)))
    vi.stubEnv("AHACHAT_KEY_ID", "k2")
    const fetchMock = stubFetch(() => jsonResponse({ data: pageData }))

    await getAhachatPage(SCOPE, PAGE)

    const headers = (fetchMock.mock.calls[0]?.[0] as Request).headers
    expect(headers.get("X-Aha-Key-Id")).toBe("k2")
    expect(headers.get("X-Aha-Api-Key")).toBe(btoa("n".repeat(32)))
  })
})

describe("isAhachatConfigured", () => {
  test.each([
    ["a valid https base url", "https://chatbot.example.com/export", true],
    ["no value", "", false],
    ["a plain http url", "http://chatbot.example.com/export", false],
  ])("is %s → %s", (_label, value, expected) => {
    vi.stubEnv(AHACHAT_API_BASE_URL_ENV, value)

    expect(isAhachatConfigured()).toBe(expected)
  })
})

describe("AhaChat client", () => {
  test("sends a signed POST with the page in the body, never a secret in the url", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ data: pageData }))

    const page = await getAhachatPage(SCOPE, PAGE)

    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(request.method).toBe("POST")
    expect(request.url).toBe("https://chatbot.example.com/export/page")
    expect(request.url).not.toContain(API_KEY)
    expect(request.headers.get("Content-Type")).toBe("application/json")
    expect(request.headers.get("Authorization")).toBeNull()
    expect(request.headers.get("X-Aha-Key-Id")).toBe("k1")
    expect(request.headers.get("X-Aha-Api-Key")).toBe(API_KEY)
    expect(request.headers.get("X-Aha-Nonce")).toMatch(NONCE_PATTERN)
    expect(request.headers.get("X-Aha-Signature")).toMatch(SIGNATURE_PATTERN)
    // The signing key is never sent, in any header or in the body.
    expect(JSON.stringify([...request.headers])).not.toContain(HASH_KEY)
    expect(sentBody(fetchMock)).toEqual({
      workspace_id: SCOPE.workspaceId,
      actor: SCOPE.actor,
      page: PAGE,
    })
    expect(page).toEqual({
      id: "1122334455",
      channel: "messenger",
      name: "My Shop",
      avatarUrl: "https://cdn.example.com/page.jpg",
      link: "https://www.facebook.com/1122334455",
      connectedPageId: null,
      latestUserId: "99",
    })
  })

  test("every call carries a fresh nonce and a signature of its own", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ data: pageData }))

    await getAhachatPage(SCOPE, PAGE)
    await getAhachatPage(SCOPE, PAGE)

    const [first, second] = fetchMock.mock.calls.map(
      (call) => (call[0] as Request).headers,
    )
    expect(first?.get("X-Aha-Nonce")).not.toBe(second?.get("X-Aha-Nonce"))
    expect(first?.get("X-Aha-Signature")).not.toBe(
      second?.get("X-Aha-Signature"),
    )
  })

  test("discovery sends the bounded pairs and reads found, absent and ambiguous", async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({
        data: [
          {
            channel: "messenger",
            id: "1",
            status: "found",
            name: "Shop",
            avatar: null,
          },
          { channel: "instagram", id: "2", status: "absent" },
          { channel: "zalo", id: "3", status: "ambiguous" },
        ],
      }),
    )

    const result = await discoverAhachatPages(SCOPE, [
      { channel: "messenger", id: "1" },
      { channel: "instagram", id: "2" },
      { channel: "zalo", id: "3" },
    ])

    expect(
      new URL((fetchMock.mock.calls[0]?.[0] as Request).url).pathname,
    ).toBe("/export/pages")
    expect(sentBody(fetchMock).pages).toHaveLength(3)
    expect(result.map((entry) => [entry.id, entry.status, entry.name])).toEqual(
      [
        ["1", "found", "Shop"],
        ["2", "absent", null],
        ["3", "ambiguous", null],
      ],
    )
  })

  test.each([
    [0],
    [101],
  ])("discovery of %i pairs is refused before any request", async (count) => {
    const fetchMock = stubFetch(() => jsonResponse({ data: [] }))
    const pages = Array.from({ length: count }, (_, index) => ({
      channel: "messenger" as const,
      id: String(index),
    }))

    expect((await captureError(discoverAhachatPages(SCOPE, pages))).code).toBe(
      "invalidRequest",
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [400, "invalidRequest"],
    [404, "notFound"],
    [422, "invalidRequest"],
    [500, "serverError"],
    [503, "serverError"],
  ])("classifies HTTP %i as %s without leaking the body or the keys", async (status, code) => {
    stubFetch(() =>
      jsonResponse({ message: `secret body ${API_KEY}` }, { status }),
    )

    const error = await captureError(getAhachatPage(SCOPE, PAGE))

    expect(error.code).toBe(code)
    expect(error.statusCode).toBe(status)
    expect(error.message).not.toContain(API_KEY)
    expect(error.message).not.toContain("secret body")
  })

  test.each([
    { header: "37", expected: 37 },
    { header: " 120 ", expected: 120 },
    { header: "0", expected: 0 },
    { header: "12abc", expected: undefined },
    { header: "-5", expected: undefined },
    { header: "1.5", expected: undefined },
    { header: "Wed, 21 Oct 2026 07:28:00 GMT", expected: undefined },
    { header: "99999999999999999999", expected: undefined },
    { header: null, expected: undefined },
  ])("Retry-After $header is read as $expected seconds", async ({
    header,
    expected,
  }) => {
    stubFetch(() =>
      jsonResponse(
        {},
        {
          status: 429,
          headers: header === null ? {} : { "Retry-After": header },
        },
      ),
    )

    const error = await captureError(getAhachatPage(SCOPE, PAGE))

    expect(error.code).toBe("rateLimited")
    expect(error.retryAfterSeconds).toBe(expected)
  })

  test("reads Retry-After on 429 and does not retry", async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({}, { status: 429, headers: { "Retry-After": "37" } }),
    )

    const error = await captureError(getAhachatPage(SCOPE, PAGE))

    expect(error.code).toBe("rateLimited")
    expect(error.retryAfterSeconds).toBe(37)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("refuses to follow a redirect", async () => {
    stubFetch(() => Response.redirect("https://evil.example.com/", 302))

    expect((await captureError(getAhachatPage(SCOPE, PAGE))).code).toBe(
      "redirect",
    )
  })

  test("a body that breaks the contract is an invalid response", async () => {
    stubFetch(() => jsonResponse({ data: { id: "1", channel: "fax" } }))

    expect((await captureError(getAhachatPage(SCOPE, PAGE))).code).toBe(
      "invalidResponse",
    )
  })

  test("a network failure is classified, not thrown raw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("fetch failed"))),
    )

    expect((await captureError(getAhachatPage(SCOPE, PAGE))).code).toBe(
      "network",
    )
  })

  test("refuses a response body over the size cap", async () => {
    stubFetch(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "Content-Length": String(20 * 1024 * 1024) },
        }),
    )

    expect((await captureError(getAhachatPage(SCOPE, PAGE))).code).toBe(
      "responseTooLarge",
    )
  })

  test("stops reading a streamed body as soon as it passes the size cap", async () => {
    const chunk = new Uint8Array(1024 * 1024)
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        controller.enqueue(chunk)
      },
    })
    stubFetch(() => new Response(stream, { status: 200 }))

    expect((await captureError(getAhachatPage(SCOPE, PAGE))).code).toBe(
      "responseTooLarge",
    )
    // An endless body is cut just past 10 MB, not read to the end.
    expect(pulled).toBeLessThan(15)
  })

  test("an unconfigured base url fails before any request", async () => {
    vi.stubEnv(AHACHAT_API_BASE_URL_ENV, "")
    const fetchMock = stubFetch(() => jsonResponse({ data: pageData }))

    expect((await captureError(getAhachatPage(SCOPE, PAGE))).code).toBe(
      "notConfigured",
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("aborting a request", () => {
  test("a caller's abort ends the call as a timeout-class failure, not a hang", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (request: Request) =>
          new Promise<Response>((_resolve, reject) => {
            if (request.signal.aborted) {
              reject(request.signal.reason)
            }
            request.signal.addEventListener("abort", () =>
              reject(request.signal.reason),
            )
          }),
      ),
    )
    const controller = new AbortController()

    const pending = captureError(
      listAhachatContacts(SCOPE, PAGE, {
        afterId: null,
        untilId: null,
        signal: controller.signal,
      }),
    )
    controller.abort()

    expect((await pending).code).toBe("timeout")
  })
})

describe("listAhachatContacts", () => {
  const validContact = {
    id: "5",
    platform_user_id: "123",
    whatsapp_user_id: null,
    first_name: "An",
    last_name: null,
    full_name: "An",
    gender: "male",
    locale: "vi_VN",
    timezone: 7,
    avatar: null,
    phone: "0901234567",
    email: null,
    ref: null,
    country: null,
    state: null,
    city: null,
    location: { latitude: 10.8, longitude: 106.7 },
    is_messaging_contact: true,
    created_at: "2024-05-01T10:00:00+07:00",
    tags: [{ id: "4", name: "VIP" }],
    custom_fields: [
      { id: "9", value: "hello" },
      { id: "10", value: true },
    ],
  }

  test("passes the cursor bounds and counts rows that break the contract", async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({
        data: {
          items: [validContact, { id: "not-a-number" }],
          next_cursor: "6",
          has_more: true,
        },
      }),
    )

    const page = await listAhachatContacts(SCOPE, PAGE, {
      afterId: "4",
      untilId: "99",
      limit: 2,
    })

    expect(
      new URL((fetchMock.mock.calls[0]?.[0] as Request).url).pathname,
    ).toBe("/export/users")
    expect(sentBody(fetchMock)).toEqual({
      workspace_id: SCOPE.workspaceId,
      actor: SCOPE.actor,
      page: PAGE,
      after_id: "4",
      until_id: "99",
      limit: 2,
    })
    expect(page.invalidCount).toBe(1)
    expect(page.nextCursor).toBe("6")
    expect(page.hasMore).toBe(true)
    expect(page.contacts).toHaveLength(1)
    expect(page.contacts[0]).toMatchObject({
      id: "5",
      platformUserId: "123",
      gender: "male",
      timezoneOffsetHours: 7,
      location: { latitude: 10.8, longitude: 106.7 },
      tags: [{ id: "4", name: "VIP" }],
      customFields: [
        { id: "9", value: "hello" },
        { id: "10", value: true },
      ],
    })
  })

  test("counts rows outside the asked id range as invalid instead of importing them", async () => {
    stubFetch(() =>
      jsonResponse({
        data: {
          items: [
            { ...validContact, id: "4" },
            validContact,
            { ...validContact, id: "100" },
          ],
          next_cursor: null,
          has_more: false,
        },
      }),
    )

    const page = await listAhachatContacts(SCOPE, PAGE, {
      afterId: "4",
      untilId: "99",
    })

    expect(page.contacts.map((contact) => contact.id)).toEqual(["5"])
    expect(page.invalidCount).toBe(2)
  })

  test("starts from zero with no upper bound and caps the page size", async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({ data: { items: [], next_cursor: null, has_more: false } }),
    )

    const page = await listAhachatContacts(SCOPE, PAGE, {
      afterId: null,
      untilId: null,
      limit: 10_000,
    })

    expect(sentBody(fetchMock)).toMatchObject({
      after_id: "0",
      until_id: null,
      limit: 500,
    })
    expect(page).toEqual({
      contacts: [],
      invalidCount: 0,
      nextCursor: null,
      hasMore: false,
    })
  })

  const pageOf = (data: {
    items: unknown[]
    next_cursor: string | null
    has_more: boolean
  }) => stubFetch(() => jsonResponse({ data }))

  test.each([
    { next: "4", label: "the same cursor" },
    { next: "3", label: "a cursor going back" },
  ])("refuses $label, which would read the same rows forever", async ({
    next,
  }) => {
    pageOf({ items: [validContact], next_cursor: next, has_more: true })

    const error = await captureError(
      listAhachatContacts(SCOPE, PAGE, { afterId: "4", untilId: null }),
    )
    expect(error.code).toBe("invalidResponse")
  })

  test("refuses more pages announced with no row, which could loop on empty pages", async () => {
    pageOf({ items: [], next_cursor: "10", has_more: true })

    const error = await captureError(
      listAhachatContacts(SCOPE, PAGE, { afterId: "4", untilId: "99" }),
    )
    expect(error.code).toBe("invalidResponse")
  })

  test.each([
    { label: "a null cursor", data: { next_cursor: null } },
    { label: "no cursor at all", data: {} },
  ])("refuses more pages announced with $label", async ({ data }) => {
    stubFetch(() =>
      jsonResponse({
        data: { items: [validContact], has_more: true, ...data },
      }),
    )

    const error = await captureError(
      listAhachatContacts(SCOPE, PAGE, { afterId: "4", untilId: "99" }),
    )
    expect(error.code).toBe("invalidResponse")
  })

  test("refuses a next cursor past the snapshot bound", async () => {
    pageOf({ items: [validContact], next_cursor: "100", has_more: true })

    const error = await captureError(
      listAhachatContacts(SCOPE, PAGE, { afterId: "4", untilId: "99" }),
    )
    expect(error.code).toBe("invalidResponse")
  })

  test("accepts a next cursor equal to the snapshot bound (inclusive)", async () => {
    pageOf({ items: [validContact], next_cursor: "99", has_more: true })

    const page = await listAhachatContacts(SCOPE, PAGE, {
      afterId: "4",
      untilId: "99",
    })
    expect(page.nextCursor).toBe("99")
  })

  test("compares cursors at the bigint maximum without precision loss", async () => {
    pageOf({
      items: [validContact],
      next_cursor: "9223372036854775807",
      has_more: false,
    })

    const page = await listAhachatContacts(SCOPE, PAGE, {
      afterId: "9223372036854775806",
      untilId: "9223372036854775807",
    })
    expect(page.nextCursor).toBe("9223372036854775807")
    // One past it, which a float would round to the same value, is refused.
    pageOf({
      items: [validContact],
      next_cursor: "9223372036854775808",
      has_more: true,
    })
    const error = await captureError(
      listAhachatContacts(SCOPE, PAGE, {
        afterId: "9223372036854775806",
        untilId: "9223372036854775807",
      }),
    )
    expect(error.code).toBe("invalidResponse")
  })

  test("the last page may be empty", async () => {
    pageOf({ items: [], next_cursor: null, has_more: false })

    const page = await listAhachatContacts(SCOPE, PAGE, {
      afterId: "4",
      untilId: "99",
    })
    expect(page.contacts).toEqual([])
    expect(page.hasMore).toBe(false)
  })

  test.each([
    { label: "a tag without a name", row: { tags: [{ id: "4" }] } },
    {
      label: "a field value that is an object",
      row: { custom_fields: [{ id: "9", value: { nested: true } }] },
    },
    {
      label: "a latitude sent as text",
      row: { location: { latitude: "10.8", longitude: 106.7 } },
    },
    { label: "a fractional timezone", row: { timezone: 5.5 } },
    { label: "an id that is not a number", row: { id: "abc" } },
  ])("a row with $label fails alone; the rows around it import", async ({
    row,
  }) => {
    pageOf({
      items: [
        validContact,
        { ...validContact, id: "6", ...row },
        { ...validContact, id: "7" },
      ],
      next_cursor: null,
      has_more: false,
    })

    const page = await listAhachatContacts(SCOPE, PAGE, {
      afterId: null,
      untilId: null,
    })

    expect(page.invalidCount).toBe(1)
    expect(page.contacts.map((contact) => contact.id)).toEqual(["5", "7"])
  })

  test("refuses a page with more rows than the page size cap", async () => {
    stubFetch(() =>
      jsonResponse({
        data: {
          items: Array.from({ length: 501 }, () => ({})),
          next_cursor: null,
          has_more: false,
        },
      }),
    )

    const error = await captureError(
      listAhachatContacts(SCOPE, PAGE, { afterId: null, untilId: null }),
    )
    expect(error.code).toBe("invalidResponse")
  })
})

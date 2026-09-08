import { ORPCError } from "@orpc/client"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  connectMessengerPageAPI,
  connectInstagramFacebookAccountAPI,
  connectInstagramAccountAPI,
  connectWhatsappNumberAPI,
} = vi.hoisted(() => ({
  connectMessengerPageAPI: vi.fn(),
  connectInstagramFacebookAccountAPI: vi.fn(),
  connectInstagramAccountAPI: vi.fn(),
  connectWhatsappNumberAPI: vi.fn(),
}))

// The typed oRPC client, not `ky`: session-authenticated procedures are only
// reachable through `/rpc`, and `/api` now serves `publicRouter` alone.
vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    integrationMessengerAPIs: { connectMessengerPageAPI },
    integrationInstagramAPIs: {
      connectInstagramFacebookAccountAPI,
      connectInstagramAccountAPI,
    },
    integrationWhatsappAPIs: { connectWhatsappNumberAPI },
  },
}))

const { connectViaApi, isSessionExpiredError } = await import(
  "@/features/channel-connect/lib/connect-client"
)
const { CONNECT_CHANNEL_REGISTRY, INSTAGRAM_DIRECT_CONNECT_ROUTE } =
  await import("@/features/channel-connect/lib/registry")
const { connectActionResultSchemaDefault } = await import(
  "@/features/channel-connect/schema"
)
const { MAX_CONNECT_DETAIL_LENGTH } = await import(
  "@chatbotx.io/business/inbox/connect-outcome-types"
)

const item = { id: "page-1", name: "Page One" }
const messengerRoute = CONNECT_CHANNEL_REGISTRY.messenger.connectRoute
const parse = (data: unknown) => connectActionResultSchemaDefault.parse(data)

const connected = {
  kind: "outcome",
  outcome: {
    sourceId: "page-1",
    name: "Page One",
    status: "connected",
    coexistEligible: true,
    integrationId: "int-1",
  },
}

const unknownFailure = {
  kind: "outcome",
  outcome: {
    sourceId: "page-1",
    name: "Page One",
    status: "failed",
    reason: "unknown",
    coexistEligible: false,
  },
}

function connectMessenger() {
  return connectViaApi({
    route: messengerRoute,
    body: { pageId: "page-1" },
    parse,
    item,
  })
}

/**
 * A lost app session speaks for the whole batch, not for one row: every
 * remaining connect would fail identically, so `useConnectBatch` has to stop
 * and show one "session expired" alert instead of N pointless retries.
 * Channel-agnostic on purpose — it classifies the transport error alone.
 */
describe("isSessionExpiredError", () => {
  test.each([
    "UNAUTHORIZED",
    "FORBIDDEN",
  ] as const)("an ORPCError with code %s is the session case", (code) => {
    expect(isSessionExpiredError(new ORPCError(code))).toBe(true)
  })

  test.each([
    401, 403,
  ])("an ORPCError carrying status %s is the session case whatever its code", (status) => {
    expect(
      isSessionExpiredError(new ORPCError("BAD_REQUEST", { status })),
    ).toBe(true)
  })

  test.each([
    "NOT_FOUND",
    "INTERNAL_SERVER_ERROR",
    "BAD_REQUEST",
  ] as const)("an ORPCError with code %s is NOT the session case", (code) => {
    expect(isSessionExpiredError(new ORPCError(code))).toBe(false)
  })

  test("a plain error is not the session case", () => {
    expect(isSessionExpiredError(new Error("network down"))).toBe(false)
    expect(isSessionExpiredError(undefined)).toBe(false)
    // A bare object that merely looks like one must not pass either.
    expect(isSessionExpiredError({ code: "UNAUTHORIZED", status: 401 })).toBe(
      false,
    )
  })
})

/**
 * The picker's transport. Everything it can meet — a rejected call, an auth
 * failure, a body that does not match the contract — has to land on the same
 * typed outcome the batch already knows how to render and retry.
 */
describe("connectViaApi", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("calls the route's procedure with the ids and returns the parsed result", async () => {
    connectMessengerPageAPI.mockResolvedValue(connected)

    await expect(connectMessenger()).resolves.toEqual(connected)

    expect(connectMessengerPageAPI).toHaveBeenCalledTimes(1)
    expect(connectMessengerPageAPI).toHaveBeenCalledWith({ pageId: "page-1" })
    // No client-side timeout option is passed: `useConnectBatch`'s own
    // CONNECT_REQUEST_TIMEOUT_MS is the single timeout authority.
    expect(connectMessengerPageAPI.mock.calls[0]).toHaveLength(1)
  })

  test("a session error comes back untouched — it is a normal result, not a failure", async () => {
    const sessionError = { kind: "sessionError", code: "sessionExpired" }
    connectMessengerPageAPI.mockResolvedValue(sessionError)

    await expect(connectMessenger()).resolves.toEqual(sessionError)
  })

  test("a rejected call becomes the shared failed/unknown outcome", async () => {
    connectMessengerPageAPI.mockRejectedValue(new Error("network down"))

    await expect(connectMessenger()).resolves.toEqual(unknownFailure)
  })

  test("a body that does not match the channel's contract is treated the same way", async () => {
    connectMessengerPageAPI.mockResolvedValue({ nonsense: true })

    await expect(connectMessenger()).resolves.toEqual(unknownFailure)
  })

  test.each([
    "UNAUTHORIZED",
    "FORBIDDEN",
  ] as const)("an ORPCError %s stops the batch as a session error instead of offering N pointless retries", async (code) => {
    connectMessengerPageAPI.mockRejectedValue(new ORPCError(code))

    await expect(connectMessenger()).resolves.toEqual({
      kind: "sessionError",
      code: "sessionExpired",
    })
  })

  test.each([
    "NOT_FOUND",
    "INTERNAL_SERVER_ERROR",
    "BAD_GATEWAY",
  ] as const)("an ORPCError %s stays a retryable row — only auth failures speak for the whole batch", async (code) => {
    connectMessengerPageAPI.mockRejectedValue(new ORPCError(code))

    await expect(connectMessenger()).resolves.toEqual(unknownFailure)
  })
})

/**
 * The registry is the one file allowed to name a channel, so each entry has to
 * be pinned to the procedure it wraps: a route silently pointing at the wrong
 * channel's procedure would connect the wrong account, and no type would
 * object (every connect answers the same outcome shape).
 */
describe("the connect routes call their own channel's procedure", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("Messenger", async () => {
    connectMessengerPageAPI.mockResolvedValue(connected)

    await CONNECT_CHANNEL_REGISTRY.messenger.connectRoute.call({
      pageId: "page-1",
    })

    expect(connectMessengerPageAPI).toHaveBeenCalledWith({ pageId: "page-1" })
    expect(connectInstagramFacebookAccountAPI).not.toHaveBeenCalled()
  })

  test("Instagram via Facebook", async () => {
    connectInstagramFacebookAccountAPI.mockResolvedValue(connected)

    await CONNECT_CHANNEL_REGISTRY.instagram.connectRoute.call({
      igId: "ig-1",
    })

    expect(connectInstagramFacebookAccountAPI).toHaveBeenCalledWith({
      igId: "ig-1",
    })
    // The other Instagram login has its own procedure — never this one.
    expect(connectInstagramAccountAPI).not.toHaveBeenCalled()
  })

  test("Instagram direct login", async () => {
    connectInstagramAccountAPI.mockResolvedValue(connected)

    await INSTAGRAM_DIRECT_CONNECT_ROUTE.call({ igId: "ig-1" })

    expect(connectInstagramAccountAPI).toHaveBeenCalledWith({ igId: "ig-1" })
    expect(connectInstagramFacebookAccountAPI).not.toHaveBeenCalled()
  })

  test("WhatsApp", async () => {
    connectWhatsappNumberAPI.mockResolvedValue(connected)

    const body = {
      signupSessionId: "sess-1",
      phoneNumberId: "phone-1",
      connectExisting: false,
      transferPhoneNumber: false,
      marketingMessageLite: false,
    }

    await CONNECT_CHANNEL_REGISTRY.whatsapp.connectRoute.call(body)

    expect(connectWhatsappNumberAPI).toHaveBeenCalledWith(body)
  })
})

/**
 * The wire contract for the provider's own sentence on a rejected row. The
 * bound is `MAX_CONNECT_DETAIL_LENGTH` — the same constant the business mapper
 * caps at (`packages/business/src/inbox/connect-outcome-types.ts`), so a
 * sentence the mapper produced can never fail this parse, and a longer one
 * forged by a caller never reaches a row.
 */
describe("connectOutcomeSchema — provider detail", () => {
  const rejected = (detail?: string) => ({
    kind: "outcome",
    outcome: {
      sourceId: "page-1",
      name: "Page One",
      status: "failed",
      reason: "providerRejected",
      coexistEligible: false,
      ...(detail === undefined ? {} : { detail }),
    },
  })

  test("carries the provider sentence through unchanged", () => {
    const body = rejected("WhatsApp accounts cannot be used with this API.")

    expect(parse(body)).toEqual(body)
  })

  test("detail stays optional — an outcome without one still parses", () => {
    expect(parse(rejected())).toEqual(rejected())
  })

  test("rejects a detail longer than the mapper's own cap", () => {
    expect(() =>
      parse(rejected("x".repeat(MAX_CONNECT_DETAIL_LENGTH + 1))),
    ).toThrow()
    expect(() =>
      parse(rejected("x".repeat(MAX_CONNECT_DETAIL_LENGTH))),
    ).not.toThrow()
  })
})

import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"

vi.mock("../src/lib/http-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/http-client")>()),
  facebookGraphClient: {
    get: vi.fn(),
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Dynamic imports ensure vi.mock is fully applied before loading these modules.
const { getMessengerWelcomeProfile, logMessengerWelcomeProfile } = await import(
  "../src/apis/page"
)
const { facebookGraphClient } = await import("../src/lib/http-client")
const { logger } = await import("../src/lib/logger")

const mockGet = facebookGraphClient.get as MockInstance

const VERSION = "v99.0"
const ctx = {
  auth: {
    tokens: { accessToken: "page-token" },
    version: VERSION,
    metadata: { pageId: "page-1", pageName: "Page", version: VERSION },
  },
} as never

const welcomeProfile = {
  get_started: { payload: "11599493211357184:" },
  greeting: [{ locale: "default", text: "Hello!" }],
  ice_breakers: [
    {
      locale: "default",
      call_to_actions: [{ question: "Hours?", payload: "hours:" }],
    },
  ],
}

describe("getMessengerWelcomeProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("reads the welcome fields with the page token and unwraps the data array", async () => {
    mockGet.mockResolvedValue({ data: [welcomeProfile] })

    const profile = await getMessengerWelcomeProfile({ ctx })

    expect(mockGet).toHaveBeenCalledWith(`${VERSION}/me/messenger_profile`, {
      headers: { Authorization: "Bearer page-token" },
      searchParams: { fields: "get_started,ice_breakers,greeting" },
      retry: 0,
    })
    expect(profile).toEqual(welcomeProfile)
  })

  test("returns an empty profile when none of the fields are set", async () => {
    mockGet.mockResolvedValue({ data: [] })

    await expect(getMessengerWelcomeProfile({ ctx })).resolves.toEqual({})
  })

  test("returns an empty profile when Graph omits the data array", async () => {
    mockGet.mockResolvedValue({})

    await expect(getMessengerWelcomeProfile({ ctx })).resolves.toEqual({})
  })
})

describe("logMessengerWelcomeProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("logs the profile with the page and the trigger reason", async () => {
    mockGet.mockResolvedValue({ data: [welcomeProfile] })

    await logMessengerWelcomeProfile({ ctx, reason: "profileUpdated" })

    expect(logger.info).toHaveBeenCalledWith(
      { pageId: "page-1", reason: "profileUpdated", profile: welcomeProfile },
      "Messenger welcome profile",
    )
    expect(logger.warn).not.toHaveBeenCalled()
  })

  test("swallows a Graph failure without logging it a second time", async () => {
    const graphError = new Error("(#190) Error validating access token")
    mockGet.mockRejectedValue(graphError)

    await expect(
      logMessengerWelcomeProfile({ ctx, reason: "tokenRefreshed" }),
    ).resolves.toBeUndefined()

    // `rescue` / the http client already logged the failure once; this helper
    // only adds page + trigger context at debug level.
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        pageId: "page-1",
        reason: "tokenRefreshed",
      }),
      "Skipped Messenger welcome profile read-back",
    )
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })

  test("does not throw when the auth has no metadata", async () => {
    mockGet.mockResolvedValue({ data: [welcomeProfile] })
    const ctxWithoutMetadata = {
      auth: { tokens: { accessToken: "page-token" }, version: VERSION },
    } as never

    await expect(
      logMessengerWelcomeProfile({
        ctx: ctxWithoutMetadata,
        reason: "pageConnected",
      }),
    ).resolves.toBeUndefined()

    expect(logger.info).toHaveBeenCalledWith(
      { pageId: undefined, reason: "pageConnected", profile: welcomeProfile },
      "Messenger welcome profile",
    )
  })

  test("does not throw when the auth is malformed", async () => {
    await expect(
      logMessengerWelcomeProfile({
        ctx: { auth: undefined } as never,
        reason: "profileUpdated",
      }),
    ).resolves.toBeUndefined()

    expect(mockGet).not.toHaveBeenCalled()
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: undefined, reason: "profileUpdated" }),
      "Skipped Messenger welcome profile read-back",
    )
  })
})

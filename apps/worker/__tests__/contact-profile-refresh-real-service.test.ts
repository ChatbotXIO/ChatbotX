import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Worker-level coverage for `refreshExistingContactProfile` running against
// the REAL `contactProfileRefreshService.refresh`
// (packages/business/src/contact/profile-refresh/service.ts +
// cooldown.ts) — unlike `contact-profile-refresh.test.ts` (which fakes
// `contactProfileRefreshService.refresh` wholesale to isolate the worker's
// own wiring), this file only fakes the service's leaf dependencies
// (`distributedStore`, `contactService`, `logProviderErrorForChannel`,
// `uploader`) so the cooldown/skip/failed-recording rules run for real,
// end-to-end, from the worker's handler. Added per final-review item 5 of
// .superpowers/sdd/2026-08-31-messenger-ctm-profile-backfill/final-fix-report.md.
// ---------------------------------------------------------------------------

const existsMock = vi.fn(async () => false)
const setNumberMock = vi.fn(async () => undefined)
// `importOriginal`, not a full replacement: the real `@chatbotx.io/business`
// barrel (imported below) reaches other `@chatbotx.io/redis` exports (e.g.
// `bloomFilter`, via packages/analytics) that a plain-object mock would leave
// undefined.
vi.mock("@chatbotx.io/redis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/redis")>()
  return {
    ...actual,
    distributedStore: { exists: existsMock, setNumber: setNumberMock },
  }
})

const deleteObjectMock = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { deleteObject: deleteObjectMock },
}))

// Mocked by their resolved file path, not the `@chatbotx.io/business`
// package specifier: `contactProfileRefreshService.refresh` imports these
// two via relative paths internal to the business package
// (`../service` / `../../error-log/service` from
// `packages/business/src/contact/profile-refresh/service.ts`), so a mock
// keyed on the `@chatbotx.io/business` barrel specifier would never
// intercept them.
const findByIdOrFailMock = vi.fn()
const findByIdMock = vi.fn()
const updateMock = vi.fn()
vi.mock("../../../packages/business/src/contact/service", () => ({
  contactService: {
    findByIdOrFail: findByIdOrFailMock,
    findById: findByIdMock,
    update: updateMock,
  },
}))

const logProviderErrorForChannelMock = vi.fn(async () => undefined)
vi.mock("../../../packages/business/src/error-log/service", () => ({
  logProviderErrorForChannel: logProviderErrorForChannelMock,
}))

const mockResolveIntegrationContextFromContactInbox = vi.fn()
vi.mock("../src/services/integrations", () => ({
  resolveIntegrationContextFromContactInbox:
    mockResolveIntegrationContextFromContactInbox,
}))

const mockLoggerWarn = vi.fn()
const mockLoggerDebug = vi.fn()
vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: mockLoggerWarn,
    debug: mockLoggerDebug,
    info: vi.fn(),
    error: vi.fn(),
  },
}))

const { refreshExistingContactProfile } = await import(
  "../src/integration/handlers/contact-profile-refresh"
)
const { PROFILE_REFRESH_COOLDOWN_SECONDS } = await import(
  "@chatbotx.io/business"
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const namelessContact = { firstName: null, lastName: null }

const fakeInbox = {
  id: "inbox-1",
  workspaceId: "ws-1",
  channel: "messenger",
} as unknown as import("@chatbotx.io/database/types").InboxModel

const fakeContactInbox = {
  id: "ci-1",
  contactId: "contact-1",
  inboxId: "inbox-1",
  sourceId: "psid-123",
  channel: "messenger",
} as unknown as import("@chatbotx.io/database/types").ContactInboxModel

const fakeIncomingContact = { sourceId: "psid-123", firstName: "Jane" }

const cooldownKey = `contact-profile-refresh:cooldown:${fakeContactInbox.id}`

beforeEach(() => {
  vi.clearAllMocks()
  existsMock.mockResolvedValue(false)
  setNumberMock.mockResolvedValue(undefined)
  deleteObjectMock.mockResolvedValue(undefined)
  logProviderErrorForChannelMock.mockResolvedValue(undefined)
  findByIdOrFailMock.mockResolvedValue({ ...namelessContact })
  findByIdMock.mockResolvedValue(undefined)
  updateMock.mockImplementation(async (ctx, data) => ({
    id: ctx.id,
    workspaceId: ctx.workspaceId,
    ...data,
  }))
})

describe("refreshExistingContactProfile against the real contactProfileRefreshService", () => {
  test("channelApi getProfile throws → failed + cooldown started; a second attempt while cooling down skips without calling getProfile; a third attempt after cooldown clears calls getProfile again", async () => {
    const runChannelHandler = vi
      .fn()
      .mockRejectedValue(new Error("Graph API unavailable"))
    mockResolveIntegrationContextFromContactInbox.mockResolvedValue({
      integration: { runChannelHandler },
      ctx: { workspaceId: "ws-1" },
    })

    // --- Attempt 1: the channel-API fetch throws ---------------------------
    await refreshExistingContactProfile({
      inbox: fakeInbox,
      contactInbox: fakeContactInbox,
      incomingContact: fakeIncomingContact,
      contactId: "contact-1",
    })

    expect(runChannelHandler).toHaveBeenCalledTimes(1)
    expect(logProviderErrorForChannelMock).toHaveBeenCalledWith(
      "messenger",
      expect.objectContaining({
        workspaceId: "ws-1",
        contactId: "contact-1",
      }),
    )
    expect(setNumberMock).toHaveBeenCalledWith(
      cooldownKey,
      expect.any(Number),
      PROFILE_REFRESH_COOLDOWN_SECONDS,
    )
    expect(PROFILE_REFRESH_COOLDOWN_SECONDS).toBe(300)
    expect(mockLoggerDebug).toHaveBeenCalledWith(
      expect.objectContaining({ result: { status: "failed" } }),
      expect.any(String),
    )

    // --- Attempt 2: still cooling down --------------------------------------
    existsMock.mockResolvedValueOnce(true)
    runChannelHandler.mockClear()
    setNumberMock.mockClear()

    await refreshExistingContactProfile({
      inbox: fakeInbox,
      contactInbox: fakeContactInbox,
      incomingContact: fakeIncomingContact,
      contactId: "contact-1",
    })

    expect(runChannelHandler).not.toHaveBeenCalled()
    expect(setNumberMock).not.toHaveBeenCalled()
    expect(mockLoggerDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        result: { status: "skipped", reason: "coolingDown" },
      }),
      expect.any(String),
    )

    // --- Attempt 3: cooldown has cleared -------------------------------------
    existsMock.mockResolvedValueOnce(false)
    runChannelHandler.mockResolvedValueOnce({
      firstName: "Jane",
      lastName: null,
    })

    await refreshExistingContactProfile({
      inbox: fakeInbox,
      contactInbox: fakeContactInbox,
      incomingContact: fakeIncomingContact,
      contactId: "contact-1",
    })

    expect(runChannelHandler).toHaveBeenCalledTimes(1)
    expect(mockLoggerDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({ status: "updated" }),
      }),
      expect.any(String),
    )
  })

  test("resolveIntegrationContextFromContactInbox throws (missing/disconnected integration) → failed, cooldown started, never throws", async () => {
    mockResolveIntegrationContextFromContactInbox.mockRejectedValue(
      new Error("integration not found"),
    )

    await expect(
      refreshExistingContactProfile({
        inbox: fakeInbox,
        contactInbox: fakeContactInbox,
        incomingContact: fakeIncomingContact,
        contactId: "contact-1",
      }),
    ).resolves.toBeUndefined()

    expect(logProviderErrorForChannelMock).toHaveBeenCalledWith(
      "messenger",
      expect.objectContaining({
        workspaceId: "ws-1",
        contactId: "contact-1",
      }),
    )
    expect(setNumberMock).toHaveBeenCalledWith(
      cooldownKey,
      expect.any(Number),
      PROFILE_REFRESH_COOLDOWN_SECONDS,
    )
    expect(mockLoggerDebug).toHaveBeenCalledWith(
      expect.objectContaining({ result: { status: "failed" } }),
      expect.any(String),
    )
  })
})

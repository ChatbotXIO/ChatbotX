import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// refreshContactProfileAction — authorization gate (findByIdOrFail) runs
// before any inbox/integration/Graph work; a non-capable channel short
// circuits before the factory table; the per-channel factory table resolves
// the right integration service + registry (including the instagram
// facebook-vs-direct split); and failed/unavailable are RETURNED, never
// thrown. See
// .superpowers/sdd/2026-08-31-messenger-ctm-profile-backfill/task-3-brief.md
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  findByIdOrFail: vi.fn(),
  findContactInboxByUncached: vi.fn(),
  refresh: vi.fn(),
  requireContactPermissionScope: vi.fn(),
  messengerFindByInboxIdForWorkspace: vi.fn(),
  instagramFindByInboxIdForWorkspace: vi.fn(),
  zaloFindByInboxIdForWorkspace: vi.fn(),
  telegramFindByInboxIdForWorkspace: vi.fn(),
  buildContext: vi.fn(),
  messengerRunChannelHandler: vi.fn(),
  instagramRunChannelHandler: vi.fn(),
  instagramFacebookRunChannelHandler: vi.fn(),
  zaloRunChannelHandler: vi.fn(),
  telegramRunChannelHandler: vi.fn(),
}))

const ON_DEMAND_CHANNELS = new Set([
  "messenger",
  "instagram",
  "zalo",
  "telegram",
])

vi.mock("@chatbotx.io/business", () => ({
  contactService: { findByIdOrFail: mocks.findByIdOrFail },
  contactInboxService: { findByUncached: mocks.findContactInboxByUncached },
  contactProfileRefreshService: { refresh: mocks.refresh },
  hasOnDemandProfileApi: (channel: string) => ON_DEMAND_CHANNELS.has(channel),
  messengerIntegrationService: {
    findByInboxIdForWorkspace: mocks.messengerFindByInboxIdForWorkspace,
  },
  instagramIntegrationService: {
    findByInboxIdForWorkspace: mocks.instagramFindByInboxIdForWorkspace,
  },
  zaloIntegrationService: {
    findByInboxIdForWorkspace: mocks.zaloFindByInboxIdForWorkspace,
  },
  telegramIntegrationService: {
    findByInboxIdForWorkspace: mocks.telegramFindByInboxIdForWorkspace,
  },
  buildContext: mocks.buildContext,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("@/integration", () => ({
  integrations: {
    messenger: { runChannelHandler: mocks.messengerRunChannelHandler },
    instagram: { runChannelHandler: mocks.instagramRunChannelHandler },
    instagramFacebook: {
      runChannelHandler: mocks.instagramFacebookRunChannelHandler,
    },
    zalo: { runChannelHandler: mocks.zaloRunChannelHandler },
    telegram: { runChannelHandler: mocks.telegramRunChannelHandler },
  },
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

vi.mock("@/features/contacts/permissions", () => ({
  requireContactPermissionScope: mocks.requireContactPermissionScope,
}))

vi.mock("@/features/contacts/schema/action", () => ({
  refreshContactProfileRequest: {},
}))

const { refreshContactProfileAction } = await import(
  "../src/features/contacts/actions/refresh-contact-profile.action"
)

const ACCESS_SCOPE = { canViewEmailAndPhone: true }

const callAction = (input: {
  workspaceId?: string
  contactId?: string
  contactInboxId?: string
}) =>
  (
    refreshContactProfileAction as unknown as (props: {
      bindArgsParsedInputs: [string, string]
      parsedInput: { contactInboxId: string }
    }) => Promise<unknown>
  )({
    bindArgsParsedInputs: [
      input.workspaceId ?? "ws-1",
      input.contactId ?? "contact-1",
    ],
    parsedInput: { contactInboxId: input.contactInboxId ?? "ci-1" },
  })

const noFactoryMocksCalled = () => {
  expect(mocks.messengerFindByInboxIdForWorkspace).not.toHaveBeenCalled()
  expect(mocks.instagramFindByInboxIdForWorkspace).not.toHaveBeenCalled()
  expect(mocks.zaloFindByInboxIdForWorkspace).not.toHaveBeenCalled()
  expect(mocks.telegramFindByInboxIdForWorkspace).not.toHaveBeenCalled()
  expect(mocks.buildContext).not.toHaveBeenCalled()
  expect(mocks.messengerRunChannelHandler).not.toHaveBeenCalled()
  expect(mocks.instagramRunChannelHandler).not.toHaveBeenCalled()
  expect(mocks.instagramFacebookRunChannelHandler).not.toHaveBeenCalled()
  expect(mocks.zaloRunChannelHandler).not.toHaveBeenCalled()
  expect(mocks.telegramRunChannelHandler).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireContactPermissionScope.mockResolvedValue(ACCESS_SCOPE)
  mocks.findByIdOrFail.mockResolvedValue({ id: "contact-1" })
  mocks.buildContext.mockImplementation(
    async ({ integrationType, integration }) => ({
      integrationType,
      auth: integration.auth,
    }),
  )
  // Simulates the essential part of the real
  // contactProfileRefreshService.refresh pipeline: call fetchProfile and
  // never let it throw out of the action — a rejection becomes "failed".
  mocks.refresh.mockImplementation(async (input) => {
    try {
      const profile = await input.fetchProfile()
      return profile
        ? { status: "updated", contact: { id: input.contactId, ...profile } }
        : { status: "unavailable" }
    } catch {
      return { status: "failed" }
    }
  })
})

describe("refreshContactProfileAction — authorization gate", () => {
  test("a permission-scope rejection propagates before any inbox/integration/Graph work", async () => {
    mocks.requireContactPermissionScope.mockRejectedValueOnce(
      new Error("not authorized"),
    )

    await expect(callAction({})).rejects.toThrow("not authorized")

    expect(mocks.findByIdOrFail).not.toHaveBeenCalled()
    expect(mocks.findContactInboxByUncached).not.toHaveBeenCalled()
    noFactoryMocksCalled()
  })

  test("a contact outside the accessScope/workspace rejects at findByIdOrFail before findByUncached, the adapter, buildContext or Graph", async () => {
    mocks.findByIdOrFail.mockRejectedValueOnce(new Error("contact not found"))

    await expect(callAction({})).rejects.toThrow("contact not found")

    expect(mocks.findByIdOrFail).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "contact-1",
      accessScope: ACCESS_SCOPE,
    })
    expect(mocks.findContactInboxByUncached).not.toHaveBeenCalled()
    noFactoryMocksCalled()
  })

  test("a contactInboxId not belonging to contactId throws a not-found exception, factory uncalled", async () => {
    mocks.findContactInboxByUncached.mockResolvedValueOnce(undefined)

    await expect(callAction({})).rejects.toThrow("Contact inbox not found")

    expect(mocks.findContactInboxByUncached).toHaveBeenCalledWith({
      where: { id: "ci-1", contactId: "contact-1" },
    })
    noFactoryMocksCalled()
  })
})

describe("refreshContactProfileAction — channel capability gate", () => {
  test("onDemand:false channel (whatsapp) returns skipped/channelNotCapable, factory uncalled", async () => {
    mocks.findContactInboxByUncached.mockResolvedValueOnce({
      id: "ci-1",
      contactId: "contact-1",
      channel: "whatsapp",
      inboxId: "inbox-1",
      sourceId: "source-1",
    })

    await expect(callAction({})).resolves.toEqual({
      status: "skipped",
      reason: "channelNotCapable",
    })

    expect(mocks.refresh).not.toHaveBeenCalled()
    noFactoryMocksCalled()
  })

  test("unknown/legacy channel string returns skipped/channelNotCapable, never throws, factory uncalled", async () => {
    mocks.findContactInboxByUncached.mockResolvedValueOnce({
      id: "ci-1",
      contactId: "contact-1",
      channel: "legacy",
      inboxId: "inbox-1",
      sourceId: "source-1",
    })

    await expect(callAction({})).resolves.toEqual({
      status: "skipped",
      reason: "channelNotCapable",
    })

    expect(mocks.refresh).not.toHaveBeenCalled()
    noFactoryMocksCalled()
  })
})

describe("refreshContactProfileAction — per-channel factory table", () => {
  test("findByInboxIdForWorkspace throwing (disconnected integration) returns failed, never thrown", async () => {
    mocks.findContactInboxByUncached.mockResolvedValueOnce({
      id: "ci-1",
      contactId: "contact-1",
      channel: "messenger",
      inboxId: "inbox-1",
      sourceId: "source-1",
    })
    mocks.messengerFindByInboxIdForWorkspace.mockRejectedValueOnce(
      new Error("integration disconnected"),
    )

    await expect(callAction({})).resolves.toEqual({ status: "failed" })

    expect(mocks.buildContext).not.toHaveBeenCalled()
    expect(mocks.messengerRunChannelHandler).not.toHaveBeenCalled()
  })

  test("instagram row with type:'facebook' dispatches through integrations.instagramFacebook", async () => {
    mocks.findContactInboxByUncached.mockResolvedValueOnce({
      id: "ci-1",
      contactId: "contact-1",
      channel: "instagram",
      inboxId: "inbox-1",
      sourceId: "source-1",
    })
    mocks.instagramFindByInboxIdForWorkspace.mockResolvedValueOnce({
      id: "ig-1",
      type: "facebook",
      auth: { accessToken: "tok" },
    })
    mocks.instagramFacebookRunChannelHandler.mockResolvedValueOnce({
      firstName: "Jane",
    })

    await expect(callAction({})).resolves.toEqual({
      status: "updated",
      contact: { id: "contact-1", firstName: "Jane" },
    })

    expect(mocks.instagramFacebookRunChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getProfile",
      expect.objectContaining({ data: { sourceId: "source-1" } }),
    )
    expect(mocks.instagramRunChannelHandler).not.toHaveBeenCalled()
  })

  test("instagram row with type:'instagram' dispatches through integrations.instagram", async () => {
    mocks.findContactInboxByUncached.mockResolvedValueOnce({
      id: "ci-1",
      contactId: "contact-1",
      channel: "instagram",
      inboxId: "inbox-1",
      sourceId: "source-1",
    })
    mocks.instagramFindByInboxIdForWorkspace.mockResolvedValueOnce({
      id: "ig-1",
      type: "instagram",
      auth: { accessToken: "tok" },
    })
    mocks.instagramRunChannelHandler.mockResolvedValueOnce({
      firstName: "Jane",
    })

    await expect(callAction({})).resolves.toEqual({
      status: "updated",
      contact: { id: "contact-1", firstName: "Jane" },
    })

    expect(mocks.instagramRunChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getProfile",
      expect.objectContaining({ data: { sourceId: "source-1" } }),
    )
    expect(mocks.instagramFacebookRunChannelHandler).not.toHaveBeenCalled()
  })

  test("zalo factory resolves through zaloIntegrationService.findByInboxIdForWorkspace", async () => {
    mocks.findContactInboxByUncached.mockResolvedValueOnce({
      id: "ci-1",
      contactId: "contact-1",
      channel: "zalo",
      inboxId: "inbox-1",
      sourceId: "source-1",
    })
    mocks.zaloFindByInboxIdForWorkspace.mockResolvedValueOnce({
      id: "zalo-1",
      auth: { accessToken: "tok" },
    })
    mocks.zaloRunChannelHandler.mockResolvedValueOnce({ firstName: "Jane" })

    await expect(callAction({})).resolves.toEqual({
      status: "updated",
      contact: { id: "contact-1", firstName: "Jane" },
    })

    expect(mocks.zaloFindByInboxIdForWorkspace).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      workspaceId: "ws-1",
    })
    expect(mocks.zaloRunChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getProfile",
      expect.objectContaining({ data: { sourceId: "source-1" } }),
    )
  })

  test("telegram factory resolves through telegramIntegrationService.findByInboxIdForWorkspace", async () => {
    mocks.findContactInboxByUncached.mockResolvedValueOnce({
      id: "ci-1",
      contactId: "contact-1",
      channel: "telegram",
      inboxId: "inbox-1",
      sourceId: "source-1",
    })
    mocks.telegramFindByInboxIdForWorkspace.mockResolvedValueOnce({
      id: "telegram-1",
      auth: { secretText: "tok" },
    })
    mocks.telegramRunChannelHandler.mockResolvedValueOnce({
      firstName: "Jane",
    })

    await expect(callAction({})).resolves.toEqual({
      status: "updated",
      contact: { id: "contact-1", firstName: "Jane" },
    })

    expect(mocks.telegramFindByInboxIdForWorkspace).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      workspaceId: "ws-1",
    })
    expect(mocks.telegramRunChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getProfile",
      expect.objectContaining({ data: { sourceId: "source-1" } }),
    )
  })
})

describe("refreshContactProfileAction — service outcomes are returned, never thrown", () => {
  test("failed is returned, not thrown", async () => {
    mocks.findContactInboxByUncached.mockResolvedValueOnce({
      id: "ci-1",
      contactId: "contact-1",
      channel: "messenger",
      inboxId: "inbox-1",
      sourceId: "source-1",
    })
    mocks.messengerFindByInboxIdForWorkspace.mockResolvedValueOnce({
      id: "messenger-1",
      auth: { accessToken: "tok" },
    })
    mocks.messengerRunChannelHandler.mockRejectedValueOnce(
      new Error("graph error"),
    )

    await expect(callAction({})).resolves.toEqual({ status: "failed" })
  })

  test("unavailable is returned, not thrown", async () => {
    mocks.findContactInboxByUncached.mockResolvedValueOnce({
      id: "ci-1",
      contactId: "contact-1",
      channel: "messenger",
      inboxId: "inbox-1",
      sourceId: "source-1",
    })
    mocks.messengerFindByInboxIdForWorkspace.mockResolvedValueOnce({
      id: "messenger-1",
      auth: { accessToken: "tok" },
    })
    mocks.messengerRunChannelHandler.mockResolvedValueOnce(null)

    await expect(callAction({})).resolves.toEqual({ status: "unavailable" })
  })

  test("happy path returns status:'updated' with a ContactResource-shaped contact", async () => {
    mocks.findContactInboxByUncached.mockResolvedValueOnce({
      id: "ci-1",
      contactId: "contact-1",
      channel: "messenger",
      inboxId: "inbox-1",
      sourceId: "source-1",
    })
    mocks.messengerFindByInboxIdForWorkspace.mockResolvedValueOnce({
      id: "messenger-1",
      auth: { accessToken: "tok" },
    })
    mocks.messengerRunChannelHandler.mockResolvedValueOnce({
      firstName: "Jane",
      lastName: "Doe",
    })

    await expect(callAction({})).resolves.toEqual({
      status: "updated",
      contact: { id: "contact-1", firstName: "Jane", lastName: "Doe" },
    })
  })
})

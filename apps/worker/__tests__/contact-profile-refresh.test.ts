import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// apps/worker/src/integration/handlers/contact-profile-refresh.ts — the
// eligibility predicate, the fetcher strategy table, and the best-effort
// executor that runs right after an inbound message is persisted (Task 2 of
// .superpowers/sdd/2026-08-31-messenger-ctm-profile-backfill).
//
// The business rules (capability table, cooldown, apply+avatar compensation)
// live in `@chatbotx.io/business/contact/profile-refresh` and are already
// unit-tested in `packages/business/__tests__/contact-profile-refresh.test.ts`
// (Task 1). This file only tests the WORKER's own wiring: rule composition,
// fetcher selection per source, and the never-throws contract around
// `contactProfileRefreshService.refresh`.
// ---------------------------------------------------------------------------

const mockContactProfileRefresh = vi.fn()
const mockResolveIntegrationContextFromContactInbox = vi.fn()
const mockLoggerWarn = vi.fn()
const mockLoggerDebug = vi.fn()

// Real capability table + predicates (packages/business/src/contact/profile-refresh/rules.ts)
// — only `contactProfileRefreshService.refresh` (the redis/db-touching part,
// covered on its own in packages/business/__tests__/contact-profile-refresh.test.ts)
// is mocked here, so this file can't drift from the real capability table.
vi.mock("@chatbotx.io/business", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/business")>()
  return {
    ...actual,
    contactProfileRefreshService: { refresh: mockContactProfileRefresh },
  }
})

vi.mock("../src/services/integrations", () => ({
  resolveIntegrationContextFromContactInbox:
    mockResolveIntegrationContextFromContactInbox,
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: mockLoggerWarn,
    debug: mockLoggerDebug,
    info: vi.fn(),
    error: vi.fn(),
  },
}))

const { shouldRefreshContactProfile, refreshExistingContactProfile } =
  await import("../src/integration/handlers/contact-profile-refresh")

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const namelessContact = { firstName: null, lastName: null }

const inboundTextMessage = {
  sourceId: "msg-1",
  messageType: "incoming" as const,
  text: "hi",
  contentType: "text" as const,
}

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

beforeEach(() => {
  vi.clearAllMocks()
  // Default: mirror `contactProfileRefreshService.refresh`'s fetch step
  // closely enough to exercise the worker's fetcher wiring (which source
  // was selected, what args it was called with) without re-testing Task 1's
  // owned cooldown/skip business rules.
  mockContactProfileRefresh.mockImplementation(async (input) => {
    try {
      const profile = await input.fetchProfile()
      return profile
        ? { status: "updated", contact: { id: input.contactId } }
        : { status: "unavailable" }
    } catch {
      return { status: "failed" }
    }
  })
  mockResolveIntegrationContextFromContactInbox.mockResolvedValue({
    integration: {
      runChannelHandler: vi.fn().mockResolvedValue(fakeIncomingContact),
    },
    ctx: { workspaceId: "ws-1" },
  })
})

// ---------------------------------------------------------------------------
// shouldRefreshContactProfile — per-rule coverage
// ---------------------------------------------------------------------------

describe("shouldRefreshContactProfile", () => {
  test("all three rules pass → true", () => {
    expect(
      shouldRefreshContactProfile({
        channel: "messenger",
        incomingMessage: inboundTextMessage,
        contact: namelessContact,
      }),
    ).toBe(true)
  })

  test("rule 1 (capability): channel with inbound: null → false", () => {
    expect(
      shouldRefreshContactProfile({
        channel: "webchat",
        incomingMessage: inboundTextMessage,
        contact: namelessContact,
      }),
    ).toBe(false)
  })

  test("rule 2 (inbound-only): outgoing echo → false", () => {
    expect(
      shouldRefreshContactProfile({
        channel: "messenger",
        incomingMessage: { ...inboundTextMessage, messageType: "outgoing" },
        contact: namelessContact,
      }),
    ).toBe(false)
  })

  test("rule 2 (inbound-only): activity-typed message (e.g. a reaction) → false", () => {
    expect(
      shouldRefreshContactProfile({
        channel: "messenger",
        incomingMessage: { ...inboundTextMessage, type: "activity" },
        contact: namelessContact,
      }),
    ).toBe(false)
  })

  test("rule 3 (name presence): firstName-only contact → false", () => {
    expect(
      shouldRefreshContactProfile({
        channel: "messenger",
        incomingMessage: inboundTextMessage,
        contact: { firstName: "Jane", lastName: null },
      }),
    ).toBe(false)
  })

  test("rule 3 (name presence): lastName-only contact → false", () => {
    expect(
      shouldRefreshContactProfile({
        channel: "messenger",
        incomingMessage: inboundTextMessage,
        contact: { firstName: null, lastName: "Doe" },
      }),
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// refreshExistingContactProfile
// ---------------------------------------------------------------------------

describe("refreshExistingContactProfile", () => {
  test("channelApi source: lazily resolves the integration and calls getProfile with the contactInbox's sourceId", async () => {
    await refreshExistingContactProfile({
      inbox: fakeInbox,
      contactInbox: fakeContactInbox,
      incomingContact: fakeIncomingContact,
      contactId: "contact-1",
    })

    expect(mockResolveIntegrationContextFromContactInbox).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInbox: fakeContactInbox,
    })
    const { integration } =
      await mockResolveIntegrationContextFromContactInbox.mock.results[0].value
    expect(integration.runChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getProfile",
      {
        ctx: { workspaceId: "ws-1" },
        data: { sourceId: "psid-123" },
      },
    )
    expect(mockContactProfileRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactInbox: fakeContactInbox,
        source: "channelApi",
        fetchProfile: expect.any(Function),
      }),
    )
  })

  test("payload source: applies the already-parsed IncomingContact directly, no integration resolution and no Graph call", async () => {
    const whatsappInbox = { ...fakeInbox, channel: "whatsapp" }
    const whatsappContactInbox = { ...fakeContactInbox, channel: "whatsapp" }

    await refreshExistingContactProfile({
      inbox: whatsappInbox as typeof fakeInbox,
      contactInbox: whatsappContactInbox as typeof fakeContactInbox,
      incomingContact: fakeIncomingContact,
      contactId: "contact-1",
    })

    expect(mockResolveIntegrationContextFromContactInbox).not.toHaveBeenCalled()
    expect(mockContactProfileRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ source: "payload" }),
    )
    const call = mockContactProfileRefresh.mock.calls[0]?.[0] as {
      fetchProfile: () => Promise<unknown>
    }
    await expect(call.fetchProfile()).resolves.toBe(fakeIncomingContact)
  })

  test("channel with no inbound source (e.g. webchat) → the service is never called", async () => {
    const webchatInbox = { ...fakeInbox, channel: "webchat" }

    await refreshExistingContactProfile({
      inbox: webchatInbox as typeof fakeInbox,
      contactInbox: {
        ...fakeContactInbox,
        channel: "webchat",
      } as typeof fakeContactInbox,
      incomingContact: fakeIncomingContact,
      contactId: "contact-1",
    })

    expect(mockContactProfileRefresh).not.toHaveBeenCalled()
    expect(mockResolveIntegrationContextFromContactInbox).not.toHaveBeenCalled()
  })

  test("resolveIntegrationContextFromContactInbox throws (missing/disconnected integration) → never throws, logged at debug", async () => {
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

    expect(mockLoggerDebug).toHaveBeenCalledWith(
      expect.objectContaining({ result: { status: "failed" } }),
      expect.any(String),
    )
  })

  test("contactProfileRefreshService.refresh throws unexpectedly → never throws, logger.warn called", async () => {
    mockContactProfileRefresh.mockRejectedValue(new Error("boom"))

    await expect(
      refreshExistingContactProfile({
        inbox: fakeInbox,
        contactInbox: fakeContactInbox,
        incomingContact: fakeIncomingContact,
        contactId: "contact-1",
      }),
    ).resolves.toBeUndefined()

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(Error),
        contactId: "contact-1",
        channel: "messenger",
      }),
      expect.any(String),
    )
  })

  test("successful refresh is logged at debug with the service result", async () => {
    await refreshExistingContactProfile({
      inbox: fakeInbox,
      contactInbox: fakeContactInbox,
      incomingContact: fakeIncomingContact,
      contactId: "contact-1",
    })

    expect(mockLoggerDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        result: { status: "updated", contact: { id: "contact-1" } },
        contactId: "contact-1",
        channel: "messenger",
      }),
      expect.any(String),
    )
  })
})

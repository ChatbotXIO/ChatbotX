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

const { getProfileRefreshSource, refreshExistingContactProfile } = await import(
  "../src/integration/handlers/contact-profile-refresh"
)

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
// getProfileRefreshSource — per-rule coverage
// ---------------------------------------------------------------------------

describe("getProfileRefreshSource", () => {
  test("all three rules pass → the resolved source", () => {
    expect(
      getProfileRefreshSource({
        channel: "messenger",
        incomingMessage: inboundTextMessage,
        contact: namelessContact,
      }),
    ).toBe("channelApi")
  })

  test("rule 1 (capability): channel with inbound: null → null", () => {
    expect(
      getProfileRefreshSource({
        channel: "webchat",
        incomingMessage: inboundTextMessage,
        contact: namelessContact,
      }),
    ).toBeNull()
  })

  test("rule 2 (inbound-only): outgoing echo → null", () => {
    expect(
      getProfileRefreshSource({
        channel: "messenger",
        incomingMessage: { ...inboundTextMessage, messageType: "outgoing" },
        contact: namelessContact,
      }),
    ).toBeNull()
  })

  test("rule 2 (inbound-only): activity-typed message (e.g. a reaction) → null", () => {
    expect(
      getProfileRefreshSource({
        channel: "messenger",
        incomingMessage: { ...inboundTextMessage, type: "activity" },
        contact: namelessContact,
      }),
    ).toBeNull()
  })

  test("rule 3 (name presence): firstName-only contact → null", () => {
    expect(
      getProfileRefreshSource({
        channel: "messenger",
        incomingMessage: inboundTextMessage,
        contact: { firstName: "Jane", lastName: null },
      }),
    ).toBeNull()
  })

  test("rule 3 (name presence): lastName-only contact → null", () => {
    expect(
      getProfileRefreshSource({
        channel: "messenger",
        incomingMessage: inboundTextMessage,
        contact: { firstName: null, lastName: "Doe" },
      }),
    ).toBeNull()
  })

  // `vi.mock("@chatbotx.io/business", async (importOriginal) => ...)` above
  // is the REAL rules.ts, so this exercises the actual capability-table
  // null-safety fix, not a mirror.
  test("rule 1 (capability): unknown/legacy channel string → null, never throws", () => {
    expect(() =>
      getProfileRefreshSource({
        channel: "legacy" as never,
        incomingMessage: inboundTextMessage,
        contact: namelessContact,
      }),
    ).not.toThrow()
    expect(
      getProfileRefreshSource({
        channel: "legacy" as never,
        incomingMessage: inboundTextMessage,
        contact: namelessContact,
      }),
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// refreshExistingContactProfile
// ---------------------------------------------------------------------------

describe("refreshExistingContactProfile", () => {
  test("channelApi source: lazily resolves the integration and calls getProfile with the contactInbox's sourceId", async () => {
    await refreshExistingContactProfile({
      source: "channelApi",
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
      source: "payload",
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
    // Picked to a new object (name-related fields only) — not the same
    // reference as `fakeIncomingContact` — but equal in value here since
    // this fixture only carries name-related fields to begin with.
    await expect(call.fetchProfile()).resolves.toEqual(fakeIncomingContact)
  })

  test("payload source: strips locale/timezone/gender from the fetched profile, keeps name and avatar", async () => {
    const apiInbox = { ...fakeInbox, channel: "api" }
    const apiContactInbox = { ...fakeContactInbox, channel: "api" }
    const rawIncomingContact = {
      sourceId: "psid-123",
      firstName: "Jane",
      lastName: "Doe",
      avatar: "public/space/ws-1/avatars/new",
      // Carried on the webhook payload but must never overwrite the
      // normalized values `finalizeContactProfile` already wrote at
      // contact-creation time.
      locale: "en_US",
      timezone: "+07:00",
      gender: "female",
    }

    await refreshExistingContactProfile({
      source: "payload",
      inbox: apiInbox as typeof fakeInbox,
      contactInbox: apiContactInbox as typeof fakeContactInbox,
      incomingContact: rawIncomingContact,
      contactId: "contact-1",
    })

    const call = mockContactProfileRefresh.mock.calls[0]?.[0] as {
      fetchProfile: () => Promise<unknown>
    }
    await expect(call.fetchProfile()).resolves.toEqual({
      sourceId: "psid-123",
      firstName: "Jane",
      lastName: "Doe",
      avatar: "public/space/ws-1/avatars/new",
    })
  })

  test("resolveIntegrationContextFromContactInbox throws (missing/disconnected integration) → never throws, logged at debug", async () => {
    mockResolveIntegrationContextFromContactInbox.mockRejectedValue(
      new Error("integration not found"),
    )

    await expect(
      refreshExistingContactProfile({
        source: "channelApi",
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
        source: "channelApi",
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
      source: "channelApi",
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

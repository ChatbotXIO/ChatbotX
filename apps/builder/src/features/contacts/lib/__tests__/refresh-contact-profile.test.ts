import { beforeEach, describe, expect, test, vi } from "vitest"

// refreshContactProfile: authorization (findByIdOrFail) gates everything
// else; a missing ContactInbox 404s; otherwise it resolves the channel's
// fetcher factory lazily and forwards whatever
// `contactProfileRefreshService.refresh` decides — including the
// `channelNotCapable` skip, which the service itself now owns.

const mocks = vi.hoisted(() => ({
  findByIdOrFail: vi.fn(),
  findContactInboxByUncached: vi.fn(),
  refresh: vi.fn(),
  fetcherFactory: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactService: { findByIdOrFail: mocks.findByIdOrFail },
  contactInboxService: { findByUncached: mocks.findContactInboxByUncached },
  contactProfileRefreshService: { refresh: mocks.refresh },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("../profile-fetcher-factories", () => ({
  profileFetcherFactories: {
    messenger: (...args: unknown[]) => mocks.fetcherFactory(...args),
  },
}))

const { refreshContactProfile } = await import("../refresh-contact-profile")

const WORKSPACE_ID = "ws-1"
const CONTACT_ID = "contact-1"
const CONTACT_INBOX_ID = "ci-1"

describe("refreshContactProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("throws before any inbox/channel work when the contact is out of scope", async () => {
    mocks.findByIdOrFail.mockRejectedValueOnce(new Error("Contact not found"))

    await expect(
      refreshContactProfile({
        workspaceId: WORKSPACE_ID,
        contactId: CONTACT_ID,
        contactInboxId: CONTACT_INBOX_ID,
      }),
    ).rejects.toThrow("Contact not found")

    expect(mocks.findContactInboxByUncached).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  test("throws when the contact inbox does not exist", async () => {
    mocks.findByIdOrFail.mockResolvedValueOnce({ id: CONTACT_ID })
    mocks.findContactInboxByUncached.mockResolvedValueOnce(undefined)

    await expect(
      refreshContactProfile({
        workspaceId: WORKSPACE_ID,
        contactId: CONTACT_ID,
        contactInboxId: CONTACT_INBOX_ID,
      }),
    ).rejects.toThrow("Contact inbox not found")

    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  test("forwards the service's channelNotCapable skip for a non-capable channel without ever invoking a fetcher factory", async () => {
    mocks.findByIdOrFail.mockResolvedValueOnce({ id: CONTACT_ID })
    mocks.findContactInboxByUncached.mockResolvedValueOnce({
      id: CONTACT_INBOX_ID,
      contactId: CONTACT_ID,
      channel: "webchat",
      inboxId: "inbox-1",
      sourceId: "source-1",
      language: "en",
    })
    mocks.refresh.mockResolvedValueOnce({
      status: "skipped",
      reason: "channelNotCapable",
    })

    const result = await refreshContactProfile({
      workspaceId: WORKSPACE_ID,
      contactId: CONTACT_ID,
      contactInboxId: CONTACT_INBOX_ID,
    })

    expect(result).toEqual({ status: "skipped", reason: "channelNotCapable" })
    expect(mocks.fetcherFactory).not.toHaveBeenCalled()
  })

  test("refreshes via the resolved channel fetcher and forwards the service result", async () => {
    mocks.findByIdOrFail.mockResolvedValueOnce({ id: CONTACT_ID })
    mocks.findContactInboxByUncached.mockResolvedValueOnce({
      id: CONTACT_INBOX_ID,
      contactId: CONTACT_ID,
      channel: "messenger",
      inboxId: "inbox-1",
      sourceId: "source-1",
      language: "en",
    })
    const fetchProfile = vi.fn()
    mocks.fetcherFactory.mockReturnValueOnce(fetchProfile)
    const updatedContact = { id: CONTACT_ID, firstName: "Ada" }
    mocks.refresh.mockResolvedValueOnce({
      status: "updated",
      contact: updatedContact,
    })

    const result = await refreshContactProfile({
      workspaceId: WORKSPACE_ID,
      contactId: CONTACT_ID,
      contactInboxId: CONTACT_INBOX_ID,
    })

    expect(mocks.refresh).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        contactId: CONTACT_ID,
        source: "channelApi",
        accessScope: undefined,
      }),
    )

    // The fetcher factory is only invoked lazily, when the service's
    // `fetchProfile` callback is actually called.
    const call = mocks.refresh.mock.calls[0]?.[0]
    expect(mocks.fetcherFactory).not.toHaveBeenCalled()
    await call.fetchProfile()
    expect(mocks.fetcherFactory).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      inboxId: "inbox-1",
      sourceId: "source-1",
    })

    expect(result).toEqual({ status: "updated", contact: updatedContact })
  })

  test("threads accessScope through to the profile refresh service", async () => {
    mocks.findByIdOrFail.mockResolvedValueOnce({ id: CONTACT_ID })
    mocks.findContactInboxByUncached.mockResolvedValueOnce({
      id: CONTACT_INBOX_ID,
      contactId: CONTACT_ID,
      channel: "messenger",
      inboxId: "inbox-1",
      sourceId: "source-1",
      language: "en",
    })
    mocks.fetcherFactory.mockReturnValueOnce(vi.fn())
    mocks.refresh.mockResolvedValueOnce({ status: "unavailable" })
    const accessScope = { restrictToAssignedUserId: "user-1" }

    const result = await refreshContactProfile({
      workspaceId: WORKSPACE_ID,
      contactId: CONTACT_ID,
      contactInboxId: CONTACT_INBOX_ID,
      accessScope,
    })

    expect(mocks.findByIdOrFail).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: CONTACT_ID,
      accessScope,
    })
    expect(mocks.refresh).toHaveBeenCalledWith(
      expect.objectContaining({ accessScope }),
    )
    expect(result).toEqual({ status: "unavailable" })
  })
})

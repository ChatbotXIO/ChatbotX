import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  upsertForContactInbox: vi.fn(),
  findByContactInboxId: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallPermissionRepository: {
    upsertForContactInbox: mocks.upsertForContactInbox,
    findByContactInboxId: mocks.findByContactInboxId,
  },
}))

const { callPermissionStatuses, whatsappCallPermissionService } = await import(
  "../src/whatsapp-call/call-permission-service"
)

const NOW = new Date("2026-09-16T10:00:00.000Z")
const RESPONDED_AT = new Date("2026-09-16T09:00:00.000Z")

const permission = (overrides: Record<string, unknown> = {}) => ({
  contactInboxId: "ci-1",
  workspaceId: "ws-1",
  response: "accept",
  isPermanent: false,
  expiresAt: null,
  respondedAt: RESPONDED_AT,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.upsertForContactInbox.mockResolvedValue(undefined)
})

describe("whatsappCallPermissionService.recordReply", () => {
  test("converts Meta's expiration timestamp (Unix seconds) to a date", async () => {
    await whatsappCallPermissionService.recordReply({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      response: "accept",
      isPermanent: false,
      expirationTimestamp: 1_789_000_000,
      respondedAt: RESPONDED_AT,
    })

    expect(mocks.upsertForContactInbox).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      response: "accept",
      isPermanent: false,
      expiresAt: new Date(1_789_000_000 * 1000),
      respondedAt: RESPONDED_AT,
    })
  })

  test.each([
    ["missing", undefined],
    ["null", null],
  ])("stores no expiry when the timestamp is %s", async (_, expirationTimestamp) => {
    await whatsappCallPermissionService.recordReply({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      response: "reject",
      isPermanent: false,
      expirationTimestamp,
      respondedAt: RESPONDED_AT,
    })

    expect(mocks.upsertForContactInbox).toHaveBeenCalledWith(
      expect.objectContaining({ response: "reject", expiresAt: null }),
    )
  })
})

describe("whatsappCallPermissionService.recordPermanentGrant", () => {
  test("stores an accepted, permanent, non-expiring grant", async () => {
    await whatsappCallPermissionService.recordPermanentGrant({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      grantedAt: RESPONDED_AT,
    })

    expect(mocks.upsertForContactInbox).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      response: "accept",
      isPermanent: true,
      expiresAt: null,
      respondedAt: RESPONDED_AT,
    })
  })
})

describe("whatsappCallPermissionService.resolveStatus", () => {
  test("is undefined when the contact never replied", async () => {
    mocks.findByContactInboxId.mockResolvedValue(undefined)

    await expect(
      whatsappCallPermissionService.resolveStatus("ci-1", NOW),
    ).resolves.toBeUndefined()
    expect(mocks.findByContactInboxId).toHaveBeenCalledWith("ci-1")
  })

  test.each([
    [
      "a rejection, even one flagged permanent",
      { response: "reject", isPermanent: true },
      callPermissionStatuses.noPermission,
    ],
    [
      "a permanent acceptance",
      { isPermanent: true },
      callPermissionStatuses.permanent,
    ],
    [
      "a temporary acceptance that has not expired",
      { expiresAt: new Date(NOW.getTime() + 60_000) },
      callPermissionStatuses.temporary,
    ],
    [
      "a temporary acceptance expiring exactly now",
      { expiresAt: NOW },
      callPermissionStatuses.noPermission,
    ],
    [
      "an expired temporary acceptance",
      { expiresAt: new Date(NOW.getTime() - 60_000) },
      callPermissionStatuses.noPermission,
    ],
    [
      "an acceptance with no expiry and no permanence",
      {},
      callPermissionStatuses.noPermission,
    ],
  ])("resolves %s", async (_, overrides, expected) => {
    mocks.findByContactInboxId.mockResolvedValue(permission(overrides))

    await expect(
      whatsappCallPermissionService.resolveStatus("ci-1", NOW),
    ).resolves.toBe(expected)
  })
})

describe("whatsappCallPermissionService.mirrorProviderGrant", () => {
  test("mirrors a permanent grant with no expiry", async () => {
    await expect(
      whatsappCallPermissionService.mirrorProviderGrant({
        workspaceId: "ws-1",
        contactInboxId: "ci-1",
        status: callPermissionStatuses.permanent,
        observedAt: NOW,
      }),
    ).resolves.toBe(true)

    expect(mocks.upsertForContactInbox).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      response: "accept",
      isPermanent: true,
      expiresAt: null,
      respondedAt: NOW,
    })
  })

  test("mirrors a temporary grant with the provider's expiry", async () => {
    await expect(
      whatsappCallPermissionService.mirrorProviderGrant({
        workspaceId: "ws-1",
        contactInboxId: "ci-1",
        status: callPermissionStatuses.temporary,
        expirationTimestamp: 1_789_000_000,
        observedAt: NOW,
      }),
    ).resolves.toBe(true)

    expect(mocks.upsertForContactInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        isPermanent: false,
        expiresAt: new Date(1_789_000_000 * 1000),
      }),
    )
  })

  // Writing this would give the record an answer for every contact and
  // permanently silence the provider lookup that feeds it.
  test("never writes a negative — no_permission is not mirrored", async () => {
    await expect(
      whatsappCallPermissionService.mirrorProviderGrant({
        workspaceId: "ws-1",
        contactInboxId: "ci-1",
        status: callPermissionStatuses.noPermission,
        observedAt: NOW,
      }),
    ).resolves.toBe(false)

    expect(mocks.upsertForContactInbox).not.toHaveBeenCalled()
  })

  // Without an expiry `resolveStatus` reads the row back as noPermission —
  // the exact negative the rule above refuses to write.
  test("skips a temporary grant the provider gave no expiry for", async () => {
    await expect(
      whatsappCallPermissionService.mirrorProviderGrant({
        workspaceId: "ws-1",
        contactInboxId: "ci-1",
        status: callPermissionStatuses.temporary,
        observedAt: NOW,
      }),
    ).resolves.toBe(false)

    expect(mocks.upsertForContactInbox).not.toHaveBeenCalled()
  })

  test("a mirrored grant reads back as the status it came from", async () => {
    mocks.findByContactInboxId.mockResolvedValue(
      permission({
        isPermanent: false,
        expiresAt: new Date(NOW.getTime() + 60_000),
        respondedAt: NOW,
      }),
    )

    await expect(
      whatsappCallPermissionService.resolveStatus("ci-1", NOW),
    ).resolves.toBe(callPermissionStatuses.temporary)
  })
})

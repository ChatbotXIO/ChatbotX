import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByIdForWorkspace: vi.fn(),
  findByInboxIdForWorkspace: vi.fn(),
  updateRoutingRolesIfNewer: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    findByInboxIdForWorkspace: mocks.findByInboxIdForWorkspace,
    updateRoutingRolesIfNewer: mocks.updateRoutingRolesIfNewer,
  },
  whatsappSignupSessionRepository: {},
  metaCapiEventRepository: {},
  LIVE_RUN_STATUSES: [],
}))

const { integrationWhatsappService } = await import(
  "../src/integration-whatsapp/service"
)

const target = { id: "iw-1", workspaceId: "ws-1" }
const auth = { tokens: { accessToken: "tok" }, version: "v23.0" }
const now = new Date("2026-11-08T05:00:00.000Z")
const answer = { enabled: true, roles: ["escalation"], isStandby: true }

describe("integrationWhatsappService routing roles", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByIdForWorkspace.mockResolvedValue({
      id: "iw-1",
      auth,
      phoneNumberId: "pn-1",
    })
    mocks.updateRoutingRolesIfNewer.mockResolvedValue({ id: "iw-1" })
  })

  test("asks the channel with the number's token and stores the stamped answer", async () => {
    const fetchRoutingRoles = vi.fn().mockResolvedValue(answer)
    const snapshot = await integrationWhatsappService.syncRoutingRoles({
      ...target,
      fetchRoutingRoles,
      now,
    })
    expect(fetchRoutingRoles).toHaveBeenCalledWith({
      accessToken: "tok",
      version: "v23.0",
      phoneNumberId: "pn-1",
    })
    expect(snapshot).toEqual({ ...answer, checkedAt: now.toISOString() })
    expect(mocks.updateRoutingRolesIfNewer).toHaveBeenCalledWith({
      ...target,
      routingRoles: snapshot,
    })
  })

  test("a number of another workspace is not found and Meta is never asked", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(null)
    const fetchRoutingRoles = vi.fn()
    await expect(
      integrationWhatsappService.syncRoutingRoles({
        ...target,
        fetchRoutingRoles,
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(fetchRoutingRoles).not.toHaveBeenCalled()
  })

  test("a provider failure stores nothing", async () => {
    const fetchRoutingRoles = vi.fn().mockRejectedValue(new Error("Meta down"))
    await expect(
      integrationWhatsappService.syncRoutingRoles({
        ...target,
        fetchRoutingRoles,
      }),
    ).rejects.toThrow("Meta down")
    expect(mocks.updateRoutingRolesIfNewer).not.toHaveBeenCalled()
  })

  test("disconnected while Meta answered: not found, never a false success", async () => {
    mocks.updateRoutingRolesIfNewer.mockResolvedValue(null)
    mocks.findByIdForWorkspace
      .mockResolvedValueOnce({ id: "iw-1", auth, phoneNumberId: "pn-1" })
      .mockResolvedValueOnce(null)
    await expect(
      integrationWhatsappService.syncRoutingRoles({
        ...target,
        fetchRoutingRoles: vi.fn().mockResolvedValue(answer),
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("a sync answered after a newer one keeps the newer answer and returns it", async () => {
    const newer = {
      enabled: true,
      roles: ["customer_service"],
      isStandby: false,
      checkedAt: new Date(now.getTime() + 60_000).toISOString(),
    }
    mocks.updateRoutingRolesIfNewer.mockResolvedValue(null)
    mocks.findByIdForWorkspace
      .mockResolvedValueOnce({ id: "iw-1", auth, phoneNumberId: "pn-1" })
      .mockResolvedValueOnce({ id: "iw-1", routingRoles: newer })
    await expect(
      integrationWhatsappService.syncRoutingRoles({
        ...target,
        fetchRoutingRoles: vi.fn().mockResolvedValue(answer),
        now,
      }),
    ).resolves.toEqual(newer)
    // Stamped when the lookup started, so the guard compares start times.
    expect(mocks.updateRoutingRolesIfNewer).toHaveBeenCalledWith({
      ...target,
      routingRoles: { ...answer, checkedAt: now.toISOString() },
    })
  })

  test("reads a stored snapshot, and treats a malformed one as never checked", async () => {
    const stored = { ...answer, checkedAt: now.toISOString() }
    mocks.findByInboxIdForWorkspace.mockResolvedValue({ routingRoles: stored })
    await expect(
      integrationWhatsappService.findRoutingRolesByInbox({
        inboxId: "in-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual(stored)
    expect(mocks.findByInboxIdForWorkspace).toHaveBeenCalledWith({
      inboxId: "in-1",
      workspaceId: "ws-1",
    })

    mocks.findByInboxIdForWorkspace.mockResolvedValue({
      routingRoles: { roles: "escalation" },
    })
    await expect(
      integrationWhatsappService.findRoutingRolesByInbox({
        inboxId: "in-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeNull()

    mocks.findByInboxIdForWorkspace.mockResolvedValue(null)
    await expect(
      integrationWhatsappService.findRoutingRolesByInbox({
        inboxId: "in-foreign",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeNull()
  })
})

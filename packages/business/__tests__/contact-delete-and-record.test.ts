// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockDispatchAuditRecord = vi.fn()
const mockEmit = vi.fn()

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: (...args: unknown[]) => mockDispatchAuditRecord(...args),
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: (...args: unknown[]) => mockEmit(...args),
}))

const { contactInboxRepository } = await import(
  "@chatbotx.io/database/repositories"
)
const { contactService } = await import("../src/contact/service")

const dashboardEvents = () =>
  mockEmit.mock.calls
    .filter(([type]) => type === "analytics:dashboard")
    .map(([, payload]) => payload as Record<string, unknown>)

describe("contactService.deleteAndRecord", () => {
  test("emits one delete audit row listing every deleted contact", async () => {
    vi.spyOn(contactService, "delete").mockResolvedValue([
      { id: "contact-1", contactInboxes: [] },
      { id: "contact-2", contactInboxes: [] },
    ] as never)

    await contactService.deleteAndRecord({
      workspaceId: "ws-1",
      ids: ["contact-1", "contact-2"],
      triggerSource: "api",
    })

    expect(mockDispatchAuditRecord).toHaveBeenCalledTimes(1)
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "delete",
      detail: "deleted contacts (#contact-1, #contact-2)",
    })
  })

  test("uses singular wording for a single deleted contact", async () => {
    vi.spyOn(contactService, "delete").mockResolvedValue([
      { id: "contact-1", contactInboxes: [] },
    ] as never)

    await contactService.deleteAndRecord({
      workspaceId: "ws-1",
      ids: ["contact-1"],
      triggerSource: "api",
    })

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "delete",
      detail: "deleted contact (#contact-1)",
    })
  })

  test("emits no audit row when nothing was deleted", async () => {
    vi.spyOn(contactService, "delete").mockResolvedValue([] as never)

    await contactService.deleteAndRecord({
      workspaceId: "ws-1",
      ids: ["missing"],
      triggerSource: "api",
    })

    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })
})

describe("contactService analytics attribution", () => {
  beforeEach(() => {
    mockEmit.mockClear()
    vi.restoreAllMocks()
  })

  const inboxRow = (inboxId: string, channel: string) => ({
    inboxId,
    channel,
    source: channel,
    sourceId: `${channel}-sid`,
  })

  test("deleteAndRecord stamps each deleted contact event with the inbox it lived on", async () => {
    vi.spyOn(contactService, "delete").mockResolvedValue([
      {
        id: "contact-1",
        contactInboxes: [inboxRow("7", "messenger"), inboxRow("8", "whatsapp")],
      },
    ] as never)

    await contactService.deleteAndRecord({
      workspaceId: "ws-1",
      ids: ["contact-1"],
      triggerSource: "api",
    })

    expect(dashboardEvents()).toEqual([
      expect.objectContaining({
        eventType: "contact:deleted",
        contactId: "contact-1",
        channel: "messenger",
        inboxId: "7",
      }),
      expect.objectContaining({
        eventType: "contact:deleted",
        channel: "whatsapp",
        inboxId: "8",
      }),
    ])
  })

  test("blockAndRecord emits one blocked event per inbox of the contact", async () => {
    vi.spyOn(contactService, "block").mockResolvedValue({
      id: "contact-1",
      blockedAt: new Date("2026-10-01T00:00:00Z"),
      country: null,
    } as never)
    const lookup = vi
      .spyOn(contactInboxRepository, "listAnalyticsAttributionByContact")
      .mockResolvedValue([
        inboxRow("7", "messenger"),
        inboxRow("8", "whatsapp"),
      ])

    await contactService.blockAndRecord({
      workspaceId: "ws-1",
      id: "contact-1",
    })

    expect(lookup).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
    })
    expect(dashboardEvents()).toEqual([
      expect.objectContaining({
        eventType: "contact:blocked",
        contactId: "contact-1",
        channel: "messenger",
        inboxId: "7",
        occurredAt: new Date("2026-10-01T00:00:00Z"),
      }),
      expect.objectContaining({
        eventType: "contact:blocked",
        contactId: "contact-1",
        channel: "whatsapp",
        inboxId: "8",
      }),
    ])
  })

  test("a failed inbox lookup never fails the committed block: one unattributed event is still recorded", async () => {
    vi.spyOn(contactService, "block").mockResolvedValue({
      id: "contact-1",
      blockedAt: new Date("2026-10-01T00:00:00Z"),
      country: null,
    } as never)
    vi.spyOn(
      contactInboxRepository,
      "listAnalyticsAttributionByContact",
    ).mockRejectedValue(new Error("pool timeout"))

    await expect(
      contactService.blockAndRecord({ workspaceId: "ws-1", id: "contact-1" }),
    ).resolves.toBeUndefined()

    const events = dashboardEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventType: "contact:blocked",
      contactId: "contact-1",
      channel: null,
      inboxId: null,
    })
  })

  test("blockAndRecord for a contact without inboxes still records one unattributed event", async () => {
    vi.spyOn(contactService, "block").mockResolvedValue({
      id: "contact-1",
      blockedAt: null,
      country: "VN",
    } as never)
    vi.spyOn(
      contactInboxRepository,
      "listAnalyticsAttributionByContact",
    ).mockResolvedValue([])

    await contactService.blockAndRecord({
      workspaceId: "ws-1",
      id: "contact-1",
    })

    const events = dashboardEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventType: "contact:blocked",
      contactId: "contact-1",
      channel: null,
      inboxId: null,
      country: "VN",
    })
  })
})

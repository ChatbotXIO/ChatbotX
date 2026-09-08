// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

const mockDispatchAuditRecord = vi.fn()
const mockEmit = vi.fn()

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: (...args: unknown[]) => mockDispatchAuditRecord(...args),
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: (...args: unknown[]) => mockEmit(...args),
}))

const { contactService } = await import("../src/contact/service")

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

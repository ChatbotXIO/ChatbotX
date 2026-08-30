import { beforeEach, describe, expect, test, vi } from "vitest"

const mockDelete = vi.fn()
const mockEmit = vi.fn()
const mockRecordAuditLog = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactService: { delete: (...args: unknown[]) => mockDelete(...args) },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: (...args: unknown[]) => mockRecordAuditLog(...args) },
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: (...args: unknown[]) => mockEmit(...args),
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

vi.mock("../src/features/contacts/permissions", () => ({
  requireContactPermissionScope: vi.fn(),
}))

vi.mock("../src/features/contacts/schema/contact-delete", () => ({
  deleteContactRequest: {},
}))

const { deleteContact } = await import(
  "../src/features/contacts/actions/delete-contact.action"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("deleteContact", () => {
  test("emits one delete audit row listing every deleted contact", async () => {
    mockDelete.mockResolvedValue([
      { id: "contact-1", contactInboxes: [] },
      { id: "contact-2", contactInboxes: [] },
    ])

    await deleteContact({
      workspaceId: "ws-1",
      ids: ["contact-1", "contact-2"],
    })

    expect(mockRecordAuditLog).toHaveBeenCalledTimes(1)
    expect(mockRecordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "delete",
      detail: "deleted contacts (#contact-1, #contact-2)",
    })
  })

  test("uses singular wording for a single deleted contact", async () => {
    mockDelete.mockResolvedValue([{ id: "contact-1", contactInboxes: [] }])

    await deleteContact({ workspaceId: "ws-1", ids: ["contact-1"] })

    expect(mockRecordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "delete",
      detail: "deleted contact (#contact-1)",
    })
  })

  test("emits no audit row when nothing was deleted", async () => {
    mockDelete.mockResolvedValue([])

    await deleteContact({ workspaceId: "ws-1", ids: ["missing"] })

    expect(mockRecordAuditLog).not.toHaveBeenCalled()
  })
})

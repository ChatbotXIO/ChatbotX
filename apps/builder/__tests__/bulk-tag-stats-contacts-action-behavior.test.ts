// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { BulkTagStatsContactsRequest } from "@/features/contacts/schemas/contact-tag"

type CapturedActionArgs = {
  ctx: { user: { id: string } }
  bindArgsParsedInputs: [string]
  parsedInput: BulkTagStatsContactsRequest
}

let mockActionHandler: ((args: CapturedActionArgs) => Promise<void>) | undefined

const mockActionChain = {
  bindArgsSchemas: vi.fn(),
  inputSchema: vi.fn(),
  action: vi.fn(),
}
mockActionChain.bindArgsSchemas.mockReturnValue(mockActionChain)
mockActionChain.inputSchema.mockReturnValue(mockActionChain)
mockActionChain.action.mockImplementation(
  (handler: (args: CapturedActionArgs) => Promise<void>) => {
    mockActionHandler = handler
    return { execute: handler }
  },
)

const mockQueueAdd = vi.fn(async (_name: unknown, _data: unknown) => undefined)
const mockUpsertByNames = vi.fn()
const mockRequireContactPermissionScope = vi.fn()

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: mockActionChain,
}))

vi.mock("@chatbotx.io/business", () => ({
  tagService: {
    upsertByNames: (...args: unknown[]) => mockUpsertByNames(...args),
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: {
    bulkTagContacts: "bulkTagContacts",
    sendAuditLog: "sendAuditLog",
  },
  defaultQueue: {
    add: (name: unknown, data: unknown) => mockQueueAdd(name, data),
  },
}))

vi.mock("@/features/contacts/permissions", () => ({
  requireContactPermissionScope: (...args: unknown[]) =>
    mockRequireContactPermissionScope(...args),
}))

await import("../src/features/contacts/actions/bulk-tag-stats-contacts.action")

const executeAction = async (parsedInput: BulkTagStatsContactsRequest) => {
  if (!mockActionHandler) {
    throw new Error("Action handler was not captured")
  }

  await mockActionHandler({
    ctx: { user: { id: "user-1" } },
    bindArgsParsedInputs: ["workspace-1"],
    parsedInput,
  })
}

describe("bulkTagStatsContactsAction", () => {
  beforeEach(() => {
    mockQueueAdd.mockClear()
    mockUpsertByNames.mockReset()
    mockRequireContactPermissionScope.mockReset()
    mockRequireContactPermissionScope.mockResolvedValue({})
    mockUpsertByNames.mockResolvedValue([{ id: "tag-1", name: "VIP" }])
  })

  test("enqueues a broadcast bulk tag job and audit log", async () => {
    await executeAction({
      source: "broadcast",
      broadcastId: "broadcast-1",
      eventType: "message:sent",
      excludedContactIds: ["contact-2"],
      tags: ["VIP"],
    })

    expect(mockUpsertByNames).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      names: ["VIP"],
    })
    expect(mockQueueAdd).toHaveBeenCalledWith("bulkTagContacts", {
      type: "bulkTagContacts",
      data: {
        workspaceId: "workspace-1",
        requestedUserId: "user-1",
        tagIds: ["tag-1"],
        excludedContactIds: ["contact-2"],
        source: "broadcast",
        broadcastId: "broadcast-1",
        eventType: "message:sent",
      },
    })
    expect(mockQueueAdd).toHaveBeenCalledWith("sendAuditLog", {
      type: "sendAuditLog",
      data: {
        userId: "user-1",
        workspaceId: "workspace-1",
        action: "update",
        detail: "Bulk tag contacts",
      },
    })
  })

  test("propagates assigned-contact scope for sequence step jobs", async () => {
    mockRequireContactPermissionScope.mockResolvedValue({
      restrictToAssignedUserId: "assignee-1",
    })

    await executeAction({
      source: "sequenceStep",
      sequenceId: "sequence-1",
      stepId: "step-1",
      eventType: "message:failed",
      excludedContactIds: [],
      tags: ["Needs review"],
    })

    expect(mockQueueAdd).toHaveBeenCalledWith("bulkTagContacts", {
      type: "bulkTagContacts",
      data: {
        workspaceId: "workspace-1",
        requestedUserId: "user-1",
        tagIds: ["tag-1"],
        excludedContactIds: [],
        restrictToAssignedUserId: "assignee-1",
        source: "sequenceStep",
        sequenceId: "sequence-1",
        stepId: "step-1",
        eventType: "message:failed",
      },
    })
  })

  test("does not enqueue when tag resolution returns no active tags", async () => {
    mockUpsertByNames.mockResolvedValue([])

    await executeAction({
      source: "broadcast",
      broadcastId: "broadcast-1",
      eventType: "message:sent",
      excludedContactIds: [],
      tags: ["VIP"],
    })

    expect(mockQueueAdd).not.toHaveBeenCalled()
  })
})

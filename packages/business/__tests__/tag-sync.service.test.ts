import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/worker-config before any module under test is imported.
// We expose:
//   - DefaultJobAction: a plain object mirroring the real const-enum values
//   - defaultQueue.add: a spy to capture all enqueue calls
// ---------------------------------------------------------------------------
const mockQueueAdd = vi.fn(async () => undefined)

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: {
    exportContacts: "exportContacts",
    sendAuditLog: "sendAuditLog",
    syncTag: "syncTag",
    syncChannelLabels: "syncChannelLabels",
  },
  defaultQueue: {
    add: mockQueueAdd,
  },
}))

// Import the module under test AFTER mocks are registered (dynamic import so
// Vitest's hoisting of vi.mock() takes effect before the module graph runs).
const { tagSyncService } = await import("../src/tag/sync.service")
const { DefaultJobAction } = await import("@chatbotx.io/worker-config")

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------
const WORKSPACE_ID = "ws-abc123"
const TAG_ID = "tag-xyz789"
const CONTACT_ID = "contact-def456"
const INTEGRATION_ID = "int-ghi012"

describe("TagSyncService — enqueue logic", () => {
  beforeEach(() => {
    mockQueueAdd.mockClear()
  })

  // -------------------------------------------------------------------------
  // enqueueCreate
  // -------------------------------------------------------------------------
  describe("enqueueCreate", () => {
    test("calls defaultQueue.add exactly once with syncTag job name and create payload", async () => {
      // Arrange
      const props = { workspaceId: WORKSPACE_ID, tagId: TAG_ID }

      // Act
      await tagSyncService.enqueueCreate(props)

      // Assert
      expect(mockQueueAdd).toHaveBeenCalledTimes(1)
      expect(mockQueueAdd).toHaveBeenCalledWith(DefaultJobAction.syncTag, {
        type: DefaultJobAction.syncTag,
        data: {
          action: "create",
          workspaceId: WORKSPACE_ID,
          tagId: TAG_ID,
        },
      })
    })

    test("does not enqueue to any other queue or call add more than once", async () => {
      await tagSyncService.enqueueCreate({
        workspaceId: WORKSPACE_ID,
        tagId: TAG_ID,
      })

      expect(mockQueueAdd).toHaveBeenCalledTimes(1)
      // Only the syncTag action is used — not syncChannelLabels or others
      const [calledWith] = mockQueueAdd.mock.calls[0] ?? []
      expect(calledWith).toBe(DefaultJobAction.syncTag)
      expect(calledWith).not.toBe(DefaultJobAction.syncChannelLabels)
    })

    test("propagates the exact workspaceId and tagId without mutation", async () => {
      const workspaceId = "ws-unique-1"
      const tagId = "tag-unique-1"

      await tagSyncService.enqueueCreate({ workspaceId, tagId })

      const payload = mockQueueAdd.mock.calls[0]?.[1] as Record<string, unknown>
      const data = payload?.data as Record<string, unknown>
      expect(data.workspaceId).toBe(workspaceId)
      expect(data.tagId).toBe(tagId)
    })
  })

  // -------------------------------------------------------------------------
  // enqueueAttach
  // -------------------------------------------------------------------------
  describe("enqueueAttach", () => {
    test("calls defaultQueue.add exactly once with syncTag job name and attach payload", async () => {
      // Arrange
      const props = {
        workspaceId: WORKSPACE_ID,
        contactId: CONTACT_ID,
        tagId: TAG_ID,
      }

      // Act
      await tagSyncService.enqueueAttach(props)

      // Assert
      expect(mockQueueAdd).toHaveBeenCalledTimes(1)
      expect(mockQueueAdd).toHaveBeenCalledWith(DefaultJobAction.syncTag, {
        type: DefaultJobAction.syncTag,
        data: {
          action: "attach",
          workspaceId: WORKSPACE_ID,
          contactId: CONTACT_ID,
          tagId: TAG_ID,
        },
      })
    })

    test("includes contactId in the payload (required for attach)", async () => {
      await tagSyncService.enqueueAttach({
        workspaceId: WORKSPACE_ID,
        contactId: CONTACT_ID,
        tagId: TAG_ID,
      })

      const payload = mockQueueAdd.mock.calls[0]?.[1] as Record<string, unknown>
      const data = payload?.data as Record<string, unknown>
      expect(data.contactId).toBe(CONTACT_ID)
    })

    test("does not enqueue more than one job", async () => {
      await tagSyncService.enqueueAttach({
        workspaceId: WORKSPACE_ID,
        contactId: CONTACT_ID,
        tagId: TAG_ID,
      })

      expect(mockQueueAdd).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // enqueueDetach
  // -------------------------------------------------------------------------
  describe("enqueueDetach", () => {
    test("calls defaultQueue.add exactly once with syncTag job name and detach payload", async () => {
      // Arrange
      const props = {
        workspaceId: WORKSPACE_ID,
        contactId: CONTACT_ID,
        tagId: TAG_ID,
      }

      // Act
      await tagSyncService.enqueueDetach(props)

      // Assert
      expect(mockQueueAdd).toHaveBeenCalledTimes(1)
      expect(mockQueueAdd).toHaveBeenCalledWith(DefaultJobAction.syncTag, {
        type: DefaultJobAction.syncTag,
        data: {
          action: "detach",
          workspaceId: WORKSPACE_ID,
          contactId: CONTACT_ID,
          tagId: TAG_ID,
        },
      })
    })

    test("uses 'detach' action discriminator — not 'attach' or any other value", async () => {
      await tagSyncService.enqueueDetach({
        workspaceId: WORKSPACE_ID,
        contactId: CONTACT_ID,
        tagId: TAG_ID,
      })

      const payload = mockQueueAdd.mock.calls[0]?.[1] as Record<string, unknown>
      const data = payload?.data as Record<string, unknown>
      expect(data.action).toBe("detach")
      expect(data.action).not.toBe("attach")
    })

    test("includes contactId in the payload (required for detach)", async () => {
      await tagSyncService.enqueueDetach({
        workspaceId: WORKSPACE_ID,
        contactId: CONTACT_ID,
        tagId: TAG_ID,
      })

      const payload = mockQueueAdd.mock.calls[0]?.[1] as Record<string, unknown>
      const data = payload?.data as Record<string, unknown>
      expect(data.contactId).toBe(CONTACT_ID)
    })

    test("does not enqueue more than one job", async () => {
      await tagSyncService.enqueueDetach({
        workspaceId: WORKSPACE_ID,
        contactId: CONTACT_ID,
        tagId: TAG_ID,
      })

      expect(mockQueueAdd).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // enqueueDelete
  // -------------------------------------------------------------------------
  describe("enqueueDelete", () => {
    test("calls defaultQueue.add exactly once with syncTag job name and delete payload", async () => {
      // Arrange
      const props = { workspaceId: WORKSPACE_ID, tagId: TAG_ID }

      // Act
      await tagSyncService.enqueueDelete(props)

      // Assert
      expect(mockQueueAdd).toHaveBeenCalledTimes(1)
      expect(mockQueueAdd).toHaveBeenCalledWith(DefaultJobAction.syncTag, {
        type: DefaultJobAction.syncTag,
        data: {
          action: "delete",
          workspaceId: WORKSPACE_ID,
          tagId: TAG_ID,
        },
      })
    })

    test("uses 'delete' action discriminator", async () => {
      await tagSyncService.enqueueDelete({
        workspaceId: WORKSPACE_ID,
        tagId: TAG_ID,
      })

      const payload = mockQueueAdd.mock.calls[0]?.[1] as Record<string, unknown>
      const data = payload?.data as Record<string, unknown>
      expect(data.action).toBe("delete")
    })

    test("delete payload does not include contactId", async () => {
      await tagSyncService.enqueueDelete({
        workspaceId: WORKSPACE_ID,
        tagId: TAG_ID,
      })

      const payload = mockQueueAdd.mock.calls[0]?.[1] as Record<string, unknown>
      const data = payload?.data as Record<string, unknown>
      expect(data).not.toHaveProperty("contactId")
    })

    test("does not enqueue more than one job", async () => {
      await tagSyncService.enqueueDelete({
        workspaceId: WORKSPACE_ID,
        tagId: TAG_ID,
      })

      expect(mockQueueAdd).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // enqueueChannelScan
  // -------------------------------------------------------------------------
  describe("enqueueChannelScan", () => {
    test("calls defaultQueue.add exactly once with syncChannelLabels job name and scan payload", async () => {
      // Arrange
      const props = {
        workspaceId: WORKSPACE_ID,
        channelType: "messenger" as const,
        integrationId: INTEGRATION_ID,
      }

      // Act
      await tagSyncService.enqueueChannelScan(props)

      // Assert
      expect(mockQueueAdd).toHaveBeenCalledTimes(1)
      expect(mockQueueAdd).toHaveBeenCalledWith(
        DefaultJobAction.syncChannelLabels,
        {
          type: DefaultJobAction.syncChannelLabels,
          data: {
            workspaceId: WORKSPACE_ID,
            channelType: "messenger",
            integrationId: INTEGRATION_ID,
          },
        },
      )
    })

    test("uses syncChannelLabels job — not syncTag", async () => {
      await tagSyncService.enqueueChannelScan({
        workspaceId: WORKSPACE_ID,
        channelType: "messenger" as const,
        integrationId: INTEGRATION_ID,
      })

      const [jobName] = mockQueueAdd.mock.calls[0] ?? []
      expect(jobName).toBe(DefaultJobAction.syncChannelLabels)
      expect(jobName).not.toBe(DefaultJobAction.syncTag)
    })

    test("passes channelType verbatim into the payload", async () => {
      await tagSyncService.enqueueChannelScan({
        workspaceId: WORKSPACE_ID,
        channelType: "zalo" as const,
        integrationId: INTEGRATION_ID,
      })

      const payload = mockQueueAdd.mock.calls[0]?.[1] as Record<string, unknown>
      const data = payload?.data as Record<string, unknown>
      expect(data.channelType).toBe("zalo")
    })

    test("passes integrationId verbatim into the payload", async () => {
      const integrationId = "int-specific-99"
      await tagSyncService.enqueueChannelScan({
        workspaceId: WORKSPACE_ID,
        channelType: "messenger" as const,
        integrationId,
      })

      const payload = mockQueueAdd.mock.calls[0]?.[1] as Record<string, unknown>
      const data = payload?.data as Record<string, unknown>
      expect(data.integrationId).toBe(integrationId)
    })

    test("does not enqueue more than one job", async () => {
      await tagSyncService.enqueueChannelScan({
        workspaceId: WORKSPACE_ID,
        channelType: "messenger" as const,
        integrationId: INTEGRATION_ID,
      })

      expect(mockQueueAdd).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // Cross-method isolation: calling one method does not leak into another
  // -------------------------------------------------------------------------
  describe("isolation between methods", () => {
    test("each method enqueues independently — calling two methods results in two total add() calls", async () => {
      // Arrange + Act
      await tagSyncService.enqueueCreate({
        workspaceId: WORKSPACE_ID,
        tagId: TAG_ID,
      })
      await tagSyncService.enqueueDelete({
        workspaceId: WORKSPACE_ID,
        tagId: TAG_ID,
      })

      // Assert
      expect(mockQueueAdd).toHaveBeenCalledTimes(2)
      const [firstJobName] = mockQueueAdd.mock.calls[0] ?? []
      const [secondJobName] = mockQueueAdd.mock.calls[1] ?? []
      expect(firstJobName).toBe(DefaultJobAction.syncTag)
      expect(secondJobName).toBe(DefaultJobAction.syncTag)
    })

    test("enqueueCreate and enqueueChannelScan use different job names", async () => {
      await tagSyncService.enqueueCreate({
        workspaceId: WORKSPACE_ID,
        tagId: TAG_ID,
      })
      await tagSyncService.enqueueChannelScan({
        workspaceId: WORKSPACE_ID,
        channelType: "messenger" as const,
        integrationId: INTEGRATION_ID,
      })

      expect(mockQueueAdd).toHaveBeenCalledTimes(2)
      const [firstJobName] = mockQueueAdd.mock.calls[0] ?? []
      const [secondJobName] = mockQueueAdd.mock.calls[1] ?? []
      expect(firstJobName).toBe(DefaultJobAction.syncTag)
      expect(secondJobName).toBe(DefaultJobAction.syncChannelLabels)
    })
  })
})

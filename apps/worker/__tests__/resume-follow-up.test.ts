import { beforeEach, describe, expect, test, vi } from "vitest"

const { contactInboxService, integrationQueueAdd, smartDelayService } =
  vi.hoisted(() => ({
    contactInboxService: {
      hasIncomingMessageSince: vi.fn(),
    },
    integrationQueueAdd: vi.fn(),
    smartDelayService: {
      findById: vi.fn(),
      markCanceled: vi.fn(),
    },
  }))

vi.mock("@chatbotx.io/business/contact-inbox", () => ({ contactInboxService }))

vi.mock("@chatbotx.io/business/smart-delay", () => ({ smartDelayService }))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    resumeFollowUp: "resumeFollowUp",
    sendFlow: "sendFlow",
  },
  integrationQueue: {
    add: integrationQueueAdd,
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

const { runFollowUpResume } = await import(
  "../src/integration/handlers/follow-up"
)

const followUpRow = {
  id: "smart-delay-1",
  workspaceId: "workspace-1",
  flowId: "flow-1",
  flowVersionId: "flow-version-1",
  contactInboxId: "contact-inbox-1",
  conversationId: "conversation-1",
  nodeId: "next-node",
  stepId: "step-1",
  type: "followUp",
  createdAt: new Date("2026-07-16T00:00:00.000Z"),
  triggerAt: new Date("2026-07-16T00:01:00.000Z"),
  status: "completed",
}

describe("runFollowUpResume", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    smartDelayService.findById.mockResolvedValue(followUpRow)
    contactInboxService.hasIncomingMessageSince.mockResolvedValue(false)
    integrationQueueAdd.mockResolvedValue(undefined)
  })

  test("cancels the follow-up without sending when the contact replied", async () => {
    contactInboxService.hasIncomingMessageSince.mockResolvedValueOnce(true)

    await runFollowUpResume({ smartDelayId: "smart-delay-1" })

    expect(contactInboxService.hasIncomingMessageSince).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactInboxId: "contact-inbox-1",
      since: followUpRow.createdAt,
    })
    expect(smartDelayService.markCanceled).toHaveBeenCalledWith({
      id: "smart-delay-1",
    })
    expect(integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("continues the flow when the contact stayed silent", async () => {
    await runFollowUpResume({ smartDelayId: "smart-delay-1" })

    expect(integrationQueueAdd).toHaveBeenCalledWith("sendFlow", {
      type: "sendFlow",
      data: {
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        nodeId: "next-node",
      },
    })
    expect(smartDelayService.markCanceled).not.toHaveBeenCalled()
  })

  test.each([
    null,
    { ...followUpRow, type: "waitNode" },
    { ...followUpRow, nodeId: null },
  ])("no-ops for non-resumable row %#", async (row) => {
    smartDelayService.findById.mockResolvedValueOnce(row)

    await runFollowUpResume({ smartDelayId: "smart-delay-1" })

    expect(contactInboxService.hasIncomingMessageSince).not.toHaveBeenCalled()
    expect(integrationQueueAdd).not.toHaveBeenCalled()
    expect(smartDelayService.markCanceled).not.toHaveBeenCalled()
  })
})

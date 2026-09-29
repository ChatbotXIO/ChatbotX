import { channelTypes } from "@chatbotx.io/database/partials"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  broadcastToWorkspaceParty: vi.fn(),
  recordPermanentGrant: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: mocks.broadcastToWorkspaceParty,
  whatsappCallPermissionService: {
    recordPermanentGrant: mocks.recordPermanentGrant,
  },
}))

vi.mock("../src/lib/logger", () => ({ logger: mocks.logger }))

const { reconcileChannelSendError } = await import(
  "../src/chat/handlers/channel-send-error-reconcilers"
)

const conversation = { id: "conv-1", workspaceId: "ws-1" }
const whatsappInbox = { id: "ci-1", channel: channelTypes.enum.whatsapp }
const permissionRequestAttrs = { type: "whatsapp_call_permission_request" }

const channelError = (code: number) =>
  new ChannelError(`(#${code}) channel error`, ChannelErrorCategory.UNKNOWN, {
    code,
  })

describe("reconcileChannelSendError", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.recordPermanentGrant.mockResolvedValue(undefined)
    mocks.broadcastToWorkspaceParty.mockResolvedValue(undefined)
  })

  test("records a permanent grant, refreshes open threads and reports reconciled for a WhatsApp call_permission_request failing with 138017", async () => {
    const isReconciled = await reconcileChannelSendError({
      error: channelError(138_017),
      conversation,
      contactInbox: whatsappInbox,
      contentAttributes: permissionRequestAttrs,
    })

    expect(isReconciled).toBe(true)
    expect(mocks.recordPermanentGrant).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      grantedAt: expect.any(Date),
    })
    expect(mocks.broadcastToWorkspaceParty).toHaveBeenCalledWith("ws-1", {
      eventType: "whatsappCallPermissionUpdated",
      data: { conversationId: "conv-1" },
    })
  })

  test("returns false for a channel with no registered reconciler", async () => {
    const isReconciled = await reconcileChannelSendError({
      error: channelError(138_017),
      conversation,
      contactInbox: { id: "ci-1", channel: channelTypes.enum.messenger },
      contentAttributes: permissionRequestAttrs,
    })

    expect(isReconciled).toBe(false)
    expect(mocks.recordPermanentGrant).not.toHaveBeenCalled()
    expect(mocks.broadcastToWorkspaceParty).not.toHaveBeenCalled()
  })

  test("ignores a message that is not a call_permission_request", async () => {
    const isReconciled = await reconcileChannelSendError({
      error: channelError(138_017),
      conversation,
      contactInbox: whatsappInbox,
      contentAttributes: { type: "whatsapp_call" },
    })

    expect(isReconciled).toBe(false)
    expect(mocks.recordPermanentGrant).not.toHaveBeenCalled()
  })

  test("ignores a different Meta error code (still a real send failure)", async () => {
    const isReconciled = await reconcileChannelSendError({
      error: channelError(131_026),
      conversation,
      contactInbox: whatsappInbox,
      contentAttributes: permissionRequestAttrs,
    })

    expect(isReconciled).toBe(false)
    expect(mocks.recordPermanentGrant).not.toHaveBeenCalled()
  })

  test("ignores a non-ChannelError throw", async () => {
    const isReconciled = await reconcileChannelSendError({
      error: new Error("boom"),
      conversation,
      contactInbox: whatsappInbox,
      contentAttributes: permissionRequestAttrs,
    })

    expect(isReconciled).toBe(false)
    expect(mocks.recordPermanentGrant).not.toHaveBeenCalled()
  })

  test("propagates a failure to store the grant so the send is retried rather than silently lost", async () => {
    mocks.recordPermanentGrant.mockRejectedValue(new Error("db down"))

    await expect(
      reconcileChannelSendError({
        error: channelError(138_017),
        conversation,
        contactInbox: whatsappInbox,
        contentAttributes: permissionRequestAttrs,
      }),
    ).rejects.toThrow("db down")
    expect(mocks.broadcastToWorkspaceParty).not.toHaveBeenCalled()
  })
})

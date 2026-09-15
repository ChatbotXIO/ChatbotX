import { channelTypes } from "@chatbotx.io/database/partials"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  upsertForContactInbox: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallPermissionRepository: {
    upsertForContactInbox: mocks.upsertForContactInbox,
  },
}))

vi.mock("../src/lib/logger", () => ({ logger: mocks.logger }))

const { recordCallPermissionAlreadyGranted } = await import(
  "../src/chat/handlers/whatsapp-call-permission-grant"
)

const whatsappInbox = { id: "ci-1", channel: channelTypes.enum.whatsapp }
const permissionRequestAttrs = { type: "whatsapp_call_permission_request" }

const error138017 = () =>
  new ChannelError("(#138017) already approved", ChannelErrorCategory.UNKNOWN, {
    code: 138_017,
  })

describe("recordCallPermissionAlreadyGranted", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.upsertForContactInbox.mockResolvedValue(undefined)
  })

  test("records a permanent grant and reports handled for a whatsapp call_permission_request + 138017", async () => {
    const handled = await recordCallPermissionAlreadyGranted({
      error: error138017(),
      workspaceId: "ws-1",
      contactInbox: whatsappInbox,
      contentAttributes: permissionRequestAttrs,
    })

    expect(handled).toBe(true)
    expect(mocks.upsertForContactInbox).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      response: "accept",
      isPermanent: true,
      expiresAt: null,
      respondedAt: expect.any(Date),
    })
  })

  test("ignores a non-whatsapp channel", async () => {
    const handled = await recordCallPermissionAlreadyGranted({
      error: error138017(),
      workspaceId: "ws-1",
      contactInbox: { id: "ci-1", channel: channelTypes.enum.messenger },
      contentAttributes: permissionRequestAttrs,
    })

    expect(handled).toBe(false)
    expect(mocks.upsertForContactInbox).not.toHaveBeenCalled()
  })

  test("ignores a message that is not a call_permission_request", async () => {
    const handled = await recordCallPermissionAlreadyGranted({
      error: error138017(),
      workspaceId: "ws-1",
      contactInbox: whatsappInbox,
      contentAttributes: { type: "whatsapp_call" },
    })

    expect(handled).toBe(false)
    expect(mocks.upsertForContactInbox).not.toHaveBeenCalled()
  })

  test("ignores a different Meta error code (still a real send failure)", async () => {
    const handled = await recordCallPermissionAlreadyGranted({
      error: new ChannelError(
        "(#131026) undeliverable",
        ChannelErrorCategory.UNKNOWN,
        {
          code: 131_026,
        },
      ),
      workspaceId: "ws-1",
      contactInbox: whatsappInbox,
      contentAttributes: permissionRequestAttrs,
    })

    expect(handled).toBe(false)
    expect(mocks.upsertForContactInbox).not.toHaveBeenCalled()
  })

  test("ignores a non-ChannelError throw", async () => {
    const handled = await recordCallPermissionAlreadyGranted({
      error: new Error("boom"),
      workspaceId: "ws-1",
      contactInbox: whatsappInbox,
      contentAttributes: permissionRequestAttrs,
    })

    expect(handled).toBe(false)
    expect(mocks.upsertForContactInbox).not.toHaveBeenCalled()
  })
})
